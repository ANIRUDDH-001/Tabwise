import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceFingerprint, localizationMatches, speechEvidenceErrors, buildArmPayload } from '../src/r2/preparation.mjs';

test('R2 preparation: comment and whitespace edits do not turn development into independent fixtures', () => {
  assert.equal(sourceFingerprint('<main>Value</main>'), sourceFingerprint('<!-- edited -->\n <main>Value</main>'));
});

test('R2 localization: speech can localize a named control without knowing its private DOM ID', () => {
  const label = { barrier: true, locus: { step: 'a03', element: 'private-node' }, accepted_targets: ['Seat count validation message'] };
  const claim = { verdict: 'barrier', step: 'a03', target: 'Seat count validation message', mechanism: 'No error announcement after leaving invalid seat count', observation_refs: ['speech:3'] };
  assert.equal(localizationMatches(claim, label, [{ ref: 'speech:3', step: 'a03' }]), true);
  assert.equal(localizationMatches({ ...claim, step: 'a02' }, label, [{ ref: 'speech:3', step: 'a03' }]), false);
});

test('R2 evidence: forged speech records with duplicate raw references are insufficient', () => {
  assert.ok(speechEvidenceErrors({ source: 'nvda', completed: true, records: [{ step: 'a01', seq: 1, text: 'x\nx', raw_seq: [2, 2] }] }, [{ seq: 2, source: 'nvda', text: 'x' }], ['a01']).length);
});

test('R2 payload: neither arm accepts missing evidence as an empty complete payload', () => {
  assert.throws(() => buildArmPayload('speech', { fixture_id: 'f-aa', speech: [] }), /evidence/);
  assert.throws(() => buildArmPayload('visual', { fixture_id: 'f-aa', screenshots: [] }), /evidence/);
});
