// R2 offline evidence contract (PLAN F-03). Pure functions: no browser, NVDA, model or network.
import { createHash } from 'node:crypto';

export const CAPS = { usd: 1.5, hours: 2 };
const pageKey = (file) => file.replace(/\.html$/, '');
const sameLocus = (a, b) => !!a && !!b && a.step === b.step && a.element === b.element;

// Page bytes are hashed as UTF-8 text with CRLF normalised to LF, like the R1 lock (git autocrlf varies per checkout).
export const textOf = (buf) => buf.toString('utf8').replace(/\r\n/g, '\n');
export const pageHash = (buf) => createHash('sha256').update(textOf(buf)).digest('hex');

export function validateFixtures(manifest, read) {
  const errors = [];
  if (!['development', 'withheld'].includes(manifest?.split)) errors.push('split must be development or withheld');
  if (!Array.isArray(manifest?.pairs) || !manifest.pairs.length) return [...errors, 'no pairs'];
  for (const p of manifest.pairs) {
    const text = {};
    for (const kind of ['healthy', 'broken']) {
      const file = p[kind]?.file;
      let buf;
      try { buf = read(file); } catch { errors.push(`${p.id}: cannot read ${kind} page ${file}`); continue; }
      if (pageHash(buf) !== p[kind].sha256) errors.push(`sha256 mismatch: ${file}`);
      text[kind] = textOf(buf);
    }
    const { healthy: h, broken: b } = p.defect ?? {};
    if (typeof h !== 'string' || typeof b !== 'string' || h === b) errors.push(`${p.id}: defect must declare distinct healthy and broken snippets`);
    else if (text.healthy !== undefined && (text.healthy.split(h).length !== 2 || text.healthy.replace(h, b) !== text.broken)) errors.push(`${p.id}: declared defect does not reproduce broken`);
    const steps = (p.task ?? []).map((s) => s.step);
    if (!steps.length || new Set(steps).size !== steps.length) errors.push(`${p.id}: task steps missing or duplicated`);
    if (!steps.includes(p.locus?.step) || !p.locus?.element) errors.push(`${p.id}: locus must name a task step and an element id`);
    if (!p.expected_at?.healthy || !p.expected_at?.broken) errors.push(`${p.id}: expected AT behaviour missing`);
  }
  return errors;
}

// Scoring is allowed only on withheld pages that are not byte-equal (after EOL normalisation) to any development page,
// with labels written by someone other than the runner and reviewed by a second person who is also not the runner.
export function assertEvaluable({ manifest, labels, runner, devHashes }) {
  const errors = [];
  if (manifest.split !== 'withheld') errors.push(`split is ${manifest.split}, not withheld`);
  if (!labels?.labeler || labels.labeler === runner) errors.push('labeler is the runner (or missing)');
  if (labels?.independent !== true) errors.push('labels are not independent');
  if (!labels?.reviewed_by || labels.reviewed_by === runner) errors.push('labels not reviewed by someone other than the runner');
  if (labels?.reviewed_by && labels.reviewed_by === labels.labeler) errors.push('second reviewer must be distinct from label author');
  const dev = new Set(devHashes);
  for (const p of manifest.pairs) {
    for (const kind of ['healthy', 'broken']) {
      const key = pageKey(p[kind].file), label = labels?.pages?.[key];
      if (dev.has(p[kind].sha256)) errors.push(`${key} is a development page`);
      if (!label) errors.push(`no label for ${key}`);
      else if (label.barrier && !label.locus?.step) errors.push(`${key}: barrier label without locus`);
    }
  }
  return errors;
}

// Chromium KeyboardEvent semantics for a declared press (C-1): Space -> key ' ', Shift+Tab -> key 'Tab' with shiftKey,
// any other press -> key equal to the press without shift. Shared by alignTimeline and captureJourney.
export function expectedKey(press) {
  if (typeof press !== 'string' || !press || /^(Control|Alt|Meta|Insert|Shift)$/.test(press)) throw Error('unsupported press');
  const shift = press.startsWith('Shift+');
  const key = shift ? press.slice(6) : press;
  if (key.includes('+') || !key) throw Error('unsupported press');
  return { key: key === 'Space' ? ' ' : key, shift };
}
const keyMatches = (event, want) => event?.key === want.key && event.shift === want.shift && !event.ctrl && !event.alt && !event.meta && !event.repeat;

// One timeline per page. Node-side speech is grouped per action by the capture records; page events are ordered by
// page seq and assigned to the action whose acknowledged keydown (ack_seq) most recently precedes them.
// Raw clocks from different processes are never subtracted or compared.
export function alignTimeline({ actions, speech, page }) {
  const insufficient = [];
  const events = [...page].sort((a, b) => a.seq - b.seq);
  const keydowns = new Set(events.filter((e) => e.type === 'keydown').map((e) => e.seq));
  let last = -Infinity;
  for (const a of actions) {
    if (a.ack_seq == null) insufficient.push(`${a.step}: no acknowledged keydown`);
    else if (!keydowns.has(a.ack_seq)) insufficient.push(`${a.step}: ack seq ${a.ack_seq} is not a page keydown`);
    else if (a.ack_seq <= last) insufficient.push(`${a.step}: acknowledgements out of order`);
    else last = a.ack_seq;
    if (a.press != null) {
      let want = null;
      try { want = expectedKey(a.press); } catch { insufficient.push(`${a.step}: unsupported declared press`); }
      if (want && !keyMatches(events.find((e) => e.seq === a.ack_seq), want)) insufficient.push(`${a.step}: acknowledged key differs from declared press`);
    }
    if (!speech.some((s) => s.step === a.step)) insufficient.push(`${a.step}: no speech record`);
  }
  for (let i = 1; i < events.length; i++) if (!(events[i].seq > events[i - 1].seq)) insufficient.push(`page seq not strictly increasing at ${events[i].seq}`);
  const acked = actions.filter((a) => a.ack_seq != null);
  const firstAck = acked.length ? acked[0].ack_seq : Infinity;
  const windows = actions.map((a) => {
    const next = acked.find((b) => b.ack_seq > a.ack_seq)?.ack_seq ?? Infinity;
    return {
      step: a.step,
      speech: speech.filter((s) => s.step === a.step).map((s) => s.text),
      page: a.ack_seq == null ? [] : events.filter((e) => e.seq >= a.ack_seq && e.seq < next),
    };
  });
  return { windows, pre: events.filter((e) => e.seq < firstAck), insufficient };
}

// claim: { verdict: 'barrier' | 'no-barrier' | 'abstain', locus?: { step, element } }; label: { barrier, locus? }.
export function judgePage({ label, claim, insufficient = [] }) {
  if (insufficient.length) return { outcome: 'INSUFFICIENT_EVIDENCE', reason: insufficient.join('; ') };
  if (claim?.verdict === 'abstain') return { outcome: 'ABSTAIN', reason: 'abstained' };
  if (!['barrier', 'no-barrier'].includes(claim?.verdict)) return { outcome: 'INSUFFICIENT_EVIDENCE', reason: 'malformed claim' };
  if (!label.barrier) return claim.verdict === 'barrier' ? { outcome: 'FAIL', reason: 'barrier claimed on healthy page' } : { outcome: 'PASS', reason: 'no barrier claimed' };
  if (claim.verdict === 'no-barrier') return { outcome: 'FAIL', reason: 'barrier missed' };
  return sameLocus(claim.locus, label.locus) ? { outcome: 'PASS', reason: 'located' } : { outcome: 'FAIL', reason: 'wrong locus' };
}

const VISUAL_KEY = /screenshot|image|html|^dom$|^dom[_-]|[_-]dom$|snapshot|png|jpe?g|ax_?tree|accessibility_?tree/i;
const VISUAL_VALUE = /^data:image\/|<\s*(?:!doctype|html|body)\b/i;
const SPEECH_KEY = /speech|transcript|spoken|utterance/i;

function walk(value, path, visit) {
  if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, visit));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { visit(k, v, `${path}.${k}`); walk(v, `${path}.${k}`, visit); }
}

// R1 row rule carried into R2: the speech arm sees no screenshots, images or DOM.
export function speechPayloadErrors(payload) {
  const errors = [];
  walk(payload, '$', (k, v, path) => {
    if (VISUAL_KEY.test(k)) errors.push(`speech payload contains ${path}`);
    else if (typeof v === 'string' && VISUAL_VALUE.test(v)) errors.push(`speech payload contains visual content at ${path}`);
  });
  return errors;
}

export function armErrors(speech, visual) {
  const errors = [];
  for (const arm of [speech, visual]) {
    if (['model', 'version', 'mode'].some((k) => typeof arm[k] !== 'string' || !arm[k].trim())) errors.push('arms require explicit model, version and mode');
  }
  if (speech.model !== visual.model || speech.version !== visual.version) errors.push('arms must use the same model and version');
  if (speech.mode !== visual.mode) errors.push('arms must use the same mode');
  errors.push(...speechPayloadErrors(speech.payload));
  walk(visual.payload, '$', (k, v, path) => { if (SPEECH_KEY.test(k)) errors.push(`visual control contains speech at ${path}`); });
  return errors;
}

// violations: axe results reduced to { id, ids: [element ids resolved from node targets] }; null when axe did not run.
export function axeMissed(violations, locus) {
  if (!Array.isArray(violations)) return null;
  return !violations.some((v) => (v.ids ?? []).includes(locus.element));
}

export function judgeR2(run) {
  const reasons = [...(run.evaluable ?? [])];
  if (!Array.isArray(run.pages) || !run.pages.some((p) => p.label?.barrier === false) || !run.pages.some((p) => p.label?.barrier === true)) reasons.push('healthy and broken controls required');
  if (Array.isArray(run.pages) && new Set(run.pages.map((p) => p.page)).size !== run.pages.length) reasons.push('duplicate page IDs');
  if (!(run.cost_usd <= CAPS.usd)) reasons.push(`cost ${run.cost_usd} exceeds or lacks $${CAPS.usd} cap`);
  if (!(run.elapsed_h <= CAPS.hours)) reasons.push(`elapsed ${run.elapsed_h} h exceeds or lacks ${CAPS.hours} h cap`);
  if (!run.arms?.speech || !run.arms?.visual) reasons.push('same-model speech and visual arms required');
  else reasons.push(...armErrors(run.arms.speech, run.arms.visual));
  if (reasons.length) return { outcome: 'INSUFFICIENT_EVIDENCE', reasons, qualifying: [], causal_claim: false, pages: [] };

  const pages = run.pages.map((p) => ({
    page: p.page, barrier: !!p.label.barrier,
    speech: judgePage({ label: p.label, claim: p.speech, insufficient: p.insufficient }).outcome,
    visual: judgePage({ label: p.label, claim: p.visual }).outcome,
    axe_missed: p.label.barrier ? axeMissed(p.axe, p.label.locus) : null,
  }));
  const healthy = pages.filter((p) => !p.barrier), broken = pages.filter((p) => p.barrier);
  const qualifying = broken.filter((p) => p.speech === 'PASS' && p.axe_missed === true);
  const result = (outcome, why) => ({
    outcome, reasons: why ? [why] : [], pages, qualifying: qualifying.map((p) => p.page),
    // Kill check 2026-10-29: if the same-model visual control also localizes every qualifying barrier, no causal claim.
    causal_claim: outcome === 'PASS' && qualifying.some((p) => p.visual === 'FAIL'),
  });
  const falseClaims = healthy.filter((p) => p.speech === 'FAIL');
  if (falseClaims.length) return result('FAIL', `barrier claimed on healthy page: ${falseClaims.map((p) => p.page).join(', ')}`);
  if (healthy.some((p) => p.speech === 'INSUFFICIENT_EVIDENCE' || p.speech === 'ABSTAIN')) return result('INSUFFICIENT_EVIDENCE', 'healthy page lacks evidence');
  if (qualifying.length) return result('PASS');
  if (broken.some((p) => p.speech === 'INSUFFICIENT_EVIDENCE' || (p.speech === 'PASS' && p.axe_missed === null))) return result('INSUFFICIENT_EVIDENCE', 'broken page lacks speech or axe evidence');
  return result('FAIL', 'no axe-missed barrier located');
}
