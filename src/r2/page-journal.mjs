// R2-L1: offline page-journal compatibility adapter. One injected, cumulative synthetic
// journal source feeds both the R2 snapshot view and the frozen pageAck keydown view, so
// neither view returns data from a read the other's shared accepted state would reject.
// No DOM, browser, timer, gate or physical-input capability lives here; source.read() and
// writer.append() are injected callbacks. Validated data is synthetic, not page evidence.
import {createPageProvider} from './page-provider.mjs';

const CLOCK = 'page-monotonic-ms';
const TYPES = new Set(['keydown', 'focusin', 'focusout', 'mutation', 'app']);
const FLAGS = ['shift', 'ctrl', 'alt', 'meta', 'repeat'];
const text = value => typeof value === 'string' && value.length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => JSON.stringify(value, (k, v) => object(v) ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);
const fail = message => { throw Error(message); };

// Declarations are required exactly as stated; nothing missing is inferred or normalized.
function journalErrors(value, maxEvents, maxBytes) {
  if (!object(value) || !Array.isArray(value.events) || !text(value.session) || !text(value.active) ||
    !object(value.state) || !Number.isFinite(value.t) || value.t < 0) fail('malformed journal');
  if (value.complete !== true) fail('journal incomplete');
  if (value.overflow !== false) fail('journal overflow declared');
  if (value.dropped !== 0) fail('journal dropped events');
  if (value.event_count !== value.events.length) fail('journal event_count mismatch');
  if (value.clock !== CLOCK) fail('journal clock domain');
  if (value.events.length > maxEvents) fail('journal event cap');
  if (new TextEncoder().encode(canonical(value)).length > maxBytes) fail('journal byte cap');
  value.events.forEach((event, index) => {
    if (!object(event) || event.seq !== index + 1) fail('journal sequence not contiguous from 1');
    const previous = value.events[index - 1]?.t ?? 0;
    if (!Number.isFinite(event.t) || event.t < 0 || event.t < previous || event.t > value.t) fail('journal event time');
    if (event.type === 'focus') fail('raw focus event refused');
    if (!TYPES.has(event.type)) fail('journal event type refused');
    if (!text(event.active)) fail('event active element missing');
    if (event.type === 'focusin' && event.target !== event.active) fail('focusin target differs from active');
    if (event.type === 'keydown') {
      if (FLAGS.some(flag => typeof event[flag] !== 'boolean')) fail('keydown modifier flag missing or non-boolean');
      if (event.ctrl || event.alt || event.meta || event.repeat) fail('keydown modifier or repeat');
      if (!text(event.key)) fail('keydown key empty');
      if (event.target !== event.active) fail('keydown target differs from active');
    }
  });
}
function historyErrors(value, previous) {
  if (!previous) return;
  if (value.session !== previous.session || value.clock !== previous.clock) fail('journal session or clock changed');
  if (value.events.length < previous.events.length) fail('journal shrank');
  if (previous.events.some((event, index) => canonical(event) !== canonical(value.events[index]))) fail('journal history rewritten');
}

/**
 * createPageJournal({source:{read()}, writer?:{append('page', entry)}, maxEvents, maxBytes})
 * -> frozen {snapshot(), keys(cursor)}. Each call performs one source.read() and validates it
 * against the single last-accepted state, then through createPageProvider. snapshot() returns
 * the page.read() shape; keys(cursor) returns [{seq,key,shift}] for keydowns with seq > cursor.
 * Any invalid read, overlap, upstream or writer failure is sticky; a failed call reads nothing more.
 */
export function createPageJournal({source, writer, maxEvents = 1000, maxBytes = 262144}) {
  if (typeof source?.read !== 'function') fail('missing page journal source');
  if (writer !== undefined && typeof writer?.append !== 'function') fail('invalid page journal writer');
  let accepted = null, current = null, failure = null, busy = false;
  const provider = createPageProvider({readJournal: () => current, maxEvents, maxBytes});
  const record = entry => writer?.append('page', {phase:'r2-journal', ...entry});
  const run = async (view, cursor, select) => {
    if (failure) throw failure;
    if (busy) { failure = Error('page journal: overlapping reads'); throw failure; }
    busy = true;
    try {
      let raw;
      try { raw = await source.read(); } catch (error) { fail(`source read failed: ${error?.message ?? error}`); }
      if (failure) throw failure;
      const value = structuredClone(raw);
      journalErrors(value, maxEvents, maxBytes);
      historyErrors(value, accepted);
      const seqMax = value.events.length;
      if (view === 'keys' && (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > seqMax)) fail('cursor out of range');
      current = value;
      const validated = await provider.read();
      if (failure) throw failure;
      accepted = value;
      // A writer may be asynchronous: the view is released only after its write settles.
      try { await record({view, cursor, seq_max:seqMax, complete:true, errors:[]}); }
      catch (error) { fail(`evidence writer failed: ${error?.message ?? error}`); }
      if (failure) throw failure;
      return select(validated);
    } catch (error) {
      if (!failure) {
        const latched = failure = Error(/^page (journal|provider):/.test(error.message) ? error.message : `page journal: ${error.message}`);
        // Diagnostic only: complete:false marks it ineligible as evidence. The refusal is already latched and
        // is not delayed by this write; its sync or async failure is handled and kept as the failure's cause.
        const keep = reason => { latched.cause ??= reason; };
        try { Promise.resolve(record({view, cursor:Number.isSafeInteger(cursor) ? cursor : null, seq_max:accepted?.events.length ?? null, complete:false, errors:[latched.message]})).catch(keep); }
        catch (reason) { keep(reason); }
      }
      throw failure;
    } finally { busy = false; current = null; }
  };
  return Object.freeze({
    snapshot: () => run('snapshot', null, value => value),
    keys: cursor => run('keys', cursor, value => value.events
      .filter(event => event.type === 'keydown' && event.seq > cursor).map(({seq, key, shift}) => ({seq, key, shift}))),
  });
}
