// R2 observation core. Injected, in-memory boundaries only in this milestone; no NVDA/browser loader,
// file I/O, model, workflow or physical input. execute MUST be guarded/cancellable in a future runner.
import { withTimeout } from '../speech/capture.mjs';
import { judgeKeys } from '../speech/sendguard.mjs';
import { isSendReceiptLedger } from './send-receipt.mjs';
import { expectedKey } from './contract.mjs';

const NODE_CLOCK = 'node-monotonic-ms';
const PAGE_CLOCK = 'page-monotonic-ms';
// Conservative observation cap, matching frozen R1's default ackMs. This is NOT a guard receipt.
const ACK_MS = 1000;
// M2B: bounded wait for the ledger's gate-idle check after executor settlement; within send-receipt's 5000 ms cap.
const RECEIPT_SETTLE_MS = 1000;
const copy = value => structuredClone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const problem = (status, message) => Object.assign(new Error(message), { status });
const positive = n => Number.isFinite(n) && n > 0;

// Post-finalization gate revalidation (ledger.gateState(), the ledger's own gate). Only a registered, readable,
// unstopped gate is live; anything else fails closed. The original stop kind/reason is copied, never rewritten.
export const gateLive = state => state?.registered === true && state?.valid === true && state?.stopped === false;
const describeStop = state => `owned gate ${state?.registered === true && state?.valid === true ? 'stopped' : 'state unverifiable'} after receipt finalization` +
  (state?.reason ? ` (${state.kind ?? 'unknown'}: ${state.reason})` : '');
const stopRecord = (where, state) => ({ where, registered: state?.registered === true, valid: state?.valid === true,
  kind: state?.kind ?? null, reason: state?.reason ?? null, misdelivered: state?.misdelivered ?? null });

/**
 * Invalidate a capture whose owned gate is no longer live after finalization: never completed or model-eligible.
 * The last record's success claim (speech/observed-silence) is demoted to failed; its prior status and silence
 * claim are kept under record.invalidated as diagnostics only. Raw observations are left untouched.
 */
export function invalidateForGateStop(capture, where, state) {
  const reason = `${where}: ${describeStop(state)}`;
  capture.gate_stop ??= stopRecord(where, state);
  const record = capture.records?.at(-1);
  if (record && ['speech', 'observed-silence'].includes(record.capture_status)) {
    record.invalidated = { by: 'gate-stop', where, prior_capture_status: record.capture_status,
      ...(record.silence ? { prior_silence: record.silence } : {}) };
    delete record.silence;
    record.capture_status = 'failed';
    record.reasons.push(reason);
  }
  capture.reasons.push(reason);
  capture.completed = false;
  capture.outcome = 'INSUFFICIENT_EVIDENCE';
  return capture;
}

/**
 * captureJourney({ fixture_id, actions:[{step,press}], speech:{read()}, page:{read()}, execute,
 *   observationMs, pollMs, timeoutMs, clock:{now(),wait(ms)} }) -> serializable capture, never a score.
 * speech.read: {source,session,connected,complete,phrases:string[]} append-only for one connection.
 * page.read: {session,complete,clock:'page-monotonic-ms',t,active,state,events:[{seq,t,type,...}]}.
 * Providers must continuously collect page events and report resets/lost observations as incomplete.
 * Observation duration is explicit policy, not a claim that arbitrarily late speech is impossible.
 * M2B receipts (optional): a createSendReceiptLedger ledger on the SAME Node clock, for the gate the executor
 * drives. Then the 1000 ms acknowledgement cap starts at the ledger's gate-release entry (released_at), page and
 * speech are read while the executor is still settling, and a missing, invalid, late, expired or contradictory
 * receipt fails the action. Timeliness is the Node time a page read returned, never a page-clock timestamp.
 * The R1 acknowledgement stays in gate_receipt only; R2's ack_seq comes from its own page reads.
 * M2D: with receipts, a phrase joins the action only if the speech read that last saw it absent was requested
 * strictly after the validated released_at. Otherwise it stays in raw/unattributed and the action is ambiguous.
 */
export async function captureJourney({ fixture_id, actions, speech, page, execute,
  observationMs, pollMs = 10, timeoutMs = 1000,
  clock = { now: () => performance.now(), wait: ms => new Promise(resolve => setTimeout(resolve, ms)) },
  receipts,
}) {
  if (typeof fixture_id !== 'string' || !fixture_id || !Array.isArray(actions) || !actions.length ||
    actions.some(a => typeof a?.step !== 'string' || !a.step) || new Set(actions.map(a => a.step)).size !== actions.length) throw Error('invalid action identity or fixture');
  const journey = actions.map(a => ({ step: a.step, press: a.press }));
  const keys = journey.map(a => expectedKey(a.press));
  if (!positive(observationMs) || !positive(pollMs) || !positive(timeoutMs)) throw Error('observation, poll and operation timeout must be positive');
  if (typeof speech?.read !== 'function' || typeof page?.read !== 'function' || typeof execute !== 'function' || typeof clock?.now !== 'function' || typeof clock?.wait !== 'function') throw Error('missing capture provider');
  if (receipts !== undefined && !isSendReceiptLedger(receipts)) throw Error('unauthenticated gate receipt ledger');

  const controller = new AbortController();
  const result = { schema: 'r2-capture/1', fixture_id, source: 'unattested', evidence_class: 'MACHINE',
    evidence_scope: 'injected transport; no hosted provenance attestation', guarded_execution_verified: false, completed: false,
    outcome: 'INSUFFICIENT_EVIDENCE', preexisting_phrases: 0, records: [], raw: [], unattributed: [], unattributed_page: [], reasons: [] };
  let previousSpeech = null, previousPage = null, lastNow = -Infinity;
  // True from a complete receipt finish until the next begin(): the gate must stay live through every later read.
  let finalized = false;
  // Synchronous revalidation; called right after each asynchronous read returns and at completion boundaries.
  function gateStop(where, always = false) {
    if (!receipts || (!finalized && !always)) return null;
    const state = receipts.gateState();
    if (gateLive(state)) return null;
    result.gate_stop ??= stopRecord(where, state);
    return Object.assign(problem('failed', `${where}: ${describeStop(state)}`), { gate_state: state });
  }
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

  // M2D: Node time no later than the previous speech read's request. A phrase absent from that snapshot
  // arrived strictly after it; this is a lower bound only, never the phrase's emission or physical-send time.
  let previousSpeechFloor = null;
  async function readSpeech(record, boundary = false) {
    const floor = lastNow;
    const sample = await bounded('speech read', context => speech.read(context));
    if (!sample) throw problem('missing', 'speech capture missing');
    if (sample.connected !== true) throw problem('disconnected', 'speech transport disconnected');
    if (sample.complete !== true || typeof sample.session !== 'string' || !sample.session || !Array.isArray(sample.phrases) || sample.phrases.some(p => typeof p !== 'string')) throw problem('incomplete', 'speech snapshot incomplete');
    const stop = gateStop('speech read');
    if (previousSpeech && (sample.session !== previousSpeech.session || sample.source !== previousSpeech.source || sample.phrases.length < previousSpeech.phrases.length || previousSpeech.phrases.some((p,i) => p !== sample.phrases[i]))) throw problem('incomplete', 'speech session/log reset or prefix rewritten');
    let early = [];
    if (!previousSpeech) {
      result.source = sample.source ?? 'unattested';
      result.preexisting_phrases = sample.phrases.length;
    } else {
      const delta = sample.phrases.slice(previousSpeech.phrases.length).map((text, i) => ({
        seq: previousSpeech.phrases.length + i + 1, source: result.source, text,
        received: { clock: NODE_CLOCK, t: now() },
        ...(receipts ? { arrived_after: { clock: NODE_CLOCK, t: previousSpeechFloor } } : {}),
      }));
      result.raw.push(...delta);
      if (boundary) result.unattributed.push(...copy(delta));
      // Speech read after a gate stop is diagnostics only: never action text, even inside the window.
      else if (stop) result.unattributed.push(...delta.map(p => ({ ...copy(p), ...(record ? { step: record.step } : {}),
        invalidated_by: 'gate-stop' })));
      else if (record) {
        let accepted = delta;
        if (receipts) {
          // M2D/M2E: a phrase must have been absent after release and *observed* no later
          // than the release-relative policy deadline. A late read cannot backdate speech.
          const release = record.ack_timing.release_at ?? null;
          const end = release === null ? null : release + observationMs;
          accepted = delta.filter(p => release !== null && p.arrived_after.t > release && p.received.t <= end);
          early = delta.filter(p => !accepted.includes(p));
          result.unattributed.push(...early.map(p => ({ ...copy(p), step: record.step, release_at: release,
            observation_until: end })));
        }
        record.raw_seq.push(...accepted.map(p => p.seq));
        record.text = result.raw.filter(p => record.raw_seq.includes(p.seq)).map(p => p.text).join('\n');
      }
      previousSpeech = sample;
      if (stop) throw stop;
      if (boundary && delta.length) throw problem('ambiguous', 'unattributed speech outside a closed action window');
    }
    previousSpeech = sample;
    previousSpeechFloor = floor;
    if (stop) throw stop;
    if (early.length) {
      const release = record?.ack_timing?.release_at ?? null;
      const late = release !== null && early.some(p => p.arrived_after.t > release && p.received.t > release + observationMs);
      throw problem('ambiguous', late
        ? 'speech not established within the gate-release observation window'
        : 'speech observed before an established gate-release boundary');
    }
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
    const stop = gateStop('page read');
    if (stop || (boundary && delta.length)) {
      result.unattributed_page.push({ snapshot: copy(snapshot), events: copy(delta), ...(stop ? { invalidated_by: 'gate-stop' } : {}) });
      throw stop ?? problem('ambiguous', 'page events outside a closed action window');
    }
    if (record) {
      record.page.before ??= copy(snapshot);
      record.page.after = copy(snapshot);
      record.page.samples.push(copy(snapshot));
      record.page.events.push(...copy(delta));
    }
  }

  // Detached ledger diagnostics travel with every returned capture; they never enter speech text or ack_seq.
  const done = () => { if (receipts) result.gate_receipts = receipts.read(); return copy(result); };

  // M2B: the current ledger receipt for this action, checked against the capture's own Node clock.
  // Returns its gate-release entry time, or null while the gate has not released the send.
  function gateRelease(record, step, key, observed) {
    const ledger = receipts.read(), receipt = ledger?.receipts?.at(-1) ?? null;
    record.gate_receipt = copy(receipt);
    if (ledger?.schema !== 'r2-gate-release-receipts/1' || ledger.clock !== NODE_CLOCK || ledger.provenance?.attestation !== 'UNATTESTED' ||
      !Array.isArray(ledger.errors) || !Array.isArray(ledger.receipts)) throw problem('failed', 'gate receipt: invalid ledger snapshot');
    if (ledger.errors.length) throw problem('failed', `gate ${ledger.errors.join('; ')}`);
    if (receipt?.step !== step || ledger.receipts.filter(r => r.step === step).length !== 1) throw problem('failed', 'gate receipt: missing or duplicate receipt for this action');
    if (receipt.expired || receipt.late) throw problem('failed', 'gate receipt: expired or late');
    if (!Number.isFinite(receipt.started_at) || receipt.started_at < record.node_window.from || receipt.started_at > observed) throw problem('ambiguous', 'gate receipt: contradictory clock domain');
    if (receipt.released_at === null) return null;
    const commit = receipt.commit;
    if (!Number.isFinite(receipt.released_at) || receipt.released_at > observed) throw problem('ambiguous', 'gate receipt: contradictory clock domain or release time');
    if (commit?.not_after !== receipt.released_at || !(commit.not_before >= receipt.started_at) || commit.not_before > commit.not_after ||
      commit.sends_after !== commit.sends_before + 1 || receipt.token?.action_label !== `tabwise:${step}` || !same(receipt.expected_key, key)) throw problem('failed', 'gate receipt: invalid release receipt');
    record.ack_timing.release_at = receipt.released_at;
    record.ack_timing.commit_not_before = commit.not_before;
    return receipt.released_at;
  }

  for (const [index, action] of journey.entries()) {
    const record = { seq: index + 1, ...action, capture_status: 'incomplete', text: '', raw_seq: [], ack_seq: null,
      ack_timing: { clock: NODE_CLOCK, reference: 'executor-request', deadline_ms: ACK_MS, observed_at: null },
      execution: { started: false, settled: false, cancellation_requested: false, quiescence: 'UNVERIFIED' },
      association: 'observation-window-only', node_window: { clock: NODE_CLOCK, from: null, to: null }, page: { before: null, after: null, samples: [], events: [], rejected: [] }, reasons: [] };
    result.records.push(record);
    let started = false, executionSettled = false, receiptOpen = false;
    try {
      record.node_window.from = now();
      await readSpeech(null, true);
      await readPage(record, index > 0);
      // Page reads are asynchronous: never borrow speech collected during this pre-action read.
      // A subsequent untagged arrival still cannot establish causality or the physical-send boundary.
      await readSpeech(null, true);
      record.node_window.from = now();
      if (receipts) {
        record.ack_timing = { clock: NODE_CLOCK, reference: 'gate-release', deadline_ms: ACK_MS, release_at: null, commit_not_before: null, observed_at: null, late_observed_at: null };
        record.gate_receipt = null;
        // The ledger's collection bound covers the executor bound plus its own settlement wait.
        receipts.begin(action.step, { deadlineAt: record.node_window.from + timeoutMs + RECEIPT_SETTLE_MS });
        receiptOpen = true;
        finalized = false;
      }
      started = true;
      record.execution.started = true;
      if (receipts) {
        let outcome = null, release = null, seen = null, until = null, receiptFinished = false;
        // Run the executor without awaiting it, so page and speech are read while it settles.
        bounded('action', async context => {
          try { return await execute(copy(action), context); }
          finally { executionSettled = true; }
        }).then(() => { outcome = { error: null }; }, error => { outcome = { error }; });
        for (;;) {
          await readSpeech(record);
          await readPage(record);
          const observed = now();
          // Timeliness is the Node time this read returned; the event's page-clock t is never used.
          const keyErrors = judgeKeys(record.page.events.filter(e => e.type === 'keydown'), keys[index]);
          // A wrong or repeated key is final (later events cannot undo it); only "none yet" keeps waiting.
          if (keyErrors.length && !same(keyErrors, judgeKeys([], keys[index]))) throw problem('incomplete', `ack: ${keyErrors.join('; ')}`);
          if (seen === null && !keyErrors.length) {
            seen = { seq: record.page.events.find(e => e.type === 'keydown' && e.key === keys[index].key)?.seq ?? null, at: observed };
          }
          const current = gateRelease(record, action.step, keys[index], observed);
          if (release !== null && current !== release) throw problem('ambiguous', 'gate receipt: release time changed');
          release = current;
          if (release !== null && until === null) {
            until = release + observationMs; // Set once, not after the executor settles.
            record.observation_window = { clock: NODE_CLOCK, reference: 'gate-release', from: release,
              to: until, policy_ms: observationMs };
          }
          if (release !== null && record.ack_seq === null) {
            if (seen && seen.at > release + ACK_MS) {
              record.ack_timing.late_observed_at = seen.at;
              throw problem('incomplete', `ack: page key observed after ${ACK_MS} ms of gate release`);
            }
            if (seen && seen.at < record.ack_timing.commit_not_before) throw problem('ambiguous', 'ack: page key observed before the gate commit window');
            if (seen) { record.ack_seq = seen.seq; record.ack_timing.observed_at = seen.at; }
            else if (observed >= release + ACK_MS) throw problem('incomplete', `ack: not observed within ${ACK_MS} ms of gate release`);
          }
          if (outcome && !receiptFinished) {
            if (outcome.error) throw outcome.error;
            record.execution.settled = executionSettled;
            receiptOpen = false;
            const receipt = await receipts.finish(action.step, { settleTimeoutMs: RECEIPT_SETTLE_MS });
            receiptFinished = true;
            record.gate_receipt = copy(receipt);
            if (receipt.complete !== true) throw problem('failed', `gate receipt incomplete: ${receipt.errors.join('; ') || 'no release receipt'}`);
            if (release !== null && receipt.released_at !== release) throw problem('ambiguous', 'gate receipt: release time changed');
            finalized = true;
            continue; // Recheck speech, page and release after settlement before completing.
          }
          // Executor settlement is still mandatory even if the speech window has elapsed.
          // Keep the original executor-request timeout, rather than letting release mask a hang.
          if (!receiptFinished && observed - record.node_window.from >= timeoutMs) throw problem('failed', 'action: timed out');
          if (receiptFinished && until !== null && record.ack_seq !== null && now() >= until) break;
          const beforeWait = now();
          let nextRead = beforeWait + pollMs;
          if (!receiptFinished) nextRead = Math.min(nextRead, record.node_window.from + timeoutMs);
          // If the window ended during settlement, do not spin on a past deadline.
          if (receiptFinished && record.ack_seq !== null && until > beforeWait) nextRead = Math.min(nextRead, until);
          if (release !== null && record.ack_seq === null) nextRead = Math.min(nextRead, release + ACK_MS);
          if (nextRead <= beforeWait) continue;
          await bounded('observation wait', context => clock.wait(nextRead - beforeWait, context));
          if (now() <= beforeWait) throw problem('incomplete', 'observation clock did not advance');
        }
      } else {
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
      }
      record.node_window.to = now();
      const keydowns = record.page.events.filter(e => e.type === 'keydown');
      const errors = judgeKeys(keydowns, keys[index]);
      if (errors.length) throw problem('incomplete', `ack: ${errors.join('; ')}`);
      const stopped = gateStop('action completion', true);
      if (stopped) throw stopped;
      record.capture_status = record.raw_seq.length ? 'speech' : 'observed-silence';
      if (!record.raw_seq.length) record.silence = { transport_live: true,
        from: receipts ? record.observation_window.from : record.node_window.from,
        to: receipts ? record.observation_window.to : record.node_window.to, unit: NODE_CLOCK };
    } catch (error) {
      record.capture_status = error.status ?? 'failed';
      record.reasons.push(error.message);
      if (error.gate_state) record.invalidated = { by: 'gate-stop', where: result.gate_stop?.where ?? null, prior_capture_status: null };
      record.execution.settled = executionSettled;
      record.execution.cancellation_requested = started && !executionSettled;
      controller.abort(); // Request promptly; no assertion that an injected executor has stopped.
      if (receiptOpen) {
        // Record the cancellation in the ledger (which stops the gate), then keep its bounded final state.
        receiptOpen = false;
        try { receipts.expire(action.step); } catch (secondary) { record.reasons.push(`recovery: ${secondary.message}`); }
        try { record.gate_receipt = copy(await receipts.finish(action.step, { settleTimeoutMs: RECEIPT_SETTLE_MS })); }
        catch (secondary) { record.reasons.push(`recovery: ${secondary.message}`); }
      }
      for (const reason of record.gate_receipt?.errors ?? []) if (!record.reasons.some(r => r.includes(reason))) record.reasons.push(`gate ${reason}`);
      // Preserve any readable partial evidence. A secondary read cannot clear the original failure.
      if (started && error.status !== 'ambiguous') {
        for (const read of [() => readSpeech(record), () => readPage(record)]) {
          try { await read(); } catch (secondary) { record.reasons.push(`recovery: ${secondary.message}`); }
        }
      }
      try { record.node_window.to = now(); } catch (secondary) { record.reasons.push(secondary.message); }
      result.reasons.push(...record.reasons.map(reason => `${action.step}: ${reason}`));
      return done();
    }
  }
  // A second boundary read catches arrivals between the final speech sample and page snapshot.
  try { await readSpeech(null, true); await readPage(null, true); }
  catch (error) {
    controller.abort();
    // Re-read rather than trust which error won: a stop alongside another read failure still demotes the record.
    const state = receipts ? receipts.gateState() : null;
    if (error.gate_state || (receipts && !gateLive(state))) {
      if (!error.gate_state) result.reasons.push(`final boundary: ${error.message}`);
      invalidateForGateStop(result, 'final boundary', error.gate_state ?? state);
    } else result.reasons.push(`final boundary: ${error.message}`);
    return done();
  }
  // Every receipt the ledger expects must be complete, not just the ones this journey asked for.
  if (receipts && receipts.read().complete !== true) { result.reasons.push('final boundary: gate receipt ledger journey incomplete'); return done(); }
  // Last check, with no await between it and the return. A stop after this is the binding's (or caller's) to see.
  const stopped = gateStop('completion', true);
  if (stopped) { invalidateForGateStop(result, 'final boundary: completion', stopped.gate_state); return done(); }
  result.completed = true;
  result.outcome = 'COMPLETE';
  return done();
}
