// W3/W4 (spec 2026-11-02, amendments A-C): the single lifecycle owner of one R2 page. Capability-free: it imports
// nothing, launches nothing and stops nothing itself. The session creates it after its brand check and passes it to
// composeR2Page as the required `lifecycle` handle. It owns three things:
//   - resource slots (nvda, browser, observer, foreground): acquired, released or retained only through it. A slot
//     ends 'released' or 'never-acquired' (clean), or in a non-clean state that requires containment
//     (CONTAINMENT_REQUIRED:<slot>:<state>); it never claims that cleanup it cannot observe completed.
//   - operations: every callback that can reach the evidence writer runs as an op, so finalize can wait for it.
//   - the producer-write boundary: finalize closes the bound writer synchronously, settles, appends one diagnostic
//     lifecycle event and only then seals. Every later write, op or seal attempt is refused and counted (sticky).
// Timing: the NVDA abandon (T1) and orphan (T2) bounds are monotonic escalation triggers taken from t0, immediately
// before the raw start, and never reset; they are not termination proofs. Nothing is clean once the page guard
// deadline has passed, and settlement never waits past it; the coordinator's child deadline stays authoritative.
// Weak keys retain neither discarded writers nor lifecycle closures. Tokens identify owners only.
const WRITER_OWNERS = new WeakMap();
const SCHEMA = 'tabwise-r2-lifecycle/1';
const DEFAULTS = Object.freeze({nvdaAbandonMs: 40000, nvdaOrphanMs: 52000, workMs: 540000, settleMs: 60000, guardMs: 600000, opCap: 256});
const CLEAN = ['released', 'never-acquired'];
const STICKY_KEPT = 16, REASON_CAP = 512, REASONS = 64;

const message = error => error?.message ?? String(error);
const cap = text => (text.length > REASON_CAP ? `${text.slice(0, REASON_CAP - 12)} [truncated]` : text);

/**
 * createR2Lifecycle({pageStart, now?, stopped?, ...bounds}) -> frozen {bounds, bindWriter, op, acquire, release, retain,
 * slot, pending, status, finalize}. pageStart: the monotonic time the page began (now() units). stopped(): whether the
 * page's send gate is stopped. finalize({incomplete, fallback}) resolves {clean, sealed, error, reasons, record} once.
 */
export function createR2Lifecycle(options = {}) {
  const {pageStart, now = () => performance.now(), stopped = () => false} = options;
  if (!Number.isFinite(pageStart)) throw Error('lifecycle: pageStart must be a monotonic time');
  const bounds = {};
  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    const value = options[key] ?? fallback;
    if (!Number.isSafeInteger(value) || value <= 0) throw Error(`lifecycle: ${key} must be a positive integer`);
    bounds[key] = value;
  }
  if (bounds.guardMs > DEFAULTS.guardMs) throw Error(`lifecycle: guard bound must be at most the ${DEFAULTS.guardMs} ms page guard`);
  if (bounds.workMs >= bounds.guardMs) throw Error('lifecycle: work limit must end before the guard');
  if (bounds.nvdaOrphanMs < bounds.nvdaAbandonMs) throw Error('lifecycle: NVDA orphan trigger precedes the abandon trigger');
  Object.freeze(bounds);
  const at = t => Math.round(t - pageStart);
  const owner = {};
  const slots = new Map(), active = new Map(), counts = {}, sticky = [];
  let seq = 0, stickyCount = 0, closed = false, raw = null, bound = null, finalizing = null, finalClean = null;

  const stick = text => { stickyCount++; if (sticky.length < STICKY_KEPT) sticky.push(cap(text)); };
  const refuse = text => { stick(text); return Error(`r2 lifecycle: ${text}`); };
  const late = target => { stick(`write after finalize: ${target}`); throw Error(`r2 lifecycle: producer writes closed (${target})`); };
  const entry = name => {
    if (!slots.has(name)) slots.set(name, {state: 'never-acquired', why: null, t0: null, abandonAt: null, orphanAt: null, op: null, release: null});
    return slots.get(name);
  };

  // An operation is pending from registration until it settles; a bound rejects the caller but never settles the op.
  const op = (label, fn, {boundMs, orphanAt} = {}) => {
    if (closed) return Promise.reject(refuse(`operation after finalize: ${label}`));
    if (typeof fn !== 'function') return Promise.reject(refuse(`operation ${label} is not a function`));
    if (active.size >= bounds.opCap) return Promise.reject(refuse(`operation cap ${bounds.opCap} reached: ${label}`));
    const id = `${label}#${++seq}`;
    counts[label] = (counts[label] ?? 0) + 1;
    const operation = Promise.resolve().then(fn);
    const record = {id, orphanAt: orphanAt ?? null, done: operation.then(() => {}, () => {})};
    active.set(id, record);
    record.done.then(() => active.delete(id));
    if (!boundMs) return operation;
    let timer;
    return Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`${label}: timed out after ${boundMs} ms`)), boundMs); })])
      .finally(() => clearTimeout(timer));
  };

  // acquire: t0 is taken immediately before fn; the abandon and orphan times are fixed from it and never reset.
  const acquire = (name, fn, {label = `${name} acquire`, boundMs, orphanMs} = {}) => {
    const s = entry(name);
    if (s.state !== 'never-acquired') return Promise.reject(refuse(`${name} already acquired (${s.state})`));
    s.state = 'acquiring';
    s.t0 = now();
    s.abandonAt = boundMs ? s.t0 + boundMs : null;
    s.orphanAt = orphanMs ? s.t0 + orphanMs : null;
    let abandoned = false;
    const operation = op(label, fn, {orphanAt: s.orphanAt ?? undefined});
    operation.then(() => { s.state = abandoned ? 'orphaned' : 'owned'; }, () => { s.state = 'rejected-unconfirmed'; });
    if (!boundMs) return operation;
    let timer;
    return Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => { abandoned = true; reject(Error(`${label}: abandoned after ${boundMs} ms (escalation trigger, not a termination proof)`)); }, boundMs);
    })]).finally(() => clearTimeout(timer));
  };

  // release: memoized per slot. Only an owned (or late-acquired, orphaned) slot is released; a retained, unsettled or
  // rejected acquisition is never released, so no stop follows a start that did not resolve.
  const release = (name, fn, {label = `${name} release`, boundMs} = {}) => {
    const s = entry(name);
    if (s.release) return s.release;
    if (s.state === 'retained') return Promise.reject(Error(`${name} retained: ${s.why}; not released`));
    if (!['owned', 'orphaned'].includes(s.state)) return Promise.reject(Error(`${name} not owned (${s.state}); not released`));
    s.state = 'releasing';
    // Cleanup still runs after finalize (a late-acquired resource is closed), outside the op registry: it reaches no
    // writer and cannot change the sealed record, which already reported the slot as not released.
    const operation = closed ? Promise.resolve().then(fn) : op(label, fn);
    operation.then(() => { s.state = 'released'; }, () => { s.state = 'release-failed'; });
    let timer;
    s.release = !boundMs ? operation : Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error(`${label}: timed out after ${boundMs} ms`)), boundMs);
    })]).finally(() => clearTimeout(timer));
    s.release.catch(() => {}); // every caller gets the same settlement; none is left unhandled
    return s.release;
  };

  const retain = (name, why) => { const s = entry(name); s.state = 'retained'; s.why = String(why); };
  const terminal = s => (s.state === 'acquiring' ? 'orphaned' : s.state === 'owned' ? 'orphaned' : s.state === 'releasing' ? 'failed-unconfirmed' : s.state);
  // Diagnostic view only: elapsed offsets are rounded to integer ms (float subtraction can yield 200.0000000000001);
  // the decision times s.abandonAt and s.orphanAt themselves stay unrounded.
  const slotView = () => Object.fromEntries([...slots].sort(([a], [b]) => a.localeCompare(b)).map(([name, s]) => [name, {
    state: s.state, why: s.why, t0_ms: s.t0 === null ? null : at(s.t0),
    abandon_at_ms: s.abandonAt === null ? null : at(s.t0) + Math.round(s.abandonAt - s.t0),
    orphan_at_ms: s.orphanAt === null ? null : at(s.t0) + Math.round(s.orphanAt - s.t0)}]));
  const pending = () => [...active.keys()].sort();

  const bindWriter = writer => {
    if (writer !== null && writer === bound) return bound;
    if (raw !== null) {
      if (writer === raw) return bound;
      throw refuse('one evidence writer per page: a second writer was offered');
    }
    if (writer === null || typeof writer !== 'object' || typeof writer.append !== 'function' || typeof writer.put !== 'function' ||
      typeof writer.seal !== 'function' || typeof writer.failure !== 'function') throw Error('r2 lifecycle: not an R2 evidence writer');
    if (WRITER_OWNERS.has(writer) && WRITER_OWNERS.get(writer) !== owner) throw refuse('writer belongs to another lifecycle');
    WRITER_OWNERS.set(writer, owner);
    raw = writer;
    bound = Object.freeze({
      append: (lane, record) => { if (closed) late(lane); return raw.append(lane, record); },
      put: (name, data) => { if (closed) late(name); return raw.put(name, data); },
      seal: () => { throw refuse('seal only through lifecycle finalize'); },
      failure: () => raw.failure(),
      identity: raw.identity,
    });
    WRITER_OWNERS.set(bound, owner);
    return bound;
  };

  // Waits for pending operations until the settle end (never past the page guard) or each op's own orphan time.
  const settle = async end => {
    for (;;) {
      const t = now(), waiting = [...active.values()].filter(r => r.orphanAt === null || r.orphanAt > t);
      if (!waiting.length) return;
      const until = Math.min(end, ...waiting.map(r => r.orphanAt ?? Infinity)) - t;
      if (until <= 0) return;
      let timer;
      await Promise.race([...waiting.map(r => r.done), new Promise(done => { timer = setTimeout(done, Math.ceil(until)); })]);
      clearTimeout(timer);
    }
  };

  const finalizeOnce = ({incomplete = [], fallback = false} = {}) => finalizing ??= (async () => {
    closed = true;
    const start = now();
    const settleEnd = Math.min(start + bounds.settleMs, pageStart + bounds.guardMs);
    await settle(settleEnd);
    const view = slotView();
    for (const [name, s] of slots) view[name].state = terminal(s);
    const reasons = [];
    if (fallback) reasons.push('fallback finalize: composition did not complete its own teardown');
    const left = pending();
    if (left.length) reasons.push(`operations unsettled at finalize: ${left.join(', ')}`);
    if (stickyCount) reasons.push(`lifecycle refused ${stickyCount}: ${sticky.join('; ')}`);
    for (const [name, s] of Object.entries(view)) if (!CLEAN.includes(s.state)) reasons.push(`CONTAINMENT_REQUIRED:${name}:${s.state}`);
    if (start - pageStart > bounds.workMs) reasons.push(`R2 page work limit ${bounds.workMs} ms passed before finalize`);
    if (now() - pageStart >= bounds.guardMs) reasons.push(`R2 page guard deadline ${bounds.guardMs} ms passed`);
    const record = {phase: 'lifecycle', diagnostic: true, schema: SCHEMA, fallback, clean: !reasons.length, slots: view, pending: left,
      sticky: {count: stickyCount, first: [...sticky]}, op_counts: {...counts},
      deadlines: {work_ms: bounds.workMs, guard_ms: bounds.guardMs, finalize_start_ms: at(start), settle_end_ms: at(settleEnd)}, reasons: reasons.map(cap)};
    let sealed = null, error = null;
    if (!raw) error = 'no evidence writer bound: nothing sealed';
    else if (raw.failure() !== null) error = message(raw.failure());
    else {
      try {
        raw.append('events', record);
        const keep = reasons.map(cap).slice(0, REASONS);
        sealed = await raw.seal({incomplete: [...incomplete.slice(0, REASONS - keep.length), ...keep]});
      } catch (e) { error = message(e); }
    }
    const finalReasons = [...record.reasons];
    if (now() - pageStart >= bounds.guardMs && !finalReasons.some(r => r.startsWith('R2 page guard deadline'))) finalReasons.push(`R2 page guard deadline ${bounds.guardMs} ms passed`);
    if (stopped()) finalReasons.push('gate stopped at finalize');
    if (!sealed) finalReasons.push(`evidence not sealed: ${error}`);
    const clean = !finalReasons.length && !fallback;
    finalClean = clean;
    return {clean, sealed, error, reasons: finalReasons, record: {...record, clean, reasons: finalReasons, sealed: sealed !== null, finalize_end_ms: at(now())}};
  })();

  // Reconcile after the seal await and on every repeated call. This is a runtime verdict;
  // the diagnostic event and immutable manifest describe only their earlier snapshot.
  const finalize = options => finalizeOnce(options).then(result => {
    const live = status();
    const extra = [];
    if (live.sticky > result.record.sticky.count) extra.push(`lifecycle refused ${live.sticky - result.record.sticky.count} operation(s) after diagnostic snapshot`);
    if (live.pending.length) extra.push(`operations unsettled at completion: ${live.pending.join(', ')}`);
    if (stopped()) extra.push('gate stopped at completion');
    if (now() - pageStart >= bounds.guardMs) extra.push(`R2 page guard deadline ${bounds.guardMs} ms passed`);
    if (!live.clean || extra.length) {
      finalClean = false;
      result.clean = false;
      for (const reason of extra) if (!result.reasons.includes(reason)) result.reasons.push(reason);
      result.record = {...result.record, clean: false, reasons: [...result.reasons]};
    }
    return result;
  });

  // Live view: sticky refusals, unsettled work and a non-clean finalize keep the page non-clean; later cleanup cannot undo it.
  const status = () => {
    const view = slotView();
    const left = pending();
    return {clean: finalClean !== false && !stickyCount && !left.length && Object.values(view).every(s => CLEAN.includes(s.state)), sticky: stickyCount, pending: left, slots: view};
  };

  return Object.freeze({bounds, bindWriter, op, acquire, release, retain, slot: name => entry(name).state, pending, status, finalize});
}
