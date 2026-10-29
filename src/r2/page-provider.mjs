// M1: isolated, in-memory page instrumentation boundary. A synthetic collector calls
// record() for each event; no DOM, browser, socket or physical-input capability lives here.
// Completeness is a collector declaration, NOT proof that the page omitted no events.
const CLOCK = 'page-monotonic-ms';
const TYPES = new Set(['keydown', 'focusin', 'focusout', 'mutation', 'app']);
const text = value => typeof value === 'string' && value.length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const size = value => new TextEncoder().encode(JSON.stringify(value)).length;
const fail = message => { throw Error(message); };

function jsonCopy(value, depth = 0) {
  if (depth > 40) fail('JSON nesting cap');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return Array.from(value, v => jsonCopy(v, depth + 1));
  if (object(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,jsonCopy(v,depth + 1)]));
  }
  fail('page journal requires finite JSON data');
}
function limits(maxEvents, maxBytes) {
  if (!Number.isSafeInteger(maxEvents) || maxEvents <= 0 || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) fail('invalid page journal caps');
}
function eventErrors(event, index, previousTime, snapshotTime) {
  if (!object(event) || event.seq !== index + 1 || !TYPES.has(event.type) ||
    !Number.isFinite(event.t) || event.t < 0 || event.t < previousTime || event.t > snapshotTime || !text(event.active)) fail('page event sequence, type or clock invalid');
  if (['keydown','focusin','focusout'].includes(event.type) && !text(event.target)) fail('page event target missing');
  if (event.type === 'focusin' && event.target !== event.active) fail('page focus target differs from active element');
  if (event.type === 'keydown') {
    if (!text(event.key) || typeof event.shift !== 'boolean' || event.target !== event.active) fail('malformed page keydown');
    for (const flag of ['ctrl','alt','meta','repeat']) {
      if (flag in event && typeof event[flag] !== 'boolean') fail('malformed page key modifier');
    }
    // The current supported presses have no Control/Alt/Meta component. R1's
    // judgeKeys checks key/shift only, so never let another chord look equivalent.
    if (event.ctrl || event.alt || event.meta || event.repeat) fail('unqualified page key modifier or repeat');
  }
}

/**
 * Synthetic instrumentation interface. snapshot() supplies {active,state}; now()
 * is exclusively page-local monotonic time. record(type,detail) preserves delivery
 * order and takes the active-element snapshot at that event. The caller owns the
 * event feed and must markIncomplete() on subscription gaps, loss or teardown.
 * This does not attach DOM listeners or claim a qualified real-page collector.
 */
export function createPageInstrumentation({session, now, snapshot, maxEvents = 1000, maxBytes = 262144}) {
  limits(maxEvents,maxBytes);
  if (!text(session) || typeof now !== 'function' || typeof snapshot !== 'function') fail('missing page instrumentation bindings');
  const events = [], reasons = [];
  let lastTime = -Infinity, count = 0, overflow = false;
  const incomplete = reason => { if (!reasons.includes(String(reason))) reasons.push(String(reason)); };
  const observe = () => {
    const t = now(), value = jsonCopy(snapshot());
    if (!Number.isFinite(t) || t < 0 || t < lastTime) fail('page clock regression');
    if (!object(value) || !text(value.active) || !object(value.state)) fail('page snapshot malformed');
    lastTime = t;
    return {t, active:value.active, state:value.state};
  };
  const frame = value => ({session, clock:CLOCK, ...value, complete:reasons.length === 0,
    overflow, dropped:count - events.length, event_count:count, events:jsonCopy(events), reasons:[...reasons]});
  return Object.freeze({
    record(type, detail = {}) {
      if (reasons.length) return false;
      try {
        const data = jsonCopy(detail);
        if (!object(data) || ['seq','t','type','active'].some(k => k in data)) fail('page event detail overwrites instrumentation identity');
        const value = observe(), event = {...data, seq:count + 1, t:value.t, type, active:value.active};
        eventErrors(event, count, events.at(-1)?.t ?? 0, value.t);
        count++;
        if (count > maxEvents || size({...frame(value), events:[...events,event]}) > maxBytes) {
          overflow = true; incomplete('page capture overflow'); return false;
        }
        events.push(event); return true;
      } catch (error) { incomplete(error.message); return false; }
    },
    read() {
      let value = {t:Number.isFinite(lastTime) ? lastTime : 0, active:'unknown', state:{}};
      try { value = observe(); } catch (error) { incomplete(error.message); }
      if (size(frame(value)) > maxBytes) { overflow = true; incomplete('page snapshot overflow'); }
      return frame(value);
    },
    markIncomplete: reason => incomplete(reason || 'page collection incomplete'),
    close: () => incomplete('page instrumentation closed'),
  });
}

/** Validated cumulative page.read({signal}) interface for captureJourney. */
export function createPageProvider({readJournal, maxEvents = 1000, maxBytes = 262144}) {
  limits(maxEvents,maxBytes);
  if (typeof readJournal !== 'function') fail('missing page journal reader');
  let previous = null, failure = null, busy = false, focusRelease = null;
  return Object.freeze({async read(context) {
    if (failure) throw failure;
    if (busy) { failure = Error('page provider: overlapping reads'); throw failure; }
    busy = true;
    try {
      const value = jsonCopy(await readJournal(context));
      if (failure) throw failure;
      if (!object(value) || value.complete !== true || value.overflow !== false || value.dropped !== 0 ||
        !text(value.session) || value.clock !== CLOCK || !Number.isFinite(value.t) || value.t < 0 ||
        !text(value.active) || !object(value.state) || !Array.isArray(value.events) ||
        value.event_count !== value.events.length) fail('page journal missing events, identity or completeness');
      if (value.events.length > maxEvents || size(value) > maxBytes) fail('page journal overflow cap');
      value.events.forEach((event,index) => eventErrors(event,index,value.events[index - 1]?.t ?? 0,value.t));
      if (previous && (value.session !== previous.session || value.t < previous.t ||
        value.events.length < previous.events.length || !same(value.events.slice(0,previous.events.length),previous.events))) fail('page session, clock or journal prefix changed');
      const delta = value.events.slice(previous?.events.length ?? 0);
      let active = previous?.active, released = focusRelease;
      for (const event of delta) {
        if (previous && event.t < previous.t) fail('page append predates previous read');
        if (event.type === 'focusout') {
          if (!active || released || event.target !== active) fail('page ambiguous focusout sequence');
          released = {from:active, observed:event.active};
        }
        if (event.type === 'focusin') {
          // Body is the explicit no-element-focused baseline in this synthetic
          // interface: initial body -> element may have no body focusout. Once
          // a non-body element is established, its focusout must be observed.
          // Preserve that release across reads; never infer one from endpoints.
          if (!active) fail('page ambiguous focusin without focus baseline');
          if (!released && active !== 'body') fail('page missing focusout before focusin');
          // A blur snapshot can still show the old element or body. If it
          // instead names a new element, that is the only coherent destination
          // for this pending pair, including when the events span reads.
          if (released && released.observed !== released.from && released.observed !== 'body' &&
            event.target !== released.observed) fail('page focusin destination differs from pending focusout');
          released = null;
        }
        if (!['focusin','focusout'].includes(event.type) && active && event.active !== active) fail('page active element changed without focus event');
        active = event.active;
      }
      if (active && value.active !== active) fail('page snapshot missing focus event');
      if (previous && !same(value.state,previous.state) && !delta.some(e => e.type === 'mutation' || e.type === 'app')) fail('page snapshot missing mutation or app event');
      previous = value; focusRelease = released;
      return jsonCopy(value);
    } catch (error) { failure ??= Error(`page provider: ${error.message}`); throw failure; }
    finally { busy = false; }
  }});
}
