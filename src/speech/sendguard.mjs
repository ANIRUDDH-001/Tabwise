// D-39 send gate. The vendored Guidepup (vendor/guidepup-0.36.4-r1, see its VENDORED.md) sends keys on
// Windows through two paths only: NVDAClient #sendChord (one NVDA chord per socket write) and
// runVbsScript runSendKeys (one cscript SendKeys character). Each path asks this gate:
//   admit(info)    bounded foreground check, one send at a time, inside an armed action
//   commit(token)  synchronous, in the same turn as the dispatch: still the same action, epoch, fresh check
//   launched(token, cancel)  the OS operation is running; stop() calls cancel (best effort: a key already
//                  handed to the socket or to cscript cannot be recalled; D-40)
//   release(token, {error, ended})  page acknowledgement, settle, post-check
//   settled(token) a launched operation that outlived release has ended
// A stop is sticky and bumps the epoch, so a check that was pending when it came cannot commit.
// kind: protocol, integrity, pre (no key sent), send, ack, post (possibly misdelivered), timeout, stop.
// The codes Guidepup 0.36.4 sends (KeyCodes.js): Shift and Control are the left-hand 160 and 162.
export const VK = Object.freeze({ Tab: 9, Shift: 160, Control: 162, Insert: 45, Space: 32, Enter: 13 });

// Generic and right-hand Shift/Control codes are named too, so no Shift or Control can pass as another key.
const NAMES = Object.freeze({
  9: 'Tab', 13: 'Enter', 32: 'Space', 45: 'Insert',
  16: 'Shift', 160: 'Shift', 161: 'Shift', 17: 'Control', 162: 'Control', 163: 'Control',
});
const MODIFIER = new Set([16, 160, 161, 17, 162, 163]);
const SHIFT = new Set([16, 160, 161]);
const vkName = (vk) => NAMES[vk] ?? (vk >= 65 && vk <= 90 ? String.fromCharCode(vk) : `vk${vk}`);
export function keyName(info) {
  if (info?.path === 'sendkeys') return String(info.char);
  return (info?.keys ?? []).map((k) => vkName(k.vk)).join('+');
}

// What a send should produce in the page's keydown log. null: NVDA consumes it (an NVDA-key chord, or the
// stop-speech Control). { key: null }: reaches the page but cannot be confirmed from it.
const PAGE = Object.freeze({ [VK.Tab]: 'Tab', [VK.Space]: ' ', [VK.Enter]: 'Enter' });
export function pageKeyOf(info) {
  if (info?.path === 'sendkeys') return { key: info.char };
  const vks = (info?.keys ?? []).map((k) => k.vk);
  if (vks.includes(VK.Insert)) return null;
  const main = vks.filter((vk) => !MODIFIER.has(vk)).at(-1);
  if (main === undefined) return null;
  if (!(main in PAGE)) return { key: null, vk: main };
  return { key: PAGE[main], shift: vks.some((vk) => SHIFT.has(vk)) };
}

// NVDA's own control keystrokes (stop-speech Control, the NVDA key) and Shift reach the page's keydown
// log too (T26); they never count for or against an action.
const IGNORED = new Set(['Control', 'Shift', 'Insert']);
const shown = (k) => JSON.stringify(k);
export function judgeKeys(events, expected) {
  const real = events.filter((e) => !IGNORED.has(e.key));
  if (expected === null) return real.length ? [`NVDA-consumed send reached the page as ${real.map((e) => shown(e.key)).join(', ')}`] : [];
  if (expected.key === null) return [`vk ${expected.vk} reaches the page but cannot be confirmed`];
  const want = shown(expected.key);
  if (real.length !== 1) return [`expected ${want} once, saw ${real.length}${real.length ? `: ${real.map((e) => shown(e.key)).join(', ')}` : ''}`];
  if (real[0].key !== expected.key) return [`expected ${want}, saw ${shown(real[0].key)}`];
  if ('shift' in expected && real[0].shift !== expected.shift) return [`expected ${want} with shift ${expected.shift}, saw shift ${real[0].shift}`];
  return [];
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const errText = (e) => e?.message ?? String(e);

// Page acknowledgement over the page's keydown log. read(cursor) returns the events with seq > cursor.
// D-42 (D39-B01): before(token) runs inside admit, right before the send: every key since the cursor must
// be an ignored one, else something unexplained reached the page and the send is refused. The send's window
// then starts there, and every non-ignored key in it must be the expected key exactly once. Nothing is kept
// for a later send, so an earlier stray can never confirm it. Residual (disclosed): an identical stray that
// lands after before() while our own key is lost looks the same as our key. final() reports any key after
// the last acknowledged one.
export function pageAck({ read, ackMs, pollMs = 10 }) {
  let cursor = 0;
  const top = (evs) => Math.max(cursor, ...evs.map((e) => e.seq));
  const readLog = async () => {
    try { return { evs: await read(cursor) }; } catch (e) { return { reasons: [`page key log unreadable: ${errText(e)}`] }; }
  };
  const ack = async (token) => {
    const expected = pageKeyOf(token.info);
    if (expected === null) return { ack: null, reasons: [] };
    if (expected.key === null) return { ack: false, reasons: judgeKeys([], expected) };
    const t0 = performance.now();
    for (;;) {
      const { evs, reasons: unreadable } = await readLog();
      if (unreadable) return { ack: false, reasons: unreadable };
      if (performance.now() - t0 > ackMs) return { ack: false, reasons: [[`page acknowledgement read exceeded ${ackMs} ms`, ...judgeKeys(evs, expected)].join('; ')] };
      if (evs.some((e) => !IGNORED.has(e.key))) {
        const reasons = judgeKeys(evs, expected);
        if (reasons.length) return { ack: false, reasons };
        cursor = top(evs);
        return { ack: true, reasons: [] };
      }
      if (performance.now() - t0 >= ackMs) return { ack: false, reasons: judgeKeys(evs, expected) };
      await delay(pollMs);
    }
  };
  ack.before = async (token) => {
    const { evs, reasons: unreadable } = await readLog();
    if (unreadable) return unreadable;
    const stray = evs.filter((e) => !IGNORED.has(e.key));
    if (stray.length) return stray.map((e) => `page key ${shown(e.key)} before send ${token.id}`);
    cursor = top(evs);
    return [];
  };
  ack.final = async () => {
    try {
      return (await read(cursor)).filter((e) => !IGNORED.has(e.key)).map((e) => `page key ${shown(e.key)} after the last acknowledged send`);
    } catch (e) { return [`page key log unreadable: ${errText(e)}`]; }
  };
  return ack;
}

function bounded(fn, ms) {
  let t;
  return Promise.race([
    Promise.resolve().then(fn).then((value) => ({ value, timedOut: false, error: null }), (e) => ({ value: undefined, timedOut: false, error: errText(e) })),
    new Promise((r) => { t = setTimeout(() => r({ value: undefined, timedOut: true, error: null }), ms); }),
  ]).finally(() => clearTimeout(t));
}

// The gate's own bound on the ack reader is a little longer than the reader's, so the reader's answer
// (with its reasons) normally wins; a reader that hangs still ends at this bound.
const ACK_MARGIN_MS = 200;

export function sendGate({ checkMs = 2000, settleMs = 50, maxAgeMs = 100, ackMs = 1000, writeMs = 2000, sendMs = 5000, killMs = 2000, now = () => performance.now() } = {}) {
  const st = { stopped: false, kind: null, reason: null, misdelivered: false, sends: 0, refused: 0 };
  const acks = { confirmed: 0, missing: 0, unconfirmable: 0 };
  const refusals = [];
  const live = new Map();
  const cancelled = new Set();
  const admissions = new WeakMap();
  let check = null;
  let ackFn = null;
  let integrity = null;
  let intent = null;
  let armed = null;
  let inflight = null;
  let epoch = 0;
  let n = 0;

  const halt = (kind, reason) => {
    if (!st.stopped) Object.assign(st, { stopped: true, kind, reason });
    epoch += 1;
    for (const [tok, cancel] of live) {
      if (cancelled.has(tok)) continue;
      cancelled.add(tok);
      try { cancel(); } catch { /* best effort */ }
    }
    if (inflight && !admissions.get(inflight)?.committed) inflight = null;
  };
  const refuse = (kind, reason) => {
    st.refused += 1;
    refusals.push(reason);
    halt(kind, reason);
    return new Error(`R1_REFUSED: ${reason}`);
  };
  const verdict = async (ctx) => {
    const r = await bounded(() => check(ctx), checkMs);
    if (r.timedOut) return [`foreground check timed out after ${checkMs} ms`];
    if (r.error) return [`foreground check failed: ${r.error}`];
    return Array.isArray(r.value) ? r.value : ['foreground check returned no verdict'];
  };
  const misdelivered = (kind, token, why) => {
    st.misdelivered = true;
    halt(kind, `send ${token.id} (${token.key}) possibly misdelivered: ${why}`);
  };
  const waitFor = async (cond, ms) => {
    const t0 = performance.now();
    while (!cond()) {
      if (performance.now() - t0 >= ms) return { quiet: false };
      await delay(5);
    }
    return { quiet: true };
  };

  return Object.freeze({
    bounds: Object.freeze({ writeMs, sendMs, killMs, ackMs }),
    setCheck(fn) { check = fn; },
    setAck(fn) { ackFn = fn ?? null; },
    setIntegrity(fn) { integrity = fn; },
    onIntent(fn) { intent = fn; },
    arm(label) { if (st.stopped) return null; armed = Object.freeze({ label }); return armed; },
    disarm() { armed = null; },

    async admit(info) {
      const key = keyName(info);
      if (st.stopped) throw refuse(st.kind, `send ${key} refused: gate stopped (${st.reason})`);
      if (!armed) throw refuse('protocol', `send ${key} outside an action`);
      if (inflight) throw refuse('protocol', `send ${n + 1} (${key}) while send ${inflight.id} is in flight`);
      const bad = typeof integrity === 'function' ? integrity() : ['no integrity check set'];
      if (bad.length) throw refuse('integrity', `before send ${n + 1} (${key}): ${bad.join('; ')}`);
      if (typeof ackFn !== 'function') throw refuse('pre', `before send ${n + 1} (${key}): no page acknowledgement reader set`);
      if (typeof ackFn.before !== 'function') throw refuse('pre', `before send ${n + 1} (${key}): no pre-send acknowledgement capability (before)`);
      if (typeof check !== 'function') throw refuse('pre', `before send ${n + 1} (${key}): no foreground check set`);
      const token = Object.freeze({ id: ++n, action: armed, epoch, info, key });
      const auth = { committed: false, released: false, at: null, reader: ackFn, before: ackFn.before, check, integrity };
      admissions.set(token, auth);
      inflight = token;
      intent?.(token);
      // D-43: prepare the page window first. Then measure freshness from BEFORE the foreground
      // request, including its IPC, evidence writes and scheduling; never stamp completion as fresh.
      const r = await bounded(() => auth.before(token), ackMs + ACK_MARGIN_MS);
      const strays = r.timedOut ? [`page key log check timed out after ${ackMs} ms`] : r.error ? [`page key log check failed: ${r.error}`] : Array.isArray(r.value) ? r.value : ['page key log check returned no verdict'];
      const clear = () => { if (inflight === token) inflight = null; };
      if (st.stopped || epoch !== token.epoch) {
        clear();
        throw refuse(st.kind, `send ${token.id} (${key}) refused: gate stopped or epoch changed during its check (${st.reason})`);
      }
      if (armed !== token.action) { clear(); throw refuse('protocol', `send ${token.id} (${key}): action ended during its check`); }
      if (strays.length) { clear(); st.misdelivered = true; throw refuse('ack', `before send ${token.id} (${key}): ${strays.join('; ')}`); }
      auth.at = now();
      const pre = await verdict({ phase: 'pre', send: token.id, action: token.action.label, key });
      if (st.stopped || epoch !== token.epoch || armed !== token.action) {
        clear(); throw refuse(st.kind ?? 'protocol', `send ${token.id} (${key}): gate stopped or action ended during its foreground check`);
      }
      if (pre.length) { clear(); throw refuse('pre', `before send ${token.id} (${key}): ${pre.join('; ')}`); }
      return token;
    },

    commit(token) {
      const fail = (kind, reason) => {
        if (inflight === token) inflight = null;
        st.refused += 1;
        refusals.push(reason);
        halt(kind, reason);
        return false;
      };
      const what = `send ${token?.id} (${token?.key})`;
      const auth = token && admissions.get(token);
      if (!auth || inflight !== token || auth.committed) return fail('protocol', `${what}: commit of a send that is not in flight`);
      if (st.stopped || epoch !== token.epoch) return fail(st.kind ?? 'stop', `${what}: gate stopped before commit`);
      if (armed !== token.action) return fail('protocol', `${what}: action ended before commit`);
      if (ackFn !== auth.reader || ackFn.before !== auth.before || check !== auth.check || integrity !== auth.integrity) return fail('integrity', `${what}: verification capability changed before commit`);
      const bad = integrity();
      if (!Array.isArray(bad) || bad.length) return fail('integrity', `${what}: integrity failed at commit`);
      const age = now() - auth.at;
      if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) return fail('pre', `${what}: check is ${Math.round(age)} ms old, older than ${maxAgeMs} ms`);
      auth.committed = true;
      st.sends += 1;
      return true;
    },

    launched(token, cancel) {
      live.set(token, cancel);
      if (st.stopped) { cancelled.add(token); try { cancel(); } catch { /* best effort */ } }
    },

    async release(token, { error = null, ended = true } = {}) {
      const auth = token && admissions.get(token);
      if (!auth?.committed || auth.released || inflight !== token) throw refuse('protocol', 'release of an unknown or finished send');
      auth.released = true;
      if (ended) live.delete(token);
      if (error) misdelivered('send', token, error);
      if (ackFn !== auth.reader || ackFn.before !== auth.before || check !== auth.check || integrity !== auth.integrity) misdelivered('integrity', token, 'verification capability changed during a send');
      const r = await bounded(() => auth.reader(token), ackMs + ACK_MARGIN_MS);
      const v = r.value;
      const valid = !r.timedOut && !r.error && Array.isArray(v?.reasons) && v.reasons.length === 0;
      const consumed = pageKeyOf(token.info) === null;
      if (valid && !consumed && v.ack === true) acks.confirmed += 1;
      else if (valid && consumed && v.ack === null) acks.unconfirmable += 1;
      else {
        acks.missing += 1;
        const why = r.timedOut ? `page acknowledgement timed out after ${ackMs} ms` : r.error ? `page acknowledgement failed: ${r.error}` : (Array.isArray(v?.reasons) ? v.reasons.join('; ') : '') || 'invalid or missing acknowledgement for this key class';
        misdelivered('ack', token, why);
      }
      await delay(settleMs);
      const post = await verdict({ phase: 'post', send: token.id, action: token.action.label, key: token.key });
      if (post.length) misdelivered('post', token, post.join('; '));
      if (ended && inflight === token) inflight = null;
    },

    settled(token) {
      live.delete(token);
      if (inflight === token) inflight = null;
    },

    stop(reason, kind = 'stop') { if (kind === 'ack') st.misdelivered = true; halt(kind, reason); },
    idle: (ms) => waitFor(() => !inflight, ms),
    quiesce: (ms) => waitFor(() => !inflight && live.size === 0, ms),
    isStopped: () => st.stopped,
    status: () => ({ ...st, refusals: [...refusals], live: live.size, acks: { ...acks } }),
  });
}
