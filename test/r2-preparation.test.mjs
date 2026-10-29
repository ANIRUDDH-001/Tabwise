import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as prep from '../src/r2/preparation.mjs';

function sample(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r2-preparation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pkg = path.join(root, 'package');
  fs.mkdirSync(path.join(pkg, 'runner/pages'), { recursive: true });
  fs.mkdirSync(path.join(pkg, 'custody'));
  const ids = ['f-09a1', 'f-52b7'];
  for (const id of ids) fs.writeFileSync(path.join(pkg, `runner/pages/${id}.html`), `<h1>${id}</h1>`);
  const manifest = { schema: 'r2-runner/1', dataset_id: 'set-a', fixtures: ids.map(id => ({ id, file: `pages/${id}.html`, journey: [{ step: 'a01', press: 'Tab' }] })) };
  fs.writeFileSync(path.join(pkg, 'runner/manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(pkg, 'custody/labels.json'), JSON.stringify({ status: 'PROVISIONAL', independent: false, author: 'author', reviewed_by: null, pages: { 'f-09a1': { barrier: false }, 'f-52b7': { barrier: true } } }));
  fs.writeFileSync(path.join(pkg, 'custody/provenance.json'), JSON.stringify({ origins: ids.map(id => ({ id, origin: 'newly-authored', derived_from: [] })) }));
  return { root, pkg, ids };
}

test('R2 preparation: rejects provisional labels for official scoring', () => {
  assert.equal(typeof prep.officialReadiness, 'function');
  assert.deepEqual(prep.officialReadiness({ status: 'PROVISIONAL', independent: false }), ['PROVISIONAL: separate blinded ground-truth review required']);
});

test('R2 preparation: seal detects changed bytes, added files and a changed seal anchor', t => {
  const { pkg } = sample(t);
  const anchor = prep.sealPackage(pkg);
  assert.equal(prep.verifyPackage(pkg, anchor).ok, true);
  fs.writeFileSync(path.join(pkg, 'runner/pages/f-09a1.html'), 'tampered');
  assert.throws(() => prep.verifyPackage(pkg, anchor), /integrity/);
  assert.throws(() => prep.verifyPackage(pkg, '0'.repeat(64)), /anchor/);
});

test('R2 preparation: runner export has no custody labels, pair IDs or expected outcomes', t => {
  const { pkg, root } = sample(t);
  const anchor = prep.sealPackage(pkg);
  const out = path.join(root, 'runner-only');
  prep.exportRunner(pkg, anchor, out);
  assert.deepEqual(fs.readdirSync(out).sort(), ['manifest.json', 'pages']);
  assert.equal(fs.existsSync(path.join(out, 'custody')), false);
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json')));
  assert.equal(manifest.fixtures.length, 2);
  assert.equal(JSON.stringify(manifest).includes('barrier'), false);
});

test('R2 preparation: rejects manifest label injection and declared development derivatives', t => {
  const { pkg } = sample(t);
  const file = path.join(pkg, 'runner/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file)); manifest.fixtures[0].expected = 'healthy';
  fs.writeFileSync(file, JSON.stringify(manifest));
  assert.throws(() => prep.sealPackage(pkg), /runner.*field/);
  delete manifest.fixtures[0].expected; fs.writeFileSync(file, JSON.stringify(manifest));
  fs.writeFileSync(path.join(pkg, 'custody/provenance.json'), JSON.stringify({ origins: manifest.fixtures.map(f => ({ id: f.id, origin: 'development', derived_from: ['development-page'] })) }));
  assert.throws(() => prep.sealPackage(pkg), /development|derivative/);
});

test('R2 preparation: labels remain unopened until complete predictions have been frozen', t => {
  const { pkg, root } = sample(t);
  const anchor = prep.sealPackage(pkg);
  const freeze = path.join(root, 'frozen');
  assert.throws(() => prep.openScoring(pkg, anchor, freeze, '0'.repeat(64)), /freeze/);
  const predictions = { dataset_id: 'set-a', arms: ['speech', 'visual'].flatMap(arm => ['f-09a1', 'f-52b7'].map(id => ({ arm, id, verdict: 'abstain' }))) };
  const frozenAnchor = prep.freezePredictions(pkg, anchor, predictions, freeze);
  const opened = prep.openScoring(pkg, anchor, freeze, frozenAnchor);
  assert.equal(opened.outcome, 'INSUFFICIENT_EVIDENCE');
  assert.match(opened.reasons.join(), /PROVISIONAL/);
  assert.throws(() => prep.freezePredictions(pkg, anchor, predictions, freeze), /exist|EEXIST/);
  fs.appendFileSync(path.join(freeze, 'predictions.json'), ' ');
  assert.throws(() => prep.openScoring(pkg, anchor, freeze, frozenAnchor), /prediction.*integrity/);
});

test('R2 preparation: refuses incomplete, duplicated or unknown prediction identities', t => {
  const { pkg, root } = sample(t);
  const anchor = prep.sealPackage(pkg);
  for (const arms of [[], [{ arm: 'speech', id: 'unknown', verdict: 'abstain' }], Array(4).fill({ arm: 'speech', id: 'f-09a1', verdict: 'abstain' })]) {
    assert.throws(() => prep.freezePredictions(pkg, anchor, { dataset_id: 'set-a', arms }, path.join(root, 'bad-freeze')), /prediction/);
  }
});

test('R2 preparation: observed speech requires raw transport references, exact text and completion', () => {
  const record = { source: 'nvda', completed: true, records: [{ seq: 1, step: 'a01', text: 'Reserve seats button', raw_seq: [4] }] };
  const raw = [{ seq: 4, source: 'nvda', text: 'Reserve seats button' }];
  assert.deepEqual(prep.speechEvidenceErrors(record, raw, ['a01']), []);
  assert.ok(prep.speechEvidenceErrors({ ...record, source: 'hypothesis' }, raw, ['a01']).length);
  assert.ok(prep.speechEvidenceErrors(record, [{ ...raw[0], text: 'other' }], ['a01']).length);
  assert.ok(prep.speechEvidenceErrors({ ...record, completed: false }, raw, ['a01']).length);
  assert.ok(prep.speechEvidenceErrors({ ...record, records: [] }, raw, ['a01']).length);
});

test('R2 preparation: only a documented bounded silence observation permits empty speech', () => {
  const base = { source: 'nvda', completed: true, records: [{ seq: 1, step: 'a01', text: '', raw_seq: [] }] };
  assert.ok(prep.speechEvidenceErrors(base, [], ['a01']).length);
  base.records[0].silence = { transport_live: true, from: 10, to: 20, unit: 'node-monotonic-ms' };
  assert.deepEqual(prep.speechEvidenceErrors(base, [], ['a01']), []);
});

test('R2 preparation: allowlisted model payloads cannot inherit page events, ground truth or source', () => {
  const evidence = { fixture_id: 'f-09a1', speech: [{ step: 'a01', text: 'button' }], screenshots: [{ step: 'a01', image: 'data:image/png;base64,AAAA' }], labels: 'secret', page: 'source', focus: 'secret' };
  assert.deepEqual(prep.buildArmPayload('speech', evidence), { fixture_id: 'f-09a1', observations: [{ step: 'a01', speech: 'button' }] });
  assert.deepEqual(prep.buildArmPayload('visual', evidence), { fixture_id: 'f-09a1', observations: [{ step: 'a01', image: 'data:image/png;base64,AAAA' }] });
});

test('R2 preparation: recognizing broken is not causal localization without an action and cited observation', () => {
  const label = { barrier: true, locus: { step: 'a03', element: 'notice' } };
  const observations = [{ ref: 'speech:8', step: 'a03' }];
  assert.equal(prep.localizationMatches({ verdict: 'barrier', locus: label.locus }, label, observations), false);
  assert.equal(prep.localizationMatches({ verdict: 'barrier', locus: label.locus, observation_refs: ['speech:8'], mechanism: 'Update not announced after selecting delivery' }, label, observations), true);
  assert.equal(prep.localizationMatches({ verdict: 'barrier', locus: label.locus, observation_refs: ['invented'], mechanism: 'missing announcement' }, label, observations), false);
});
