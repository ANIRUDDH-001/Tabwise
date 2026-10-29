// M1 offline composition ONLY. All injected boundaries must be synthetic.
// No loader, browser launch, NVDA client, physical-send path or model call here.
import {captureJourney} from './capture.mjs';
import {createPageProvider} from './page-provider.mjs';
import {createGuardedPressExecutor} from '../../scripts/tabwise/executor.mjs';
import {SUPPORTED_PRESS} from '../../scripts/tabwise/input-policy.mjs';
import {buildArmPayload} from './preparation.mjs';

const SOURCE = 'synthetic-unattested';
const positive = value => Number.isFinite(value) && value > 0;
// Bounded subset of preparation.mjs runner IDs: f-<lowercase hex segments>
// (3..66 ASCII characters) and a<digits> (2..13 ASCII characters). Exact full
// matches reject trailing newlines too. Syntax does NOT establish independent
// blinding, random assignment, entropy or label-free custody of otherwise valid IDs.
const opaque = (value, pattern, maximum) => typeof value === 'string' && value.length <= maximum && pattern.exec(value)?.[0] === value;
const fixtureId = value => opaque(value, /^f-[a-f0-9]+(?:-[a-f0-9]+)*$/, 66);
const actionId = value => opaque(value, /^a[0-9]+$/, 13);

export async function captureOfflineJourney({fixture_id, actions, speech, page, executorBindings, clock,
  observationMs, pollMs = 10, timeoutMs = 1000}) {
  // Validate the WHOLE journey before reading a provider, persisting an intent or
  // constructing the existing executor. Never inherit capture.mjs's broader keys.
  if (!fixtureId(fixture_id) || !Array.isArray(actions) || !actions.length ||
    actions.some(a => !actionId(a?.step)) || new Set(actions.map(a => a.step)).size !== actions.length) throw Error('invalid offline journey identity');
  for (const action of actions) if (!SUPPORTED_PRESS.includes(action.press)) throw Error(`unsupported press: ${action.press}`);
  if (typeof speech?.read !== 'function' || typeof page?.read !== 'function' ||
    typeof clock?.now !== 'function' || typeof clock?.wait !== 'function' ||
    !positive(observationMs) || !positive(pollMs) || !positive(timeoutMs)) throw Error('missing offline observation bindings or invalid duration');
  for (const method of ['isStopped','arm','disarm','idle','stop','status']) {
    if (typeof executorBindings?.guard?.[method] !== 'function') throw Error('missing guarded executor binding');
  }
  const journey = actions.map(({step,press}) => ({step,press}));
  const executor = createGuardedPressExecutor({...executorBindings, steps:journey.map(a => ({step:a.step,key:a.press}))});
  const observedPage = createPageProvider({readJournal: context => page.read(context)});
  let sourceSeen = false, previousSource;
  const observedSpeech = {async read(context) {
    const value = await speech.read(context);
    if (!value) return value;
    if (sourceSeen && value.source !== previousSource) throw Error('synthetic speech source changed');
    sourceSeen = true; previousSource = value.source;
    return {...value, source:SOURCE};
  }};
  const result = await captureJourney({fixture_id, actions:journey, speech:observedSpeech, page:observedPage,
    execute:executor.execute, clock, observationMs, pollMs, timeoutMs});
  result.source = SOURCE;
  result.provenance = {kind:'synthetic', attestation:'UNATTESTED', scope:'offline injected providers; no real NVDA or guarded execution attestation'};
  // captureJourney owns the unchanged request-relative acknowledgement cap and
  // its UNVERIFIED quiescence markers. Executor return values are not receipts.
  return result;
}

// Local diagnostic evidence contains page state/events; model-facing data must
// cross this explicit allowlist. No raw capture object is passed to a model.
export function speechModelPayload(capture) {
  if (capture?.completed !== true || capture.source !== SOURCE || capture.guarded_execution_verified !== false ||
    capture.provenance?.kind !== 'synthetic' || capture.provenance?.attestation !== 'UNATTESTED') throw Error('incomplete or non-synthetic offline capture');
  if (!fixtureId(capture.fixture_id) || !Array.isArray(capture.records) || !capture.records.length ||
    capture.records.some(r => typeof r?.text !== 'string' || !actionId(r.step) ||
      !SUPPORTED_PRESS.includes(r.press) || !Number.isSafeInteger(r.seq) || r.seq <= 0)) throw Error('invalid speech payload record');
  if (new Set(capture.records.map(r => r.step)).size !== capture.records.length) throw Error('invalid speech payload action identifiers');
  return buildArmPayload('speech', {fixture_id:capture.fixture_id, speech:capture.records,
    actions:capture.records.map(({step,press}) => ({step,press}))});
}
