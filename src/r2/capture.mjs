// R2 observation core. Injected, in-memory boundaries only in this milestone; no NVDA/browser loader,
// file I/O, model, workflow or physical input. execute MUST be guarded/cancellable in a future runner.
import { withTimeout } from '../speech/capture.mjs';
import { judgeKeys } from '../speech/sendguard.mjs';

const NODE_CLOCK = 'node-monotonic-ms';
const PAGE_CLOCK = 'page-monotonic-ms';
// Conservative observation cap, matching frozen R1's default ackMs. This is NOT a guard receipt.
const ACK_MS = 1000;
const copy = value => structuredClone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const problem = (status, message) => Object.assign(new Error(message), { status });
const positive = n => Number.isFinite(n) && n > 0;

function expectedKey(press) {
  if (typeof press !== 'string' || !press || /^(Control|Alt|Meta|Insert|Shift)$/.test(press)) throw Error('unsupported press');
  const shift = press.startsWith('Shift+');
  const key = shift ? press.slice(6) : press;
  if (key.includes('+') || !key) throw Error('unsupported press');
  return { key: key === 'Space' ? ' ' : key, shift };
}

/**
 * captureJourney({ fixture_id, actions:[{step,press}], speech:{read()}, page:{read()}, execute,
 *   observationMs, pollMs, timeoutMs, clock:{now(),wait(ms)} }) -> serializable capture, never a score.
 * speech.read: {source,session,connected,complete,phrases:string[]} append-only for one connection.
 * page.read: {session,complete,clock:'page-monotonic-ms',t,active,state,events:[{seq,t,type,...}]}.
 * Providers must continuously collect page events and report resets/lost observations as incomplete.
 * Observation duration is explicit policy, not a claim that arbitrarily late speech is impossible.
 */
export async function captureJourney({ fixture_id, actions, speech, page, execute,
  observationMs, pollMs = 10, timeoutMs = 1000,
  clock = { now: () => performance.now(), wait: ms => new Promise(resolve => setTimeout(resolve, ms)) },
}) {
  if (typeof fixture_id !== 'string' || !fixture_id || !Array.isArray(actions) || !actions.length ||
    actions.some(a => typeof a?.step !== 'string' || !a.step) || new Set(actions.map(a => a.step)).size !== actions.length) throw Error('invalid action identity or fixture');
  const journey = actions.map(a => ({ step: a.step, press: a.press }));
  const keys = journey.map(a => expectedKey(a.press));
  if (!positive(observationMs) || !positive(pollMs) || !positive(timeoutMs)) throw Error('observation, poll and operation timeout must be positive');
  if (typeof speech?.read !== 'function' || typeof page?.read !== 'function' || typeof execute !== 'function' || typeof clock?.now !== 'function' || typeof clock?.wait !== 'function') throw Error('missing capture provider');

  const controller = new AbortController();
  const result = { schema: 'r2-capture/1', fixture_id, source: 'unattested', evidence_class: 'MACHINE',
    evidence_scope: 'injected transport; no hosted provenance attestation', guarded_execution_verified: false, completed: false,
    outcome: 'INSUFFICIENT_EVIDENCE', preexisting_phrases: 0, records: [], raw: [], unattributed: [], unattributed_page: [], reasons: [] };
  let previousSpeech = null, previousPage = null, lastNow = -Infinity;
  const now = () => {
    const t = clock.now();
    if (!Number.isFinite(t) || t < lastNow) throw problem('incomplete', 'Node monotonic clock regressed');
    lastNow = t;
    return t;
  };
  const bounded = async (label, operation) => {
    const read = await withTimeout(Promise.resolve().then(() => operation({ signal: controller.signal })), timeoutMs);
    if (read.timedOut) throw problem('failed', `${label}: timed out`);
    if (read.error) throw problem('failed', `${label}: ${read.error}`);
    return copy(read.value);
  };

  async function readSpeech(record, boundary = false) {
    const sample = await bounded('speech read', context => speech.read(context));
    if (!sample) throw problem('missing', 'speech capture missing');
    if (sample.connected !== true) throw problem('disconnected', 'speech transport disconnected');
    if (sample.complete !== true || typeof sample.session !== 'string' || !sample.session || !Array.isArray(sample.phrases) || sample.phrases.some(p => typeof p !== 'string')) throw problem('incomplete', 'speech snapshot incomplete');
    if (previousSpeech && (sample.session !== previousSpeech.session || sample.source !== previousSpeech.source || sample.phrases.length < previousSpeech.phrases.length || previousSpeech.phrases.some((p,i) => p !== sample.phrases[i]))) throw problem('incomplete', 'speech session/log reset or prefix rewritten');
    if (!previousSpeech) {
      result.source = sample.source ?? 'unattested';
      result.preexisting_phrases = sample.phrases.length;
    } else {
      const delta = sample.phrases.slice(previousSpeech.phrases.length).map((text, i) => ({
        seq: previousSpeech.phrases.length + i + 1, source: result.source, text,
        received: { clock: NODE_CLOCK, t: now() },
      }));
      result.raw.push(...delta);
      if (boundary) result.unattributed.push(...copy(delta));
      else if (record) {
        record.raw_seq.push(...delta.map(p => p.seq));
        record.text = result.raw.filter(p => record.raw_seq.includes(p.seq)).map(p => p.text).join('\n');
      }
      previousSpeech = sample;
      if (boundary && delta.length) throw problem('ambiguous', 'unattributed speech outside a closed action window');
    }
    previousSpeech = sample;
  }

  async function readPage(record, boundary = false) {
    const sample = await bounded('page read', context => page.read(context));
    const reject = message => {
      if (record) record.page.rejected.push(copy(sample));
      else result.unattributed_page.push({ snapshot: copy(sample), events: [] });
      throw problem('incomplete', message);
    };
    if (!sample || sample.complete !== true || sample.clock !== PAGE_CLOCK || typeof sample.session !== 'string' || !sample.session ||
      !Number.isFinite(sample.t) || typeof sample.active !== 'string' || !sample.active || !sample.state || typeof sample.state !== 'object' || Array.isArray(sample.state) || !Array.isArray(sample.events)) reject('page snapshot missing or incomplete');
    const events = sample.events;
    if (events.some((e,i) => e?.seq !== i + 1 || typeof e.type !== 'string' || !Number.isFinite(e.t) || (i > 0 && e.t < events[i-1].t) || e.t > sample.t)) reject('page event ordering/gap invalid');
    if (previousPage && (sample.session !== previousPage.session || sample.t < previousPage.t || events.length < previousPage.events.length || !same(events.slice(0, previousPage.events.length), previousPage.events))) reject('page session/log reset or prefix rewritten');
    const delta = previousPage ? events.slice(previousPage.events.length) : [];
    const snapshot = { session: sample.session, clock: PAGE_CLOCK, t: sample.t, active: sample.active, state: sample.state, cursor: events.length, node_received: { clock: NODE_CLOCK, t: now() } };
    previousPage = sample;
    if (boundary && delta.length) {
      result.unattributed_page.push({ snapshot: copy(snapshot), events: copy(delta) });
      throw problem('ambiguous', 'page events outside a closed action window');
    }
    if (record) {
      record.page.before ??= copy(snapshot);
      record.page.after = copy(snapshot);
      record.page.samples.push(copy(snapshot));
      record.page.events.push(...copy(delta));
    }
  }

  for (const [index, action] of journey.entries()) {
    const record = { seq: index + 1, ...action, capture_status: 'incomplete', text: '', raw_seq: [], ack_seq: null,
      ack_timing: { clock: NODE_CLOCK, reference: 'executor-request', deadline_ms: ACK_MS, observed_at: null },
      execution: { started: false, settled: false, cancellation_requested: false, quiescence: 'UNVERIFIED' },
      association: 'observation-window-only', node_window: { clock: NODE_CLOCK, from: null, to: null }, page: { before: null, after: null, samples: [], events: [], rejected: [] }, reasons: [] };
    result.records.push(record);
    let started = false, executionSettled = false;
    try {
      record.node_window.from = now();
      await readSpeech(null, true);
      await readPage(record, index > 0);
      // Page reads are asynchronous: never borrow speech collected during this pre-action read.
      // A subsequent untagged arrival still cannot establish causality or the physical-send boundary.
      await readSpeech(null, true);
      record.node_window.from = now();
      started = true;
      record.execution.started = true;
      await bounded('action', async context => {
        try { return await execute(copy(action), context); }
        finally { executionSettled = true; }
      });
      record.execution.settled = executionSettled;
      const ackDeadline = record.node_window.from + ACK_MS;
      const until = now() + observationMs;
      for (;;) {
        await readSpeech(record);
        await readPage(record);
        const observed = now();
        if (record.ack_seq === null) {
          const keydowns = record.page.events.filter(e => e.type === 'keydown');
          if (!judgeKeys(keydowns, keys[index]).length && observed <= ackDeadline) {
            record.ack_seq = keydowns.find(e => e.key === keys[index].key)?.seq ?? null;
            record.ack_timing.observed_at = observed;
          }
          if (record.ack_seq === null && observed >= ackDeadline) throw problem('incomplete', `ack: not observed within ${ACK_MS} ms of executor request`);
        }
        if (now() >= until) break;
        const beforeWait = now();
        const nextRead = Math.min(until, record.ack_seq === null ? ackDeadline : until);
        await bounded('observation wait', context => clock.wait(Math.min(pollMs, nextRead - beforeWait), context));
        if (now() <= beforeWait) throw problem('incomplete', 'observation clock did not advance');
      }
      record.node_window.to = now();
      const keydowns = record.page.events.filter(e => e.type === 'keydown');
      const errors = judgeKeys(keydowns, keys[index]);
      if (errors.length) throw problem('incomplete', `ack: ${errors.join('; ')}`);
      record.capture_status = record.raw_seq.length ? 'speech' : 'observed-silence';
      if (!record.raw_seq.length) record.silence = { transport_live: true, from: record.node_window.from, to: record.node_window.to, unit: NODE_CLOCK };
    } catch (error) {
      record.capture_status = error.status ?? 'failed';
      record.reasons.push(error.message);
      record.execution.settled = executionSettled;
      record.execution.cancellation_requested = started && !executionSettled;
      controller.abort(); // Request promptly; no assertion that an injected executor has stopped.
      // Preserve any readable partial evidence. A secondary read cannot clear the original failure.
      if (started && error.status !== 'ambiguous') {
        for (const read of [() => readSpeech(record), () => readPage(record)]) {
          try { await read(); } catch (secondary) { record.reasons.push(`recovery: ${secondary.message}`); }
        }
      }
      try { record.node_window.to = now(); } catch (secondary) { record.reasons.push(secondary.message); }
      result.reasons.push(...record.reasons.map(reason => `${action.step}: ${reason}`));
      return copy(result);
    }
  }
  // A second boundary read catches arrivals between the final speech sample and page snapshot.
  try { await readSpeech(null, true); await readPage(null, true); }
  catch (error) { result.reasons.push(`final boundary: ${error.message}`); controller.abort(); return copy(result); }
  result.completed = true;
  result.outcome = 'COMPLETE';
  return copy(result);
}
