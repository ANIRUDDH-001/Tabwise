import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeR2, armErrors, assertEvaluable, alignTimeline } from '../src/r2/contract.mjs';

const locus = { step: 'apply', element: 'message' };
function candidate() {
  return {
    evaluable: [], cost_usd: 0, elapsed_h: 0,
    arms: {
      speech: { kind: 'speech', model: 'spark', version: '1.3', mode: 'standard', payload: { speech: 'record' } },
      visual: { kind: 'visual', model: 'spark', version: '1.3', mode: 'standard', payload: { screenshot: 'frame' } },
    },
    pages: [
      { page: 'p/healthy', label: { barrier: false }, speech: { verdict: 'no-barrier' }, visual: { verdict: 'no-barrier' }, axe: [], insufficient: [] },
      { page: 'p/broken', label: { barrier: true, locus }, speech: { verdict: 'barrier', locus }, visual: { verdict: 'no-barrier' }, axe: [], insufficient: [] },
    ],
  };
}

test('R2 review: a broken-only cohort cannot earn PASS without a healthy control', () => {
  const run = candidate(); run.pages.shift();
  assert.equal(judgeR2(run).outcome, 'INSUFFICIENT_EVIDENCE');
});

test('R2 review: abstention on the healthy control is not evidence of zero false positives', () => {
  const run = candidate(); run.pages[0].speech = { verdict: 'abstain' };
  assert.equal(judgeR2(run).outcome, 'INSUFFICIENT_EVIDENCE');
});

test('R2 review: malformed or abstaining visual controls cannot support a causal claim', () => {
  for (const verdict of ['maybe', 'abstain']) {
    const run = candidate(); run.pages[1].visual = { verdict };
    assert.equal(judgeR2(run).causal_claim, false);
  }
});

test('R2 review: equality of missing model identity is not a same-model control', () => {
  assert.ok(armErrors({ payload: {} }, { payload: {} }).length);
});

test('R2 review: a label author cannot also be its second independent reviewer', () => {
  const manifest = { split: 'withheld', pairs: [{ id: 'x', healthy: { file: 'x/healthy.html', sha256: 'a' }, broken: { file: 'x/broken.html', sha256: 'b' } }] };
  const labels = { labeler: 'same', reviewed_by: 'same', independent: true, pages: { 'x/healthy': { barrier: false }, 'x/broken': { barrier: true, locus } } };
  assert.match(assertEvaluable({ manifest, labels, runner: 'other', devHashes: [] }).join(), /second|distinct/);
});

test('R2 review: an acknowledgement of the wrong key is insufficient when a press is declared', () => {
  const result = alignTimeline({ actions: [{ step: 'apply', press: 'Enter', ack_seq: 1 }], speech: [{ step: 'apply', text: '' }], page: [{ seq: 1, type: 'keydown', key: 'Tab' }] });
  assert.match(result.insufficient.join(), /key/);
});
