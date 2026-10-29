// R2 offline evidence contract: fixtures, labels, timeline alignment and scoring. No browser, NVDA or model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  validateFixtures, assertEvaluable, alignTimeline, judgePage, judgeR2,
  speechPayloadErrors, armErrors, axeMissed,
} from '../src/r2/contract.mjs';

const root = new URL('../fixtures/r2/', import.meta.url);
const read = (file) => readFileSync(new URL(file, root));
const json = (file) => JSON.parse(read(file));
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const manifest = json('manifest.json');
const labels = json('labels.development.json');
const devHashes = json('development-hashes.json');

test('R2 fixtures: three owned pairs, hashes match, every page has a task, locus and expected AT behaviour', () => {
  assert.deepEqual(validateFixtures(manifest, read), []);
  assert.deepEqual(manifest.pairs.map((p) => p.barrier), ['silent-validation-error', 'focus-lost-after-dialog', 'unannounced-status-update']);
  for (const p of manifest.pairs) {
    assert.ok(p.task.length >= 2 && p.task.some((s) => s.step === p.locus.step), p.id);
    assert.ok(p.expected_at.healthy && p.expected_at.broken, p.id);
    assert.match(read(p.broken.file).toString(), new RegExp(`id="${p.locus.element}"`), p.id);
  }
});

test('R2 fixtures: each pair differs by exactly its one declared defect', () => {
  for (const p of manifest.pairs) {
    const healthy = read(p.healthy.file).toString(), broken = read(p.broken.file).toString();
    assert.equal(healthy.split(p.defect.healthy).length, 2, `${p.id}: healthy snippet must occur once`);
    assert.notEqual(p.defect.healthy, p.defect.broken);
    assert.equal(healthy.replace(p.defect.healthy, p.defect.broken), broken, `${p.id}: one substitution must reproduce broken`);
  }
  const bad = structuredClone(manifest);
  bad.pairs[0].defect.broken = '<p id="email-error" class="x"';
  assert.match(validateFixtures(bad, read).join('\n'), /validation: declared defect does not reproduce broken/);
});

test('R2 fixtures: tampered page bytes are refused', () => {
  const tampered = (file) => (file === manifest.pairs[1].broken.file ? Buffer.from('<p>changed</p>') : read(file));
  assert.match(validateFixtures(manifest, tampered).join('\n'), /sha256 mismatch: dialog-focus\/broken\.html/);
});

test('R2 split: development fixtures and self-authored labels cannot be scored as evaluation', () => {
  assert.equal(manifest.split, 'development');
  const pages = manifest.pairs.flatMap((p) => [p.healthy, p.broken]);
  assert.deepEqual(pages.map((p) => p.sha256).sort(), [...devHashes.sha256].sort());
  assert.equal(labels.labeler, 'claude');
  assert.equal(labels.independent, false);
  const errors = assertEvaluable({ manifest, labels, runner: 'claude', devHashes: devHashes.sha256 }).join('\n');
  assert.match(errors, /split is development/);
  assert.match(errors, /labeler is the runner/);
  assert.match(errors, /labels are not independent/);
  assert.match(errors, /labels not reviewed/);
});

test('R2 split: relabelling development pages as withheld is refused by content hash', () => {
  const relabelled = { ...structuredClone(manifest), split: 'withheld' };
  const independent = { labeler: 'reviewer-a', independent: true, reviewed_by: 'reviewer-b', pages: labels.pages };
  const errors = assertEvaluable({ manifest: relabelled, labels: independent, runner: 'claude', devHashes: devHashes.sha256 });
  assert.equal(errors.length, 6);
  assert.ok(errors.every((e) => /is a development page/.test(e)));
});

test('R2 split: a genuinely withheld set with independent reviewed labels is evaluable', () => {
  const page = (id, kind) => ({ file: `${id}/${kind}.html`, sha256: kind === 'healthy' ? 'a'.repeat(64) : 'b'.repeat(64) });
  const m = { split: 'withheld', pairs: [{ id: 'w1', healthy: page('w1', 'healthy'), broken: page('w1', 'broken') }] };
  const l = { labeler: 'reviewer-a', independent: true, reviewed_by: 'reviewer-b',
    pages: { 'w1/healthy': { barrier: false }, 'w1/broken': { barrier: true, locus: { step: 's2', element: 'x' } } } };
  assert.deepEqual(assertEvaluable({ manifest: m, labels: l, runner: 'codex', devHashes: devHashes.sha256 }), []);
  assert.match(assertEvaluable({ manifest: m, labels: { ...l, pages: {} }, runner: 'codex', devHashes: [] }).join('\n'), /no label for w1\/healthy/);
});

test('R2 timeline: page events join the action whose acknowledged keydown precedes them; clocks are ignored', () => {
  const actions = [{ step: 's1', ack_seq: 2 }, { step: 's2', ack_seq: 5 }];
  const speech = [{ step: 's1', text: 'Email edit' }, { step: 's2', text: 'Submit button' }];
  const page = [
    { seq: 1, type: 'focus', target: 'body', t: 999 },
    { seq: 2, type: 'keydown', key: 'Tab', target: 'body', t: 5 },
    { seq: 3, type: 'focus', target: 'email', t: 1 },
    { seq: 5, type: 'keydown', key: 'Tab', target: 'email', t: 0 },
    { seq: 4, type: 'app', name: 'noop', t: 1e9 },
    { seq: 6, type: 'focus', target: 'submit', t: -3 },
  ];
  const { windows, pre, insufficient } = alignTimeline({ actions, speech, page });
  assert.deepEqual(insufficient, []);
  assert.deepEqual(pre.map((e) => e.seq), [1]);
  assert.deepEqual(windows.map((w) => [w.step, w.speech, w.page.map((e) => e.seq)]), [
    ['s1', ['Email edit'], [2, 3, 4]],
    ['s2', ['Submit button'], [5, 6]],
  ]);
});

test('R2 timeline: missing acknowledgement, missing speech record or duplicate page seq is insufficient evidence', () => {
  const page = [{ seq: 1, type: 'keydown', key: 'Tab' }, { seq: 1, type: 'focus', target: 'x' }];
  const r = alignTimeline({ actions: [{ step: 's1', ack_seq: 1 }, { step: 's2', ack_seq: null }], speech: [{ step: 's1', text: '' }], page });
  assert.deepEqual(r.insufficient, ['s2: no acknowledged keydown', 's2: no speech record', 'page seq not strictly increasing at 1']);
});

const locus = { step: 'submit', element: 'email-error' };
test('R2 page outcomes: PASS, FAIL, ABSTAIN and INSUFFICIENT_EVIDENCE', () => {
  const broken = { barrier: true, locus }, healthy = { barrier: false };
  const cases = [
    [healthy, { verdict: 'no-barrier' }, [], 'PASS'],
    [healthy, { verdict: 'barrier', locus }, [], 'FAIL'],
    [healthy, { verdict: 'abstain' }, [], 'ABSTAIN'],
    [broken, { verdict: 'barrier', locus }, [], 'PASS'],
    [broken, { verdict: 'barrier', locus: { step: 'submit', element: 'email' } }, [], 'FAIL'],
    [broken, { verdict: 'barrier', locus: { step: 'email', element: 'email-error' } }, [], 'FAIL'],
    [broken, { verdict: 'no-barrier' }, [], 'FAIL'],
    [broken, { verdict: 'abstain' }, [], 'ABSTAIN'],
    [broken, { verdict: 'barrier', locus }, ['s2: no speech record'], 'INSUFFICIENT_EVIDENCE'],
    [healthy, { verdict: 'no-barrier' }, ['s1: no acknowledged keydown'], 'INSUFFICIENT_EVIDENCE'],
    [broken, { verdict: 'maybe' }, [], 'INSUFFICIENT_EVIDENCE'],
  ];
  for (const [label, claim, insufficient, want] of cases) assert.equal(judgePage({ label, claim, insufficient }).outcome, want, JSON.stringify([label, claim]));
});

test('R2 speech arm payload: no screenshots, images, DOM or HTML (R1 payload rule)', () => {
  assert.deepEqual(speechPayloadErrors({ steps: [{ step: 's1', speech: 'Submit button', keys: ['Tab'] }] }), []);
  assert.equal(speechPayloadErrors({ steps: [{ screenshot: 'x' }] }).length, 1);
  assert.equal(speechPayloadErrors({ context: { dom: '<form>' } }).length, 1);
  assert.equal(speechPayloadErrors({ a: [{ b: 'data:image/png;base64,AAAA' }] }).length, 1);
  assert.equal(speechPayloadErrors({ note: '<html><body>' }).length, 1);
  assert.equal(speechPayloadErrors({ outerHTML: 'x', image_url: 'y' }).length, 2);
});

test('R2 control arms: same model and version; the visual control receives no speech', () => {
  const arm = (kind, payload, model = 'spark', version = '1.3', mode = 'standard') => ({ kind, model, version, mode, payload });
  assert.deepEqual(armErrors(arm('speech', { speech: 'x' }), arm('visual', { screenshot: 'x' })), []);
  assert.match(armErrors(arm('speech', { speech: 'x' }), arm('visual', { screenshot: 'x' }, 'spark', '1.4')).join(), /same model and version/);
  assert.match(armErrors(arm('speech', { speech: 'x' }), arm('visual', { screenshot: 'x' }, 'other')).join(), /same model and version/);
  assert.match(armErrors(arm('speech', { speech: 'x' }), arm('visual', { screenshot: 'x' }, 'spark', '1.3', 'contributor')).join(), /same mode/);
  assert.match(armErrors(arm('speech', { speech: 'x' }), arm('visual', { screenshot: 'x', transcript: 'y' })).join(), /visual control contains speech/);
  assert.match(armErrors(arm('speech', { dom: 'x' }), arm('visual', { screenshot: 'x' })).join(), /speech payload/);
});

test('R2 axe baseline: a barrier counts as axe-missed only if no violation resolves to its locus element', () => {
  const v = [{ id: 'color-contrast', ids: ['submit'] }, { id: 'label', ids: [] }];
  assert.equal(axeMissed(v, locus), true);
  assert.equal(axeMissed([...v, { id: 'aria-x', ids: ['email-error'] }], locus), false);
  assert.equal(axeMissed(null, locus), null);
});

function run(over = {}) {
  const pages = ['p1/healthy', 'p1/broken', 'p2/healthy', 'p2/broken'];
  const lab = { 'p1/healthy': { barrier: false }, 'p1/broken': { barrier: true, locus }, 'p2/healthy': { barrier: false }, 'p2/broken': { barrier: true, locus: { step: 'close', element: 'open-dialog' } } };
  const good = (p) => (lab[p].barrier ? { verdict: 'barrier', locus: lab[p].locus } : { verdict: 'no-barrier' });
  return {
    evaluable: [], cost_usd: 0.4, elapsed_h: 1,
    arms: { speech: { kind: 'speech', model: 'spark', version: '1.3', mode: 'standard', payload: { speech: 'x' } },
      visual: { kind: 'visual', model: 'spark', version: '1.3', mode: 'standard', payload: { screenshot: 'x' } } },
    pages: pages.map((page) => ({ page, label: lab[page], insufficient: [], speech: good(page), visual: { verdict: 'no-barrier' }, axe: [] })),
    ...over,
  };
}

test('R2 run verdict: PASS needs >=1 axe-missed barrier located, zero healthy claims, controls and caps', () => {
  const r = judgeR2(run());
  assert.equal(r.outcome, 'PASS');
  assert.deepEqual(r.qualifying, ['p1/broken', 'p2/broken']);
  assert.equal(r.causal_claim, true);
});

test('R2 run verdict: a barrier claimed on any healthy page is FAIL', () => {
  const x = run();
  x.pages[2].speech = { verdict: 'barrier', locus };
  assert.equal(judgeR2(x).outcome, 'FAIL');
});

test('R2 run verdict: barriers axe already reports do not qualify', () => {
  const x = run();
  for (const p of x.pages) if (p.label.barrier) p.axe = [{ id: 'r', ids: [p.label.locus.element] }];
  assert.equal(judgeR2(x).outcome, 'FAIL');
  x.pages[1].axe = null;
  assert.equal(judgeR2(x).outcome, 'INSUFFICIENT_EVIDENCE');
});

test('R2 run verdict: when the same-model visual control also localizes, the causal claim is removed', () => {
  const x = run();
  for (const p of x.pages) if (p.label.barrier) p.visual = { verdict: 'barrier', locus: p.label.locus };
  const r = judgeR2(x);
  assert.equal(r.outcome, 'PASS');
  assert.equal(r.causal_claim, false);
  x.pages[3].visual = { verdict: 'no-barrier' };
  assert.equal(judgeR2(x).causal_claim, true);
});

test('R2 run verdict: not evaluable, over cap, bad arms or missing healthy evidence give INSUFFICIENT_EVIDENCE', () => {
  assert.equal(judgeR2(run({ evaluable: ['split is development'] })).outcome, 'INSUFFICIENT_EVIDENCE');
  assert.equal(judgeR2(run({ cost_usd: 1.51 })).outcome, 'INSUFFICIENT_EVIDENCE');
  assert.equal(judgeR2(run({ elapsed_h: 2.01 })).outcome, 'INSUFFICIENT_EVIDENCE');
  const v = run(); v.arms.visual.version = '1.4';
  assert.equal(judgeR2(v).outcome, 'INSUFFICIENT_EVIDENCE');
  const h = run(); h.pages[0].insufficient = ['s1: no speech record'];
  assert.equal(judgeR2(h).outcome, 'INSUFFICIENT_EVIDENCE');
  const a = run(); for (const p of a.pages) if (p.label.barrier) p.speech = { verdict: 'abstain' };
  assert.equal(judgeR2(a).outcome, 'FAIL');
  const b = run(); for (const p of b.pages) if (p.label.barrier) p.insufficient = ['x'];
  assert.equal(judgeR2(b).outcome, 'INSUFFICIENT_EVIDENCE');
});
