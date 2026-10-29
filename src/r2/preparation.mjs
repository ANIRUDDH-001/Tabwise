// Bounded offline R2 package preparation. No NVDA, inference or hosted execution.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const fail = message => { throw new Error(message); };
const hashPattern = /^[a-f0-9]{64}$/;

function externalRoot(root) {
  let cursor = fs.realpathSync(root);
  for (;;) {
    if (fs.existsSync(path.join(cursor, '.git'))) fail('withheld package must be outside every Git worktree');
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}

function files(root, relative = '') {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name, 'en')).flatMap(entry => {
    const file = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) fail(`integrity: symlink refused: ${file}`);
    if (entry.isDirectory()) return files(root, file);
    if (!entry.isFile()) fail(`integrity: non-file: ${file}`);
    return [file];
  });
}

function safeFile(root, file) {
  if (typeof file !== 'string' || !file || file.includes('\\') || file.startsWith('/') || file.split('/').some(s => s === '..' || s === '.' || s.includes(':'))) fail('integrity: unsafe path');
  const target = path.join(root, file);
  let current = root;
  for (const part of file.split('/')) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) fail('integrity: symlink refused');
  }
  return target;
}

const onlyFields = (value, allowed, context) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) fail(`${context}: unexpected field`);
};

function runnerManifest(root) {
  const manifest = readJSON(safeFile(root, 'runner/manifest.json'));
  onlyFields(manifest, ['schema', 'dataset_id', 'fixtures'], 'runner manifest field');
  if (manifest.schema !== 'r2-runner/1' || typeof manifest.dataset_id !== 'string' || !manifest.dataset_id || !Array.isArray(manifest.fixtures) || !manifest.fixtures.length) fail('runner manifest invalid');
  const ids = new Set();
  for (const fixture of manifest.fixtures) {
    onlyFields(fixture, ['id', 'file', 'journey'], 'runner fixture field');
    if (!/^f-[a-f0-9-]+$/.test(fixture.id) || ids.has(fixture.id)) fail('runner IDs must be opaque and unique');
    ids.add(fixture.id);
    if (fixture.file !== `pages/${fixture.id}.html`) fail('runner path must use only fixture ID');
    safeFile(root, `runner/${fixture.file}`);
    if (!Array.isArray(fixture.journey) || !fixture.journey.length) fail('runner journey required');
    const steps = new Set();
    for (const step of fixture.journey) {
      onlyFields(step, ['step', 'press'], 'runner action field');
      if (!/^a\d+$/.test(step.step) || steps.has(step.step) || typeof step.press !== 'string' || !step.press) fail('runner action invalid');
      steps.add(step.step);
    }
  }
  return manifest;
}

// Similarity catches trivial whitespace/comment derivatives, not arbitrary semantic copying.
export const sourceFingerprint = text => digest(text.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ''));

export function sealPackage(root, { developmentSources = [] } = {}) {
  externalRoot(root);
  if (fs.existsSync(path.join(root, 'seal.json'))) fail('seal already exists; use a new package revision');
  const manifest = runnerManifest(root);
  const origins = readJSON(safeFile(root, 'custody/provenance.json')).origins;
  const labels = readJSON(safeFile(root, 'custody/labels.json'));
  const fingerprints = new Set(developmentSources.map(sourceFingerprint));
  for (const fixture of manifest.fixtures) {
    const origin = origins?.find(o => o.id === fixture.id);
    if (!origin || origin.origin !== 'newly-authored' || !Array.isArray(origin.derived_from) || origin.derived_from.length) fail('development derivative or missing fresh-source provenance');
    if (fingerprints.has(sourceFingerprint(fs.readFileSync(path.join(root, 'runner', fixture.file), 'utf8')))) fail('development source derivative refused');
    if (typeof labels.pages?.[fixture.id]?.barrier !== 'boolean') fail('custody label missing');
  }
  const inventory = Object.fromEntries(files(root).map(file => [file, digest(fs.readFileSync(safeFile(root, file)))]));
  const seal = { schema: 'r2-seal/1', dataset_id: manifest.dataset_id, files: inventory };
  const bytes = jsonBytes(seal);
  fs.writeFileSync(path.join(root, 'seal.json'), bytes, { flag: 'wx' });
  return digest(bytes);
}

function anchoredSeal(root, anchor) {
  externalRoot(root);
  if (!hashPattern.test(anchor ?? '')) fail('seal anchor required');
  const bytes = fs.readFileSync(safeFile(root, 'seal.json'));
  if (digest(bytes) !== anchor) fail('seal anchor mismatch');
  const seal = JSON.parse(bytes);
  if (seal.schema !== 'r2-seal/1' || !seal.files || typeof seal.files !== 'object') fail('integrity: bad seal');
  return seal;
}

function runnerOnly(root, anchor) {
  const seal = anchoredSeal(root, anchor);
  for (const [file, hash] of Object.entries(seal.files).filter(([f]) => f.startsWith('runner/'))) {
    if (digest(fs.readFileSync(safeFile(root, file))) !== hash) fail(`integrity: ${file}`);
  }
  const manifest = runnerManifest(root);
  const expected = ['runner/manifest.json', ...manifest.fixtures.map(f => `runner/${f.file}`)].sort();
  const actual = files(path.join(root, 'runner')).map(f => `runner/${f}`).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('integrity: unexpected runner file');
  if (manifest.dataset_id !== seal.dataset_id) fail('integrity: dataset mismatch');
  return manifest;
}

export function verifyPackage(root, anchor) {
  const seal = anchoredSeal(root, anchor);
  const actual = files(root).filter(f => f !== 'seal.json').sort();
  if (JSON.stringify(actual) !== JSON.stringify(Object.keys(seal.files).sort())) fail('integrity: file inventory changed');
  for (const [file, hash] of Object.entries(seal.files)) if (digest(fs.readFileSync(safeFile(root, file))) !== hash) fail(`integrity: ${file}`);
  runnerOnly(root, anchor);
  return { ok: true, files: actual.length, dataset_id: seal.dataset_id };
}

// Trusted custodian operation. The resulting directory is the ONLY runner input.
export function exportRunner(root, anchor, destination) {
  verifyPackage(root, anchor);
  if (fs.existsSync(destination)) fail('runner destination exists');
  fs.mkdirSync(destination, { recursive: true });
  externalRoot(destination);
  for (const file of files(path.join(root, 'runner'))) {
    const target = path.join(destination, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, 'runner', file), target, fs.constants.COPYFILE_EXCL);
  }
}

function predictionErrors(predictions, manifest) {
  const errors = [];
  if (predictions?.dataset_id !== manifest.dataset_id || !Array.isArray(predictions?.arms)) return ['prediction dataset or arms invalid'];
  const expected = new Set(manifest.fixtures.flatMap(f => ['speech', 'visual'].map(arm => `${arm}/${f.id}`)));
  const seen = new Set();
  for (const prediction of predictions.arms) {
    const key = `${prediction.arm}/${prediction.id}`;
    if (!expected.has(key) || seen.has(key) || !['barrier', 'no-barrier', 'abstain'].includes(prediction.verdict)) errors.push('prediction identity, duplication or verdict invalid');
    seen.add(key);
  }
  if (seen.size !== expected.size) errors.push('predictions incomplete');
  return errors;
}

// Does not open custody files. A separate caller must retain the returned freeze anchor.
export function freezePredictions(root, packageAnchor, predictions, destination) {
  const manifest = runnerOnly(root, packageAnchor);
  const errors = predictionErrors(predictions, manifest);
  if (errors.length) fail(errors.join('; '));
  fs.mkdirSync(destination); // exclusive directory creation; never replace predictions
  externalRoot(destination);
  const bytes = jsonBytes(predictions);
  fs.writeFileSync(path.join(destination, 'predictions.json'), bytes, { flag: 'wx' });
  const freeze = jsonBytes({ schema: 'r2-predictions/1', package_sha256: packageAnchor, predictions_sha256: digest(bytes) });
  fs.writeFileSync(path.join(destination, 'freeze.json'), freeze, { flag: 'wx' });
  return digest(freeze);
}

export function officialReadiness(labels) {
  if (labels?.status === 'PROVISIONAL' || labels?.independent !== true) return ['PROVISIONAL: separate blinded ground-truth review required'];
  // Identity strings alone cannot establish independence. This preparation does not implement reviewer attestation.
  return ['Official independent-review attestation and hosted evidence validation are not implemented'];
}

export function openScoring(root, packageAnchor, frozenRoot, freezeAnchor) {
  const freezeFile = path.join(frozenRoot, 'freeze.json');
  if (!fs.existsSync(freezeFile)) fail('freeze required before labels can be opened');
  const freezeBytes = fs.readFileSync(safeFile(frozenRoot, 'freeze.json'));
  if (!hashPattern.test(freezeAnchor ?? '') || digest(freezeBytes) !== freezeAnchor) fail('freeze anchor mismatch');
  const freeze = JSON.parse(freezeBytes);
  const bytes = fs.readFileSync(safeFile(frozenRoot, 'predictions.json'));
  if (freeze.schema !== 'r2-predictions/1' || freeze.package_sha256 !== packageAnchor || digest(bytes) !== freeze.predictions_sha256) fail('prediction integrity mismatch');
  const predictions = JSON.parse(bytes);
  const errors = predictionErrors(predictions, runnerOnly(root, packageAnchor));
  if (errors.length) fail(errors.join('; '));
  // First custody reads on the evaluation/scoring path are below the frozen-prediction checks.
  verifyPackage(root, packageAnchor);
  const labels = readJSON(safeFile(root, 'custody/labels.json'));
  return { outcome: 'INSUFFICIENT_EVIDENCE', reasons: officialReadiness(labels), predictions, labels };
}

export function speechEvidenceErrors(capture, raw, steps) {
  const errors = [];
  if (capture?.source !== 'nvda' || capture?.completed !== true) errors.push('observed NVDA capture incomplete or source is not NVDA');
  if (!Array.isArray(raw) || !Array.isArray(capture?.records)) return [...errors, 'speech/raw records missing'];
  const used = new Set();
  const rawIds = new Set(raw.map(r => r.seq));
  if (rawIds.size !== raw.length) errors.push('duplicate raw sequence');
  let last = -Infinity;
  for (const step of steps) {
    const records = capture.records.filter(r => r.step === step);
    if (!records.length) errors.push(`${step}: no speech record`);
    for (const record of records) {
      if (!Number.isInteger(record.seq) || record.seq <= last || typeof record.text !== 'string' || !Array.isArray(record.raw_seq)) { errors.push(`${step}: malformed speech record`); continue; }
      last = record.seq;
      const source = record.raw_seq.map(seq => raw.find(r => r.seq === seq));
      if (source.some(r => !r || r.source !== 'nvda') || new Set(record.raw_seq).size !== record.raw_seq.length || record.raw_seq.some(seq => used.has(seq))) errors.push(`${step}: missing/reused raw NVDA source`);
      record.raw_seq.forEach(seq => used.add(seq));
      if (record.text) {
        if (!source.length || source.map(r => r?.text).join('\n') !== record.text) errors.push(`${step}: speech differs from raw transport`);
      } else {
        const silence = record.silence;
        if (record.raw_seq.length || silence?.transport_live !== true || silence?.unit !== 'node-monotonic-ms' || !Number.isFinite(silence.from) || !Number.isFinite(silence.to) || silence.to <= silence.from) errors.push(`${step}: undocumented silence window`);
      }
    }
  }
  if (capture.records.some(r => !steps.includes(r.step))) errors.push('speech outside declared journey');
  return errors;
}

// Build from allowlists; never pass page, focus, axe, expectations or manifest objects to a model.
export function buildArmPayload(arm, evidence) {
  const records = arm === 'speech' ? evidence.speech : evidence.screenshots;
  if (!Array.isArray(records) || !records.length) fail('missing arm evidence');
  if (!['speech', 'visual'].includes(arm)) fail('unknown arm');
  const payload = { fixture_id: evidence.fixture_id, observations: records.map(r => ({
    step: r.step, ...(Number.isInteger(r.seq) ? { ref: `${arm}:${r.seq}` } : {}), ...(arm === 'speech' ? { speech: r.text } : { image: r.image }),
  })) };
  if (evidence.actions) payload.actions = evidence.actions.map(a => ({ step: a.step, press: a.press }));
  return payload;
}

export function localizationMatches(claim, label, observations) {
  const step = claim?.step ?? claim?.locus?.step;
  const targetMatches = Array.isArray(label?.accepted_targets) ? label.accepted_targets.includes(claim?.target) : claim?.locus?.element === label?.locus?.element;
  return claim?.verdict === 'barrier' && label?.barrier === true && step === label.locus?.step && targetMatches &&
    typeof claim.mechanism === 'string' && claim.mechanism.trim().length > 0 && Array.isArray(claim.observation_refs) && claim.observation_refs.length > 0 &&
    claim.observation_refs.every(ref => observations.some(o => o.ref === ref && o.step === step));
}
