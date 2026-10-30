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

// S4 (R2-L2 §11): R2 policy and status. Ships disabled/BLOCK; every approval field must agree; D-72..D-74 refused.
import { readFileSync as readS4, mkdtempSync as tmpS4, mkdirSync as mkdirS4, copyFileSync as copyS4, chmodSync as chmodS4, writeFileSync as writeS4, rmSync as rmS4, existsSync as existsS4 } from 'node:fs';
import { tmpdir as tmpdirS4 } from 'node:os';
import { join as joinS4, dirname as dirnameS4 } from 'node:path';
import { createHash as hashS4 } from 'node:crypto';
import { checkR2Approval, r2Digest, r2PlanDigest, readR2Status, R2_FILES, R2_STATUS_SCHEMA, RETIRED_APPROVALS } from '../scripts/tabwise/r2-policy.mjs';
import { qualificationDigest, QUALIFICATION_FILES } from '../scripts/tabwise/qualification-policy.mjs';

const S4_HEAD = 'b'.repeat(40);
const S4_PLAN = '{"schema":"tabwise-r2-plan/1","pairs":["synthetic-pair"]}\n';
const S4_DISABLED = Object.freeze({ schema: R2_STATUS_SCHEMA, enabled: false, verdict: 'BLOCK', reviewer: null, review_ref: null, owner_approval_ref: null, actor: null,
  reviewed_files: Object.freeze([]), reviewed_sha256: null, qualification_sha256: null, plan_sha256: null });
function s4Status(root) {
  return { schema: R2_STATUS_SCHEMA, enabled: true, verdict: 'PASS', reviewer: 'independent-test-reviewer', review_ref: 'synthetic-offline-review', owner_approval_ref: 'D-999', actor: 'test-owner',
    reviewed_files: [...R2_FILES], reviewed_sha256: r2Digest(root), qualification_sha256: qualificationDigest(root), plan_sha256: r2PlanDigest(S4_PLAN), reason: 'synthetic fixture' };
}
function s4Env(status) {
  return { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Windows', GITHUB_SHA: S4_HEAD, GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REPOSITORY: 'ANIRUDDH-001/Tabwise', GITHUB_REF: 'refs/heads/main', GITHUB_WORKFLOW_REF: 'ANIRUDDH-001/Tabwise/.github/workflows/tabwise-r2.yml@refs/heads/main',
    GITHUB_ACTOR: status.actor ?? 'test-owner', GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1', RUNNER_TEMP: 'synthetic-policy-fixture',
    TABWISE_R2_ENABLED: 'true', TABWISE_R2_OWNER_APPROVAL: status.owner_approval_ref ?? 'D-999', TABWISE_R2_APPROVED_REVISION: S4_HEAD, TABWISE_R2_PLAN_SHA256: status.plan_sha256 ?? r2PlanDigest(S4_PLAN) };
}
const s4Check = (over = {}) => {
  const status = over.status ?? s4Status(process.cwd());
  return checkR2Approval({ env: { ...s4Env(status), ...over.env }, head: over.head ?? S4_HEAD, status, plan: 'plan' in over ? over.plan : S4_PLAN, platform: over.platform ?? 'win32', ...(over.root ? { root: over.root } : {}) });
};

test('S4 policy: a valid fixture status at the right HEAD, plan, actor and environment passes', () => {
  assert.deepEqual(s4Check(), { ok: true, errors: [] });
  assert.equal(s4Check({ plan: S4_PLAN.replace(/\n/g, '\r\n') }).ok, true, 'plan identity is EOL-normalized text');
  assert.equal(s4Check({ plan: Buffer.from(S4_PLAN) }).ok, true, 'plan bytes are accepted');
});

test('S4 policy: the shipped r2-status.json is pristine disabled/BLOCK and refuses even with full synthetic authorization', () => {
  const shipped = readR2Status();
  for (const [key, value] of Object.entries(S4_DISABLED)) assert.deepEqual(shipped[key], value, key);
  assert.match(shipped.reason, /D-72/); assert.match(shipped.reason, /D-73/); assert.match(shipped.reason, /D-74/);
  const r = checkR2Approval({ env: s4Env({ ...s4Status(process.cwd()) }), head: S4_HEAD, status: shipped, plan: S4_PLAN, platform: 'win32' });
  assert.equal(r.ok, false); assert.match(r.errors.join('\n'), /R2 is BLOCK\/disabled/);
  const q = JSON.parse(readS4('scripts/tabwise/qualification-status.json', 'utf8'));
  assert.equal(q.enabled, false); assert.equal(q.verdict, 'BLOCK');
});

test('S4 policy: each status field mismatch refuses', () => {
  const changes = [
    { enabled: false }, { enabled: 'true' }, { enabled: 1 }, { verdict: 'BLOCK' }, { verdict: 'pass' }, { schema: 'tabwise-r2-status/0' }, { schema: undefined },
    { reviewer: null }, { reviewer: '  ' }, { review_ref: null }, { owner_approval_ref: null }, { owner_approval_ref: 'D-1000' }, { owner_approval_ref: 'd-999' },
    { actor: null }, { actor: 'someone-else' }, { reviewer: 'test-owner' },
    { reviewed_files: [] }, { reviewed_files: [...R2_FILES].reverse() }, { reviewed_files: [...R2_FILES, 'src/r2/extra.mjs'] }, { reviewed_files: R2_FILES.join(',') },
    { reviewed_sha256: '0'.repeat(64) }, { reviewed_sha256: null }, { qualification_sha256: '0'.repeat(64) }, { qualification_sha256: null },
    { plan_sha256: '0'.repeat(64) }, { plan_sha256: null }, { injected: true },
  ];
  for (const change of changes) {
    const status = Object.assign(s4Status(process.cwd()), change);
    const env = s4Env(s4Status(process.cwd()));
    assert.equal(checkR2Approval({ env, head: S4_HEAD, status, plan: S4_PLAN, platform: 'win32' }).ok, false, JSON.stringify(change));
  }
  for (const status of [null, undefined, [], 'PASS', Object.create({ ...s4Status(process.cwd()) })])
    assert.equal(checkR2Approval({ env: s4Env(s4Status(process.cwd())), head: S4_HEAD, status, plan: S4_PLAN, platform: 'win32' }).ok, false, String(status));
});

test('S4 policy: each environment, actor, revision, plan and platform mismatch refuses', () => {
  const envChanges = [
    { TABWISE_R2_ENABLED: '' }, { TABWISE_R2_ENABLED: 'TRUE' }, { TABWISE_R2_ENABLED: undefined },
    { TABWISE_R2_APPROVED_REVISION: '' }, { TABWISE_R2_APPROVED_REVISION: 'c'.repeat(40) },
    { TABWISE_R2_OWNER_APPROVAL: '' }, { TABWISE_R2_OWNER_APPROVAL: 'D-998' },
    { TABWISE_R2_PLAN_SHA256: '' }, { TABWISE_R2_PLAN_SHA256: '0'.repeat(64) },
    { GITHUB_ACTOR: 'someone-else' }, { GITHUB_ACTOR: '' }, { GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_RUN_ID: '0' }, { RUNNER_TEMP: '' },
    { GITHUB_ACTIONS: 'false' }, { RUNNER_ENVIRONMENT: 'self-hosted' }, { RUNNER_OS: 'Linux' }, { GITHUB_EVENT_NAME: 'push' }, { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_REPOSITORY: 'someone/Tabwise' }, { GITHUB_SHA: 'c'.repeat(40) },
    { GITHUB_WORKFLOW_REF: 'ANIRUDDH-001/Tabwise/.github/workflows/tabwise-observer.yml@refs/heads/main' },
    { TABWISE_QUALIFICATION_ENABLED: 'true', TABWISE_R2_ENABLED: undefined },
  ];
  for (const env of envChanges) assert.equal(s4Check({ env }).ok, false, JSON.stringify(env));
  assert.equal(s4Check({ head: 'c'.repeat(40) }).ok, false, 'HEAD differs');
  assert.equal(s4Check({ head: 'B'.repeat(40), env: { GITHUB_SHA: 'B'.repeat(40), TABWISE_R2_APPROVED_REVISION: 'B'.repeat(40) } }).ok, false, 'non-lowercase SHA');
  assert.equal(s4Check({ platform: 'linux' }).ok, false, 'platform');
  for (const plan of [undefined, null, '', S4_PLAN + ' ', {}, 42]) assert.equal(s4Check({ plan }).ok, false, `plan ${JSON.stringify(plan)}`);
  for (const env of [null, undefined]) assert.equal(checkR2Approval({ env, head: S4_HEAD, status: s4Status(process.cwd()), plan: S4_PLAN, platform: 'win32' }).ok, false);
});

test('S4 policy: retired D-72, D-73 and D-74 are refused even when status and environment agree', () => {
  assert.deepEqual([...RETIRED_APPROVALS], ['D-72', 'D-73', 'D-74']);
  for (const ref of RETIRED_APPROVALS) {
    const status = { ...s4Status(process.cwd()), owner_approval_ref: ref };
    const r = s4Check({ status });
    assert.equal(r.ok, false, ref); assert.match(r.errors.join('\n'), /retired/, ref);
  }
});

const copyWritableS4 = (from, to) => {
  copyS4(from, to);
  chmodS4(to, 0o666);
};

test('S4 policy: forged or changed source content refuses (R2 scope and qualification scope)', () => {
  const tmp = tmpS4(joinS4(tmpdirS4(), 'tabwise-r2-policy-'));
  try {
    for (const file of new Set([...R2_FILES, ...QUALIFICATION_FILES])) { mkdirS4(dirnameS4(joinS4(tmp, file)), { recursive: true }); copyWritableS4(file, joinS4(tmp, file)); }
    const status = s4Status(process.cwd());
    assert.equal(s4Check({ status, root: tmp }).ok, true, 'byte-identical copy passes');
    writeS4(joinS4(tmp, 'src/r2/contract.mjs'), readS4('src/r2/contract.mjs', 'utf8').replace(/\r?\n/g, '\r\n'));
    assert.equal(s4Check({ status, root: tmp }).ok, true, 'CRLF checkout is the same text');
    writeS4(joinS4(tmp, 'src/r2/contract.mjs'), readS4('src/r2/contract.mjs', 'utf8') + '\n// tampered\n');
    let r = s4Check({ status, root: tmp });
    assert.equal(r.ok, false); assert.match(r.errors.join('\n'), /R2 content changed/);
    copyWritableS4('src/r2/contract.mjs', joinS4(tmp, 'src/r2/contract.mjs'));
    writeS4(joinS4(tmp, 'scripts/tabwise/qualification-core.mjs'), '// forged\n');
    r = s4Check({ status, root: tmp });
    assert.equal(r.ok, false); assert.match(r.errors.join('\n'), /qualification content changed/);
    copyWritableS4('scripts/tabwise/qualification-core.mjs', joinS4(tmp, 'scripts/tabwise/qualification-core.mjs'));
    rmS4(joinS4(tmp, 'src/r2/capture.mjs'));
    r = s4Check({ status, root: tmp });
    assert.equal(r.ok, false); assert.match(r.errors.join('\n'), /R2 content unavailable/);
  } finally { rmS4(tmp, { recursive: true, force: true }); }
});

test('S4 policy: R2_FILES is a frozen, sorted list of existing files that covers the policy and C-1 but not the status file', () => {
  assert.equal(Object.isFrozen(R2_FILES), true);
  assert.deepEqual([...R2_FILES], [...R2_FILES].sort());
  for (const file of R2_FILES) assert.equal(existsS4(file), true, file);
  for (const file of ['scripts/tabwise/r2-policy.mjs', 'src/r2/contract.mjs', 'src/r2/capture.mjs']) assert.ok(R2_FILES.includes(file), file);
  assert.equal(R2_FILES.includes('scripts/tabwise/r2-status.json'), false);
  assert.equal(r2PlanDigest(S4_PLAN), hashS4('sha256').update(S4_PLAN).digest('hex'));
  assert.equal(readR2Status('/nonexistent-tabwise-root'), null, 'unreadable status is null, never a default');
});

test('S4 policy: r2-policy.mjs imports only Node built-ins, runguard and the qualification digest; no runtime loader', () => {
  const code = readS4('scripts/tabwise/r2-policy.mjs', 'utf8');
  const imports = [...code.matchAll(/^\s*import\b[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ['../../src/speech/runguard.mjs', './qualification-policy.mjs', 'node:crypto', 'node:fs', 'node:path', 'node:url']);
  assert.doesNotMatch(code, /\bimport\s*\(/);
});

// ---- R2-L2 S5a / C-3 static boundaries (CLOUD-R2-L2-04): import graph, exports, reviewed scope ----
import { readdirSync as readdirS5a } from 'node:fs';
import { resolve as resolveS5a, dirname as dirnameS5a, relative as relativeS5a } from 'node:path';
const S5A_IMPORT = /^\s*(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;
const importsOf = file => [...readS4(file, 'utf8').matchAll(S5A_IMPORT)].map((m) => m[1] ?? m[2]);
function closureS5a(entry) {
  const files = new Set(), builtins = new Set(), packages = new Set(), dynamic = [];
  const walk = (file) => {
    const rel = relativeS5a(process.cwd(), file).replace(/\\/g, '/');
    if (files.has(rel)) return;
    files.add(rel);
    if (/\bimport\s*\(/.test(readS4(file, 'utf8'))) dynamic.push(rel);
    for (const spec of importsOf(file)) {
      if (spec.startsWith('node:')) builtins.add(spec);
      else if (spec.startsWith('.')) walk(resolveS5a(dirnameS5a(file), spec));
      else packages.add(spec);
    }
  };
  walk(resolveS5a(entry));
  return { files: [...files].sort(), builtins: [...builtins].sort(), packages: [...packages].sort(), dynamic };
}

test('S5a static: r2-compose imports exactly the reviewed capability-free modules and exports only composeR2Page', () => {
  const code = readS4('scripts/tabwise/r2-compose.mjs', 'utf8');
  assert.deepEqual(importsOf('scripts/tabwise/r2-compose.mjs').sort(), ['../../src/r2/capture.mjs', '../../src/r2/page-journal.mjs', '../../src/r2/page-source.mjs',
    '../../src/r2/send-receipt.mjs', '../../src/r2/speech-payload.mjs', '../../src/speech/sendguard.mjs', './r2-evidence.mjs']);
  assert.doesNotMatch(code, /\bimport\s*\(/, 'no dynamic import');
  assert.doesNotMatch(code, /\brequire\s*\(|createRequire|process\.binding|globalThis\[/, 'no other loading path');
  for (const forbidden of ['playwright', '@axe-core', 'child_process', 'node:net', 'node:fs', 'qualification-loader', 'loadQualificationRuntime', 'isQualificationRuntime',
    'network.mjs', 'observer.mjs', 'executor.mjs', 'foreground.mjs', 'vendor/', 'guidepup', 'createR2EvidenceWriter', 'sealR2Run', 'owned-vendored-runtime', 'genuine-unqualified'])
    assert.equal(code.includes(forbidden), false, `r2-compose.mjs must not name ${forbidden}`);
  assert.deepEqual([...code.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/gm)].map((m) => m[1]), ['composeR2Page']);
  assert.match(code, /import \{buildR2StepMap, planR2EvidenceCaps\} from '\.\/r2-evidence\.mjs'/, 'only the pure step map and cap planner from S3');
});

test('S5a static: transitive closure reaches no browser, loader, observer, executor, network, vendor or package module (measured)', () => {
  const graph = closureS5a('scripts/tabwise/r2-compose.mjs');
  assert.deepEqual(graph.packages, [], 'no package import anywhere in the closure');
  assert.deepEqual(graph.dynamic, [], 'no dynamic import anywhere in the closure');
  for (const file of graph.files) assert.doesNotMatch(file, /qualification-|network\.mjs|observer\.mjs|executor\.mjs|tabwise-r2\.mjs|r2-session\.mjs|^vendor\//, file);
  // Disclosed, pre-existing: src/r2/capture.mjs takes withTimeout from frozen src/speech/capture.mjs, whose module graph
  // includes foreground.mjs (child_process) and node:http. r2-compose calls none of them. Pinned so a change is reviewed.
  assert.deepEqual(graph.files, ['packages/contracts/palette.mjs', 'scripts/tabwise/input-policy.mjs', 'scripts/tabwise/r2-compose.mjs', 'scripts/tabwise/r2-evidence.mjs',
    'src/r2/capture.mjs', 'src/r2/contract.mjs', 'src/r2/page-journal.mjs', 'src/r2/page-provider.mjs', 'src/r2/page-source.mjs', 'src/r2/preparation.mjs',
    'src/r2/send-receipt.mjs', 'src/r2/speech-payload.mjs', 'src/speech/capture.mjs', 'src/speech/foreground.mjs', 'src/speech/sendguard.mjs', 'src/speech/validate.mjs']);
  assert.deepEqual(graph.builtins, ['node:child_process', 'node:crypto', 'node:fs', 'node:fs/promises', 'node:http', 'node:os', 'node:path', 'node:url']);
});

test('S5a static: no entry or production module imports r2-compose; C-3 imports no runtime or capability module', () => {
  const sources = [];
  const walk = (dir) => { for (const e of readdirS5a(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory() && !['node_modules', '.git', 'vendor', 'web', 'test'].includes(e.name)) walk(p);
    else if (e.isFile() && /\.(mjs|js|ts)$/.test(e.name)) sources.push(p);
  } };
  walk('scripts'); walk('src');
  const importers = sources.filter((f) => f !== 'scripts/tabwise/r2-compose.mjs' && importsOf(f).some((s) => s.endsWith('r2-compose.mjs')));
  assert.deepEqual(importers, []);
  assert.deepEqual(importsOf('src/r2/speech-payload.mjs').sort(), ['../../scripts/tabwise/r2-evidence.mjs', './contract.mjs', './preparation.mjs', 'node:crypto', 'node:fs', 'node:path']);
  assert.doesNotMatch(readS4('src/r2/speech-payload.mjs', 'utf8'), /\bimport\s*\(|playwright|child_process|qualification-loader|fetch\(|respond\(/);
});

test('S5a/C-3 scope: R2_FILES covers r2-compose and speech-payload; the shipped R2 status stays disabled/BLOCK', () => {
  for (const file of ['scripts/tabwise/r2-compose.mjs', 'src/r2/speech-payload.mjs']) assert.ok(R2_FILES.includes(file), file);
  const shipped = readR2Status();
  assert.deepEqual([shipped.enabled, shipped.verdict, shipped.reviewed_sha256], [false, 'BLOCK', null]);
});
