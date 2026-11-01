import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as run from '../scripts/tabwise/r2-run.mjs';

// ---- R2 W1: completion integrity (F3). Integrity-valid evidence (ok:true) is not accepted success: --run and --verify-run
// exit 0 only through the one shared acceptance predicate, which for the synthetic A-5 engineering smoke accepts exactly
// 'synthetic'. Test-first: these ran RED against 35f5ffa before r2-run.mjs and tabwise-r2.mjs changed. Synthetic objects only.
const SHA = c => c.repeat(64);
const page = (id, over = {}) => ({id, dir: id, manifest_sha256: SHA('a'), exit_code: 0, class: 'synthetic', ...over});
// The shape verifyR2Run returns for a sealed run: the recomputed manifest carries plan order, pages and run_class.
const verified = ({pages = [page('p1'), page('p2')], manifest = {}, ...over} = {}) => ({ok: true, run_class: 'synthetic', errors: [], manifest_sha256: SHA('b'),
  manifest: {plan_sha256: SHA('c'), order: ['p1', 'p2'], pages, run_class: 'synthetic', ...manifest}, ...over});
const ACCEPTED = {pages: [], stopped_after: null};

// Every refusal: the shared predicate gives reasons, --verify-run exits 2 with complete:false, and --run exits 2.
function refused(why, verification, {integrity} = {}) {
  assert.ok(run.r2RunAcceptance(verification).length > 0, `${why}: predicate refuses`);
  const r = run.r2VerifyOutcome(verification);
  assert.equal(r.code, 2, `${why}: verify exit`); assert.equal(r.summary.complete, false, why); assert.equal(r.summary.genuine_evidence, false, why);
  assert.ok(r.summary.errors.length > 0, `${why}: a reason is reported`);
  if (integrity !== undefined) assert.equal(r.summary.ok, integrity, `${why}: integrity verdict is reported separately from acceptance`);
  assert.equal(run.r2RunExit(ACCEPTED, verification), 2, `${why}: coordinator exit`);
}

test('W1-1 control: a verified, complete, all-zero, all-synthetic run is accepted by verify and by the coordinator', () => {
  assert.deepEqual(run.r2RunAcceptance(verified()), []);
  const r = run.r2VerifyOutcome(verified());
  assert.equal(r.code, 0);
  assert.deepEqual(r.summary, {schema: 'tabwise-r2-verify/1', ok: true, complete: true, run_class: 'synthetic', errors: [], run_manifest_sha256: SHA('b'), genuine_evidence: false});
  assert.equal(run.r2RunExit(ACCEPTED, verified()), 0);
});

test('W1-2 run_class incomplete with a valid digest and zero exits is integrity-valid but not accepted', () => {
  refused('run incomplete', verified({run_class: 'incomplete', manifest: {run_class: 'incomplete'}, pages: [page('p1'), page('p2', {class: 'incomplete'})]}), {integrity: true});
  refused('run incomplete over synthetic pages', verified({run_class: 'incomplete', manifest: {run_class: 'incomplete'}}), {integrity: true});
});

test('W1-3 an incomplete page that exited 0 is refused, even under a synthetic run_class', () => {
  refused('page incomplete, run incomplete', verified({run_class: 'incomplete', manifest: {run_class: 'incomplete'}, pages: [page('p1', {class: 'incomplete'}), page('p2')]}), {integrity: true});
  refused('page incomplete, run synthetic', verified({pages: [page('p1'), page('p2', {class: 'incomplete'})]}), {integrity: true});
  refused('page class missing', verified({pages: [page('p1'), page('p2', {class: undefined})]}));
});

test('W1-4 genuine-unqualified is refused for the current engineering smoke', () => {
  refused('run genuine-unqualified', verified({run_class: 'genuine-unqualified', manifest: {run_class: 'genuine-unqualified'},
    pages: [page('p1', {class: 'genuine-unqualified'}), page('p2', {class: 'genuine-unqualified'})]}), {integrity: true});
  refused('one page genuine-unqualified', verified({pages: [page('p1'), page('p2', {class: 'genuine-unqualified'})]}));
});

test('W1-5 qualified cannot bypass the synthetic-only acceptance rule', () => {
  refused('run qualified', verified({run_class: 'qualified', manifest: {run_class: 'qualified'}, pages: [page('p1', {class: 'qualified'}), page('p2', {class: 'qualified'})]}), {integrity: true});
  refused('run qualified over synthetic pages', verified({run_class: 'qualified', manifest: {run_class: 'qualified'}}));
  refused('one page qualified', verified({pages: [page('p1', {class: 'qualified'}), page('p2')]}));
  for (const cls of ['Synthetic', 'synthetic ', ['synthetic'], null, 1]) refused(`run_class ${JSON.stringify(cls)}`, verified({run_class: cls, manifest: {run_class: cls}}));
});

test('W1-6 missing, duplicate, reordered, extra, empty, failed or stopped coverage is refused', () => {
  refused('missing page', verified({pages: [page('p1')]}), {integrity: true});
  refused('duplicate page', verified({pages: [page('p1'), page('p1')]}));
  refused('duplicate page with a matching order', verified({pages: [page('p1'), page('p1')], manifest: {order: ['p1', 'p1']}}));
  refused('reordered pages', verified({pages: [page('p2'), page('p1')]}));
  refused('extra page', verified({pages: [page('p1'), page('p2'), page('p3')]}));
  refused('invalid page id', verified({pages: [page('p1'), page('../p2')], manifest: {order: ['p1', '../p2']}}));
  refused('no pages', verified({pages: [], manifest: {order: []}}));
  refused('pages not an array', verified({manifest: {pages: {p1: page('p1')}}}));
  refused('failed page', verified({pages: [page('p1'), page('p2', {exit_code: 2})]}));
  refused('exit code as a string', verified({pages: [page('p1'), page('p2', {exit_code: '0'})]}));
  refused('stopped run', verified({run_class: 'incomplete', pages: [page('p1')], manifest: {run_class: 'incomplete', stopped_after: 'p1'}}), {integrity: true});
  refused('stopped_after present on a full run', verified({manifest: {stopped_after: null}}));
});

test('W1-7 a missing or malformed run or page manifest digest is refused', () => {
  for (const digest of [null, undefined, '', SHA('B'), 'b'.repeat(63), 'b'.repeat(65), `${'b'.repeat(64)}\n`, 0]) {
    refused(`run digest ${JSON.stringify(digest)}`, verified({manifest_sha256: digest}), {integrity: false});
    refused(`page digest ${JSON.stringify(digest)}`, verified({pages: [page('p1'), page('p2', {manifest_sha256: digest})]}));
  }
});

test('W1-8 contradictory verification metadata is refused', () => {
  refused('ok with errors', verified({errors: ['run manifest does not recompute']}));
  refused('errors not an array', verified({errors: 'x'}));
  refused('errors missing', verified({errors: undefined}));
  refused('ok is truthy, not true', verified({ok: 'true'}), {integrity: false});
  refused('not ok', verified({ok: false, errors: ['x']}), {integrity: false});
  refused('manifest run_class disagrees', verified({manifest: {run_class: 'incomplete'}}));
  refused('manifest null', {...verified(), manifest: null});
  refused('manifest an array', {...verified(), manifest: [page('p1'), page('p2')]});
  for (const input of [null, undefined, 'ok', 0, [], {ok: true}]) refused(`input ${JSON.stringify(input)}`, input);
});

test('W1-9 coordinator: --run exits 0 only through the shared predicate and its own complete outcome', () => {
  assert.equal(run.r2RunExit({pages: [], stopped_after: 'p1'}, verified()), 2, 'the coordinator stopped early');
  for (const outcome of [null, undefined, {pages: []}, {pages: [], stopped_after: undefined}, 'done']) assert.equal(run.r2RunExit(outcome, verified()), 2, JSON.stringify(outcome));
  // The defect: ok:true with an incomplete or non-synthetic class used to give exit 0 from runAll.
  for (const cls of ['incomplete', 'genuine-unqualified', 'qualified']) assert.equal(run.r2RunExit(ACCEPTED, verified({run_class: cls, manifest: {run_class: cls}})), 2, cls);
  // The entry cannot run past BLOCK offline, so runAll's decision is pinned statically: one sealed-path return, through r2RunExit.
  const entry = readFileSync(new URL('../scripts/tabwise-r2.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const start = entry.indexOf('async function runAll('), end = entry.indexOf('\n}\n', start);
  assert.ok(start > 0 && end > start, 'runAll is declared');
  const body = entry.slice(start, end);
  assert.deepEqual(body.split('\n').filter(line => /^\s*return\b/.test(line)).map(line => line.trim()), ['return 2;', 'return r2RunExit(outcome, verified);'],
    'runAll returns only the unsealable refusal and the shared decision');
  assert.equal(/\breturn 0\b|\? 0 : 2/.test(body), false, 'no private success path');
  assert.ok(body.indexOf('const verified = await verifyR2Run(runDir, {plan, inputs});') < body.indexOf('return r2RunExit(outcome, verified);'), 'decided over the from-disk verification');
  assert.match(entry, /import \{[^}]*\br2RunExit\b[^}]*\} from '\.\/tabwise\/r2-run\.mjs';/);
  // Both exit decisions go through the one predicate; neither keeps a private completion test.
  const source = readFileSync(new URL('../scripts/tabwise/r2-run.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  for (const name of ['export function r2VerifyOutcome(', 'export function r2RunExit(']) {
    const at = source.indexOf(name), fn = source.slice(at, source.indexOf('\n}\n', at));
    assert.ok(at > 0 && fn.includes('r2RunAcceptance(verification)'), `${name} uses r2RunAcceptance`);
    assert.equal(/exit_code|\.class\b|stopped_after' in/.test(fn), false, `${name} has no private completion test`);
  }
});

test('W1-10 workflow contract (read only): attestation needs the --run exit, the --verify-run exit and complete:true', () => {
  const yml = readFileSync(new URL('../.github/workflows/tabwise-r2.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(yml, /node scripts\/tabwise-r2\.mjs --run --plan \$env:TABWISE_R2_PLAN_PATH > \$out\n\s*\$code = \$LASTEXITCODE\n[^\n]*\n\s*if \(\$code -ne 0\) \{ throw /);
  assert.match(yml, /\$json = node scripts\/tabwise-r2\.mjs --verify-run --plan \$env:TABWISE_R2_PLAN_PATH\n\s*if \(\$LASTEXITCODE -ne 0\) \{ throw /);
  const check = yml.split('\n').find(line => line.includes("$v.schema -cne 'tabwise-r2-verify/1'"));
  assert.ok(check, 'the verify output check exists');
  for (const clause of ['$v.ok -isnot [bool]', '-not $v.ok', '$v.complete -isnot [bool]', '-not $v.complete', "-cnotmatch '^[0-9a-f]{64}\\z'"]) assert.ok(check.includes(clause), clause);
  assert.ok(yml.indexOf(check) < yml.indexOf('"verified=true" >> $env:GITHUB_OUTPUT'), 'verified=true is written only after the check');
  assert.match(yml, /\n  attest:\n(?:.*\n)*?    if: needs\.r2\.result == 'success' && needs\.r2\.outputs\.verified == 'true' && github\.ref == 'refs\/heads\/main' && github\.run_attempt == '1'\n/);
});
