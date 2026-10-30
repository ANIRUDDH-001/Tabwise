// R2-L2 S2: Node page source over the S1 recorder (design §3.5, §4.3, §8.2). read() performs one
// evaluate(() => window.__tabwiseR2Journal()), writes the bounded delta record to the 'page-reads' lane,
// applies the identity, trust, prefix and R2 key-accounting refusals, and returns the raw object unchanged to
// the merged R2-L1 adapter (createPageJournal), which latches any throw. Every refusal is sticky here too.
// No session calls this yet; frozen R1 (pageAck, judgeKeys) is unchanged. Whether NVDA itself synthesizes
// Control or Insert keydowns is unmeasured (P-3).
import {createHash} from 'node:crypto';
import {SUPPORTED_PRESS} from '../../scripts/tabwise/input-policy.mjs';

// A pending Shift must resolve within ACK_MS + RECEIPT_SETTLE_MS (capture.mjs:10,12; 1000 + 1000 ms).
export const SHIFT_PENDING_MS = 2000;
const SHIFT_TAB_VKS = '[160,9]';
const TRUSTED = new Set(['keydown', 'focusin', 'focusout']);
const BASE = new Set(['session', 't', 'active', 'state', 'events', 'page_reported']);
const text = value => typeof value === 'string' && value.length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
// Same canonical form as page-journal.mjs, so prefix hashes match what the adapter compared.
const canonical = value => JSON.stringify(value, (k, v) => object(v) ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw Error(message); };

function journeyErrors(journey) {
  if (!Array.isArray(journey) || !journey.length || journey.length > 1000 ||
    journey.some(a => !object(a) || typeof a.action !== 'string' || !/^a[0-9]{1,12}$/.test(a.action) || !SUPPORTED_PRESS.includes(a.press)) ||
    new Set(journey.map(a => a.action)).size !== journey.length) fail('page source: invalid journey');
}

/**
 * createR2PageSource({evaluate, session, served:{title,url}, journey:[{action,press}], intents, writer, now})
 * -> frozen {read(), pending(), prefixes(), markFinal(), flush()}.
 * intents() returns the token intents the ledger has seen, in order, as [{action, keys:[vk...]}].
 * writer.append(lane, record) and writer.put(name, text) may be asynchronous; both are awaited.
 * markFinal() makes the next read refuse any unresolved pending Shift; flush() writes coalesced unchanged reads.
 */
export function createR2PageSource({evaluate, session, served, journey, intents, writer, now}) {
  if (typeof evaluate !== 'function' || typeof intents !== 'function' || typeof now !== 'function' ||
    typeof writer?.append !== 'function' || typeof writer?.put !== 'function') fail('page source: missing bindings');
  if (!text(session) || !object(served) || !text(served.title) || !text(served.url)) fail('page source: invalid served identity');
  journeyErrors(journey);
  const actions = journey.map(({action, press}) => ({action, press}));
  let previous = null, prevCanon = [], failure = null, busy = false, final = false, reads = 0, lastTime = -Infinity;
  let storedState = null, storedHeader = null, unchanged = null;
  let prefixHash = createHash('sha256').update('['), hashed = 0;
  let acct = {current: null, seen: 0, pending: null, main: [], prefixes: []};

  const stamp = () => {
    const t = now();
    if (!Number.isFinite(t) || t < 0 || t < lastTime) fail('invalid or regressing Node clock');
    lastTime = t; return t;
  };
  const header = raw => Object.fromEntries(Object.keys(raw).filter(k => !BASE.has(k)).sort().map(k => [k, raw[k]]));
  const flushUnchanged = async () => {
    if (!unchanged) return;
    const record = unchanged; unchanged = null;
    await writer.append('page-reads', record);
  };

  // Pure over the accounting state: returns the next state, or the refusal reason.
  function account(raw, fresh, at) {
    const next = structuredClone(acct);
    let seen;
    try { seen = structuredClone(intents()); } catch (error) { return {reason: `intent history unreadable: ${error?.message ?? error}`}; }
    if (!Array.isArray(seen) || seen.length < next.seen || seen.length > actions.length) return {reason: 'intent history invalid'};
    for (let i = 0; i < seen.length; i++) {
      if (!object(seen[i]) || seen[i].action !== actions[i].action || !Array.isArray(seen[i].keys)) return {reason: 'intent does not follow the journey'};
    }
    if (seen.length) next.current = seen.length - 1;
    next.seen = seen.length;
    const shiftTabIntent = next.current !== null && JSON.stringify(seen[next.current].keys) === SHIFT_TAB_VKS;
    for (const event of fresh) {
      if (event?.type !== 'keydown') continue;
      const {seq, key} = event, press = next.current === null ? null : actions[next.current].press;
      const action = next.current === null ? null : actions[next.current].action;
      if (key === 'Control' || key === 'Insert') return {reason: `${key} keydown at seq ${seq} refused`};
      if (key === 'Shift') {
        const plain = event.shift === true && event.ctrl === false && event.alt === false && event.meta === false && event.repeat === false;
        if (!plain || next.pending || press !== 'Shift+Tab' || !shiftTabIntent || next.main.includes(action)) return {reason: `Shift keydown at seq ${seq} refused`};
        next.pending = {seq, action, observed_at: at};
        continue;
      }
      if (key === 'Tab' && event.shift === true) {
        if (press !== 'Shift+Tab') return {reason: `shifted Tab at seq ${seq} outside a Shift+Tab action`};
        if (!next.prefixes.some(p => p.action === action)) next.prefixes.push({action, seq, prefix: next.pending ? 'observed' : 'not-observed'});
        next.pending = null;
      } else if (next.pending) return {reason: `keydown ${JSON.stringify(key)} at seq ${seq} follows pending Shift at seq ${next.pending.seq}`};
      if (action && !next.main.includes(action)) next.main.push(action);
    }
    if (next.pending && at - next.pending.observed_at > SHIFT_PENDING_MS) return {reason: `Shift at seq ${next.pending.seq} unresolved`};
    if (next.pending && final) return {reason: `Shift at seq ${next.pending.seq} unresolved at final read`};
    return {next};
  }

  function examine(raw, at) {
    if (!object(raw) || !Array.isArray(raw.events)) return {reason: 'malformed raw read', prefix: false};
    const canon = raw.events.map(canonical);
    if (previous && (canon.length < prevCanon.length || prevCanon.some((c, i) => c !== canon[i]))) {
      return {reason: 'raw read is not a prefix-extension of the previous raw read', prefix: false};
    }
    const fresh = raw.events.slice(prevCanon.length), base = {prefix: true, canon, fresh};
    if (raw.session !== session) return {...base, reason: 'wrong session'};
    if (raw.network_restrictions !== true) return {...base, reason: 'network restrictions not reported'};
    if (raw.title !== served.title) return {...base, reason: 'title differs from served identity'};
    if (raw.url !== served.url) return {...base, reason: 'url differs from served identity'};
    if (raw.state_overflow !== false) return {...base, reason: 'state overflow'};
    if (raw.page_reported_overflow !== false) return {...base, reason: 'page-reported data overflow'};
    const untrusted = fresh.find(e => TRUSTED.has(e?.type) && e.isTrusted !== true);
    if (untrusted) return {...base, reason: `untrusted ${untrusted.type} at seq ${untrusted.seq}`};
    const result = account(raw, fresh, at);
    return result.reason ? {...base, reason: result.reason} : {...base, next: result.next};
  }

  async function persist(raw, verdict, n, requested_at, returned_at) {
    const refused = Boolean(verdict.reason);
    const quiet = !refused && previous && verdict.fresh.length === 0 && raw.t >= previous.t &&
      canonical(raw.active) === canonical(previous.active) && canonical(raw.state) === canonical(previous.state) &&
      canonical(raw.page_reported) === canonical(previous.page_reported) && canonical(header(raw)) === canonical(header(previous));
    if (quiet) {
      if (unchanged) Object.assign(unchanged, {reads: unchanged.reads + 1, read_last: n, last_returned_at: returned_at, page_t_last: raw.t});
      else unchanged = {kind: 'unchanged', reads: 1, read_first: n, read_last: n, first_requested_at: requested_at,
        last_returned_at: returned_at, page_t_first: raw.t, page_t_last: raw.t};
      return;
    }
    await flushUnchanged();
    const record = {kind: 'read', read: n, requested_at, returned_at};
    if (verdict.prefix) {
      for (const c of verdict.canon.slice(hashed)) { if (hashed++) prefixHash.update(','); prefixHash.update(c); }
      const stateCanon = canonical(raw.state), headCanon = canonical(header(raw));
      const reported = raw.page_reported, before = previous?.page_reported;
      const extends_ = Array.isArray(reported) && Array.isArray(before) && before.length <= reported.length &&
        before.every((v, i) => canonical(v) === canonical(reported[i]));
      Object.assign(record, {session: raw.session, page_t: raw.t, events_from: prevCanon.length, events_to: raw.events.length,
        new_events: verdict.fresh, active: raw.active, title_ok: raw.title === served.title, url_ok: raw.url === served.url,
        state_same: stateCanon === storedState, state: stateCanon === storedState ? null : raw.state, state_sha256: sha256(stateCanon),
        header: headCanon === storedHeader ? null : header(raw),
        prefix_sha256: prefixHash.copy().update(']').digest('hex'),
        page_reported_from: Array.isArray(reported) ? (extends_ ? before.length : 0) : null,
        page_reported_new: Array.isArray(reported) ? reported.slice(extends_ ? before.length : 0) : reported ?? null,
        shift_prefix: refused ? [] : verdict.next.prefixes.slice(acct.prefixes.length)});
      if (!refused) { storedState = stateCanon; storedHeader = headCanon; }
    }
    if (refused) {
      let body;
      try { body = JSON.stringify(raw ?? null); } catch (error) { body = JSON.stringify({unserializable: String(error?.message ?? error)}); }
      await writer.put('page-rejected.json', body);
      Object.assign(record, {decision: 'refused', reason: verdict.reason, rejected_file: 'page-rejected.json', rejected_sha256: sha256(body)});
    } else Object.assign(record, {decision: 'passed', reason: null});
    await writer.append('page-reads', record);
  }

  const latch = error => (failure ??= Error(/^page source:/.test(error?.message) ? error.message : `page source: ${error?.message ?? error}`));
  return Object.freeze({
    async read() {
      if (failure) throw failure;
      if (busy) throw latch(Error('overlapping reads'));
      busy = true;
      try {
        const n = ++reads, requested_at = stamp();
        let raw, evalError = null;
        try { raw = await evaluate(() => window.__tabwiseR2Journal()); } catch (error) { evalError = error; }
        const returned_at = stamp();
        if (evalError) {
          const reason = `evaluate failed: ${evalError?.message ?? evalError}`;
          await flushUnchanged();
          await writer.append('page-reads', {kind: 'read', read: n, requested_at, returned_at, decision: 'refused', reason});
          fail(reason);
        }
        const verdict = examine(raw, returned_at);
        await persist(raw, verdict, n, requested_at, returned_at);
        if (verdict.reason) fail(verdict.reason);
        if (failure) throw failure;
        previous = structuredClone(raw); prevCanon = verdict.canon; acct = verdict.next;
        return raw;
      } catch (error) { throw latch(error); }
      finally { busy = false; }
    },
    pending: () => acct.pending ? {...acct.pending} : null,
    prefixes: () => acct.prefixes.map(p => ({...p})),
    markFinal() { final = true; },
    async flush() {
      try { await flushUnchanged(); } catch (error) { throw latch(error); }
    },
  });
}

/**
 * serializePageViews(journal) -> frozen {snapshot(), keys(cursor)} routed through one single-flight queue, so
 * captureJourney's snapshot polling and R1's pageAck key polling never overlap on one adapter. A call starts
 * only after the previous one settles; a failed call does not block the queue. The adapter's own overlap
 * refusal is unchanged and remains the backstop for any caller that bypasses this wrapper.
 */
export function serializePageViews(journal) {
  if (typeof journal?.snapshot !== 'function' || typeof journal?.keys !== 'function') fail('page source: invalid page journal');
  let tail = Promise.resolve();
  const serial = call => {
    const run = tail.then(call);
    tail = run.then(() => {}, () => {});
    return run;
  };
  return Object.freeze({snapshot: () => serial(() => journal.snapshot()), keys: cursor => serial(() => journal.keys(cursor))});
}
