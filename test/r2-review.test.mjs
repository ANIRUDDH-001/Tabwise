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
import { checkR2Approval, r2Digest, r2PlanDigest, readR2Status, R2_FILES, R2_STATUS_SCHEMA, R2_WORKFLOW, RETIRED_APPROVALS } from '../scripts/tabwise/r2-policy.mjs';
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

// S5b (CLOUD-R2-L2-05) changes the expected importer set from [] to exactly the authentic session (design §1.2:
// "Only r2-session.mjs and test files import r2-compose.mjs"). The entry itself is still not an importer.
test('S5a static: only the S5b session imports r2-compose (no entry or other module); C-3 imports no runtime or capability module', () => {
  const sources = [];
  const walk = (dir) => { for (const e of readdirS5a(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory() && !['node_modules', '.git', 'vendor', 'web', 'test'].includes(e.name)) walk(p);
    else if (e.isFile() && /\.(mjs|js|ts)$/.test(e.name)) sources.push(p);
  } };
  walk('scripts'); walk('src');
  const importers = sources.filter((f) => f !== 'scripts/tabwise/r2-compose.mjs' && importsOf(f).some((s) => s.endsWith('r2-compose.mjs')));
  assert.deepEqual(importers, ['scripts/tabwise/r2-session.mjs']);
  assert.deepEqual(importsOf('src/r2/speech-payload.mjs').sort(), ['../../scripts/tabwise/r2-evidence.mjs', './contract.mjs', './preparation.mjs', 'node:crypto', 'node:fs', 'node:path']);
  assert.doesNotMatch(readS4('src/r2/speech-payload.mjs', 'utf8'), /\bimport\s*\(|playwright|child_process|qualification-loader|fetch\(|respond\(/);
});

test('S5a/C-3 scope: R2_FILES covers r2-compose and speech-payload; the shipped R2 status stays disabled/BLOCK', () => {
  for (const file of ['scripts/tabwise/r2-compose.mjs', 'src/r2/speech-payload.mjs']) assert.ok(R2_FILES.includes(file), file);
  const shipped = readR2Status();
  assert.deepEqual([shipped.enabled, shipped.verdict, shipped.reviewed_sha256], [false, 'BLOCK', null]);
});

// ---- R2-L2 S5b / S6 (CLOUD-R2-L2-05): authentic-session boundary, default-blocked entry, run coordinator ----
// Every module under test is loaded dynamically so the rows above still run if one is missing (RED evidence).
// No test here creates a branded runtime, a gate for a real NVDA, a browser, a socket or a child process.
import { Worker as WorkerS6 } from 'node:worker_threads';
import { EventEmitter as EmitterS6 } from 'node:events';
import { pathToFileURL as fileUrlS6 } from 'node:url';
import { symlinkSync as symlinkS6 } from 'node:fs';
import { sendGate as sendGateS6 } from '../src/speech/sendguard.mjs';

const S6_SESSION = 'scripts/tabwise/r2-session.mjs', S6_ENTRY = 'scripts/tabwise-r2.mjs', S6_RUN = 'scripts/tabwise/r2-run.mjs';
const BRAND_ERROR = /^(Error: )?R2 session requires the owned vendored runtime$/;
const CAPABILITY_SPEC = /playwright|@axe-core|network\.mjs|observer\.mjs|executor\.mjs|qualification-integrity|page-recorder|vendor\/|guidepup|node:http$|node:net$/;
const ENTRY_RUNTIME_SPEC = /qualification-loader|r2-session|r2-compose|playwright|@axe-core|vendor\/|guidepup|network\.mjs|observer\.mjs|executor\.mjs/;

// Worker thread (not a process): its own module graph, a resolve hook that records every specifier, an isolated env.
const S6_WORKER = `
const {registerHooks}=require('node:module');const {workerData,parentPort}=require('node:worker_threads');const seen=[];
registerHooks({resolve(s,c,n){seen.push(s);return n(s,c);}});
(async()=>{let error=null;
 try{const m=await import(workerData.file);
  if(workerData.call==='session'){const runtime=Object.freeze({guard:Object.freeze({}),getGate:()=>null,nvda:Object.freeze({}),assertAuthentic(){},createForeground(){throw Error('touched');}});
   try{await m.runR2Session(runtime,{});error='resolved';}catch(e){error=e.message;}}
 }catch(e){error='import: '+e.message;}
 parentPort.postMessage({seen,error});})();`;
function s6Worker({ file, argv = [], env = {}, call = null }) {
  return new Promise((done, reject) => {
    const w = new WorkerS6(S6_WORKER, { eval: true, argv, env, execArgv: [], workerData: { file: fileUrlS6(resolveS5a(file)).href, call }, stdout: true, stderr: true });
    let out = '', err = '', message = { seen: [], error: 'no message' }, code = null, open = 3;
    const finish = () => { if (--open === 0) done({ code, out, err, ...message }); };
    w.stdout.on('data', (d) => { out += d; }); w.stderr.on('data', (d) => { err += d; });
    w.stdout.on('end', finish); w.stderr.on('end', finish);
    w.on('message', (m) => { message = m; }); w.on('error', reject);
    w.on('exit', (c) => { code = c; finish(); });
  });
}
const runModule = () => import(`../${S6_RUN}`);

// A fabricated runtime with the loader's exact shape and a REAL frozen send gate. It is never branded.
function s6FakeRuntime() {
  const guard = sendGateS6({ checkMs: 2000, settleMs: 50 }), calls = [];
  const nvda = { start: async () => { calls.push('start'); return { pid: 1, relay_pid: 1, reset_confirmed: true }; }, press: async () => { calls.push('press'); }, stop: async () => { calls.push('stop'); }, getSettings: () => ({}) };
  const runtime = Object.freeze({ guard, getGate: () => guard, nvda, NVDAClient: class {}, relayOwnerPid: async () => 1, versions: Object.freeze({}), cfg: Object.freeze({ nvda_settings: {} }),
    createForeground: () => { calls.push('foreground'); return { check: async () => ({ pid: 1, title: '' }), close() {} }; }, assertAuthentic: () => { calls.push('assertAuthentic'); } });
  return { runtime, guard, calls };
}
function s6Trap(target = {}) {
  const hits = [];
  const handler = Object.fromEntries(['get', 'has', 'ownKeys', 'getOwnPropertyDescriptor', 'getPrototypeOf', 'set', 'defineProperty', 'apply'].map((t) => [t, (...a) => { hits.push(t); return Reflect[t](...a); }]));
  return { proxy: new Proxy(target, handler), hits };
}

test('S5b-N1 an unbranded runtime ({}, null, a primitive) is refused by the first statement; data is never read', async () => {
  const { runR2Session } = await import(`../${S6_SESSION}`);
  for (const runtime of [{}, null, undefined, 0, 'runtime', [], () => {}]) {
    const data = s6Trap({ fixture_id: 'x' });
    await assert.rejects(runR2Session(runtime, data.proxy), BRAND_ERROR, String(runtime));
    assert.deepEqual(data.hits, [], 'data untouched before the brand check');
  }
});

test('S5b-N2 a fabricated real-looking runtime with a real send gate is refused; no gate, NVDA or foreground use', async () => {
  const { runR2Session } = await import(`../${S6_SESSION}`);
  const { runtime, guard, calls } = s6FakeRuntime();
  await assert.rejects(runR2Session(runtime, { fixture_id: 'validation-healthy' }), BRAND_ERROR);
  assert.deepEqual(calls, [], 'no assertAuthentic, start, press or foreground call');
  const s = guard.status();
  assert.deepEqual([s.stopped, s.sends, s.live], [false, 0, 0], 'gate untouched and holds no sending state');
});

test('S5b-N3 frozen, cloned, prototype-derived and proxy-wrapped fake runtimes are refused with zero proxy traps', async () => {
  const { runR2Session } = await import(`../${S6_SESSION}`);
  const { runtime, calls } = s6FakeRuntime();
  const trapped = s6Trap(runtime);
  for (const fake of [Object.freeze({ ...runtime }), Object.create(runtime), structuredClone({ versions: {} }), trapped.proxy, new Proxy(Object.freeze({ ...runtime }), {})])
    await assert.rejects(runR2Session(fake, {}), BRAND_ERROR);
  assert.deepEqual(trapped.hits, [], 'the brand check reads no property of the candidate');
  assert.deepEqual(calls, []);
});

test('S5b-N4 refusal happens before any capability module is resolved (fresh module graph, resolve hook)', async () => {
  const r = await s6Worker({ file: S6_SESSION, call: 'session' });
  assert.match(r.error, BRAND_ERROR);
  const capability = r.seen.filter((s) => CAPABILITY_SPEC.test(s) && s !== 'node:http');
  assert.deepEqual(capability, [], `no capability import before refusal: ${capability}`);
  assert.equal(r.seen.some((s) => /qualification-loader\.mjs$/.test(s)), true, 'the loader module is resolved statically for isQualificationRuntime only');
});

test('S5b-S1 static: exact imports, one export, the brand check is the first statement and precedes every dynamic import', () => {
  const code = readS4(S6_SESSION, 'utf8');
  assert.deepEqual(importsOf(S6_SESSION).sort(), ['./qualification-loader.mjs', './r2-compose.mjs']);
  assert.match(code, /^import \{isQualificationRuntime\} from '\.\/qualification-loader\.mjs';$/m);
  assert.match(code, /^import \{composeR2Page\} from '\.\/r2-compose\.mjs';$/m);
  assert.deepEqual([...code.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/gm)].map((m) => m[1]), ['runR2Session']);
  assert.doesNotMatch(code, /^export\s*\{/m, 'no export list');
  const header = code.indexOf('export async function runR2Session(runtime, data) {');
  assert.ok(header > 0);
  const firstStatement = code.slice(header).split('\n')[1].trim();
  assert.equal(firstStatement, "if (!isQualificationRuntime(runtime)) throw Error('R2 session requires the owned vendored runtime');");
  const brand = code.indexOf(firstStatement);
  const dynamic = [...code.matchAll(/\bimport\s*\(/g)].map((m) => m.index);
  assert.ok(dynamic.length >= 8, 'capabilities are loaded dynamically');
  for (const at of dynamic) assert.ok(at > brand, 'every dynamic import is after the brand check');
  for (const forbidden of ['loadQualificationRuntime', 'runtimes', 'WeakSet', 'process.env', 'provenance', 'genuine-unqualified', 'owned-vendored-runtime', 'require(', 'createRequire', 'NODE_ENV', 'TABWISE_R2'])
    assert.equal(code.includes(forbidden), false, `r2-session.mjs must not name ${forbidden}`);
});

test('S5b-S2 only the S6 entry reaches S5b (dynamically); only S5b imports S5a; the loader brand is unchanged', () => {
  const sources = [];
  const walk = (dir) => { for (const e of readdirS5a(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory() && !['node_modules', '.git', 'vendor', 'web', 'test'].includes(e.name)) walk(p);
    else if (e.isFile() && /\.(mjs|js|ts)$/.test(e.name)) sources.push(p);
  } };
  walk('scripts'); walk('src');
  const mentions = (needle) => sources.filter((f) => readS4(f, 'utf8').includes(needle)).sort();
  // r2-policy.mjs lists it in R2_FILES (reviewed scope), which is a path string, not a reference that loads it.
  assert.deepEqual(mentions('r2-session.mjs').filter((f) => f !== 'scripts/tabwise/r2-policy.mjs'), [S6_ENTRY], 'no other module names the session');
  assert.deepEqual(sources.filter((f) => importsOf(f).some((s) => s.endsWith('r2-session.mjs'))), [], 'never a static import');
  assert.match(readS4(S6_ENTRY, 'utf8'), /await import\('\.\/tabwise\/r2-session\.mjs'\)/);
  assert.deepEqual(sources.filter((f) => f !== 'scripts/tabwise/r2-compose.mjs' && importsOf(f).some((s) => s.endsWith('r2-compose.mjs'))), [S6_SESSION]);
  assert.deepEqual(mentions('loadQualificationRuntime'), ['scripts/tabwise-observer.mjs', S6_ENTRY, 'scripts/tabwise/qualification-loader.mjs']);
  const loader = readS4('scripts/tabwise/qualification-loader.mjs', 'utf8');
  assert.equal(loader.match(/runtimes\.add\(/g).length, 1, 'one brand site, in the loader');
  assert.deepEqual(mentions('runtimes.add('), ['scripts/tabwise/qualification-loader.mjs']);
});

// ---- S6 pure helpers ----
const S6_SPEC = { ackMs: 1000, timeoutMs: 5000, observationMs: 1500, pollMs: 50 };
function s6PlanObject(over = {}) {
  const manifest = JSON.parse(readS4('fixtures/r2/manifest.json', 'utf8'));
  const pair = manifest.pairs.find((p) => p.id === 'validation');
  const task = pair.task.map(({ step, press }) => ({ step, press }));
  return { schema: 'tabwise-r2-plan/1', split: 'development', spec: { ...S6_SPEC }, handleTimeoutMs: 10000, focusWaitMs: 5000,
    pages: [{ id: 'validation-healthy', fixture: 'validation/healthy.html', fixture_sha256: pair.healthy.sha256, task },
      { id: 'validation-broken', fixture: 'validation/broken.html', fixture_sha256: pair.broken.sha256, task }], ...over };
}
function s6PlanDir(plan = s6PlanObject()) {
  const dir = tmpS4(joinS4(tmpdirS4(), 'tabwise r2 plan '));
  mkdirS4(joinS4(dir, 'validation'));
  for (const v of ['healthy', 'broken']) copyWritableS4(`fixtures/r2/validation/${v}.html`, joinS4(dir, 'validation', `${v}.html`));
  const text = JSON.stringify(plan, null, 2) + '\n';
  writeS4(joinS4(dir, 'plan.json'), text);
  return { dir, path: joinS4(dir, 'plan.json'), text };
}

test('S6-A1 strict CLI: exactly one mode, one --plan, valid page id; anything else refuses', async () => {
  const { parseR2Args } = await runModule();
  assert.deepEqual(parseR2Args(['--check-only', '--plan', 'p.json']), { mode: 'check-only', page: null, plan: 'p.json' });
  assert.deepEqual(parseR2Args(['--plan', 'C:\\a b\\p "x".json', '--page', 'validation-healthy']), { mode: 'page', page: 'validation-healthy', plan: 'C:\\a b\\p "x".json' });
  assert.deepEqual(parseR2Args(['--run', '--plan', '/tmp/a b/p.json']), { mode: 'run', page: null, plan: '/tmp/a b/p.json' });
  const bad = [[], ['--plan', 'p'], ['--run'], ['--run', '--check-only', '--plan', 'p'], ['--run', '--run', '--plan', 'p'], ['--run', '--plan', 'p', '--plan', 'q'],
    ['--page', '--plan', 'p'], ['--page', 'a', '--page', 'b', '--plan', 'p'], ['--page', '../x', '--plan', 'p'], ['--page', 'A', '--plan', 'p'], ['--page', '', '--plan', 'p'],
    ['--run', '--plan=p'], ['--run', '--plan', 'p', 'extra'], ['--run', '--plan', '--page'], ['--run', '--plan', ''], ['--run', '--plan', 'p\0'], ['--run', '--unsafe', '--plan', 'p'],
    ['--run', '--plan', 'p', '--compose'], ['--page', 'a', '--run', '--plan', 'p'], ['--check-only', '--page', 'a', '--plan', 'p'], 'not-an-array'];
  for (const argv of bad) assert.throws(() => parseR2Args(argv), /^Error: R2 usage:/, JSON.stringify(argv));
});

test('S6-P1 plan schema: exact keys at every level, unique valid ids, safe relative fixture paths, approved press set, frozen ackMs, caps', async () => {
  const { parseR2Plan } = await runModule();
  const good = s6PlanObject();
  const parsed = parseR2Plan(Buffer.from(JSON.stringify(good)));
  assert.deepEqual(parsed.pages.map((p) => p.id), ['validation-healthy', 'validation-broken']);
  assert.equal(Object.isFrozen(parsed), true);
  const page = (over) => s6PlanObject({ pages: [{ ...good.pages[0], ...over }] });
  const bad = [{ ...good, schema: 'tabwise-r2-plan/0' }, { ...good, extra: 1 }, { ...good, pages: [] }, { ...good, split: 'scored' },
    s6PlanObject({ pages: [good.pages[0], good.pages[0]] }), page({ id: 'Bad' }), page({ id: 'a/b' }), page({ fixture: '../x.html' }), page({ fixture: '/abs.html' }),
    page({ fixture: 'validation\\healthy.html' }), page({ fixture: 'validation/./healthy.html' }), page({ fixture: 'C:/x.html' }), page({ fixture_sha256: 'A'.repeat(64) }),
    page({ task: [{ step: 'to-email', press: 'Escape' }] }), page({ task: [{ step: 'x', press: 'Tab' }, { step: 'x', press: 'Tab' }] }), page({ task: [{ step: 'x', press: 'Tab', expect: 1 }] }),
    page({ task: [] }), page({ provenance: 'owned-vendored-runtime' }), page({ class: 'genuine-unqualified' }), { ...good, spec: { ...S6_SPEC, ackMs: 500 } },
    { ...good, spec: { ...S6_SPEC, pollMs: 0 } }, { ...good, spec: { ...S6_SPEC, extra: 1 } }, { ...good, handleTimeoutMs: 0 }, { ...good, focusWaitMs: 60001 },
    { ...good, pages: Array.from({ length: 65 }, (_, i) => ({ ...good.pages[0], id: `p${i}` })) }];
  for (const plan of bad) assert.throws(() => parseR2Plan(Buffer.from(JSON.stringify(plan))), /^Error: R2 plan:/, JSON.stringify(plan).slice(0, 160));
  for (const bytes of [Buffer.from('not json'), Buffer.from('[]'), Buffer.alloc(0), Buffer.from(' '.repeat(1_000_001)), 'string-not-bytes'])
    assert.throws(() => parseR2Plan(bytes), /^Error: R2 plan:/);
});

test('S6-P2 fixture load: hash-bound, regular file inside the plan directory, CRLF-normalized; symlinks and escapes refused', async () => {
  const { parseR2Plan, loadR2Fixture } = await runModule();
  const { dir, path } = s6PlanDir();
  try {
    const plan = parseR2Plan(readS4(path));
    assert.equal(loadR2Fixture(path, plan.pages[0]).length > 0, true);
    writeS4(joinS4(dir, 'validation/healthy.html'), readS4('fixtures/r2/validation/healthy.html', 'utf8').replace(/\r?\n/g, '\r\n'));
    assert.equal(loadR2Fixture(path, plan.pages[0]).length > 0, true, 'CRLF checkout has the same normalized hash');
    writeS4(joinS4(dir, 'validation/healthy.html'), readS4('fixtures/r2/validation/healthy.html', 'utf8') + '<!-- changed -->');
    assert.throws(() => loadR2Fixture(path, plan.pages[0]), /^Error: R2 plan: fixture validation-healthy hash/);
    rmS4(joinS4(dir, 'validation/healthy.html'));
    assert.throws(() => loadR2Fixture(path, plan.pages[0]), /^Error: R2 plan: fixture validation-healthy/);
    // A file symlink needs privileges on Windows (EPERM without developer mode); only there is this row not exercised.
    let fileLink = true;
    try { symlinkS6(resolveS5a('fixtures/r2/validation/healthy.html'), joinS4(dir, 'validation/healthy.html')); }
    catch (error) { if (process.platform !== 'win32' || error.code !== 'EPERM') throw error; fileLink = false; }
    if (fileLink) {
      assert.throws(() => loadR2Fixture(path, plan.pages[0]), /^Error: R2 plan: fixture validation-healthy/, 'symlinked fixture');
      rmS4(joinS4(dir, 'validation/healthy.html'));
    }
    rmS4(joinS4(dir, 'validation'), { recursive: true });
    symlinkS6(resolveS5a('fixtures/r2/validation'), joinS4(dir, 'validation'), 'junction'); // junction: no privilege needed on Windows
    assert.throws(() => loadR2Fixture(path, plan.pages[0]), /^Error: R2 plan: fixture validation-healthy/, 'symlinked directory escapes the plan directory');
  } finally { rmS4(dir, { recursive: true, force: true }); }
});

// Synthetic gate inputs: a policy fixture (like the S4 rows above), never a shipped or recorded authorization.
function s6Gate(o = {}) {
  const { dir, path, text } = o.planDir ?? s6PlanDir(o.plan);
  const status = { ...s4Status(process.cwd()), plan_sha256: r2PlanDigest(text), ...o.status };
  const env = { ...s4Env(status), ...o.env };
  const gitCalls = [];
  const git = (...args) => { gitCalls.push(args.join(' ')); if (args[0] === 'rev-parse') return o.head ?? S4_HEAD; if (args[0] === 'status') return o.dirty ?? ''; throw Error(`unexpected git ${args}`); };
  return { dir, path, text, status, env, gitCalls, input: { argv: o.argv ?? ['--check-only', '--plan', path], env, execArgv: o.execArgv ?? [], root: process.cwd(), platform: o.platform ?? 'win32', git,
    frozen: o.frozen ?? (() => ({ ok: true, errors: [] })), readStatus: o.readStatus ?? (() => status) } };
}

test('S6-G1 the shipped BLOCK status refuses after the opt-in, before git, the plan file or any fixture is read', async () => {
  const { checkR2Entry } = await runModule();
  const git = () => { throw Error('git must not run'); };
  for (const argv of [['--check-only', '--plan', '/nonexistent/p.json'], ['--run', '--plan', '/nonexistent/p.json'], ['--page', 'validation-healthy', '--plan', '/nonexistent/p.json']])
    assert.throws(() => checkR2Entry({ argv, env: { TABWISE_R2_ENABLED: 'true' }, execArgv: [], root: process.cwd(), platform: 'win32', git, frozen: () => { throw Error('frozen must not run'); }, readStatus: () => readR2Status() }),
      /^Error: BLOCK: R2 status is disabled\/BLOCK$/, JSON.stringify(argv));
});

test('S6-G2 the opt-in must be exactly TABWISE_R2_ENABLED=true; nothing else is read before it', async () => {
  const { checkR2Entry } = await runModule();
  for (const value of [undefined, '', 'TRUE', 'True', '1', 'yes', ' true', 'true ']) {
    const g = s6Gate({ env: { TABWISE_R2_ENABLED: value }, readStatus: () => { throw Error('status must not be read'); } });
    try { assert.throws(() => checkR2Entry(g.input), /^Error: BLOCK: R2 disabled by default/, String(value)); assert.deepEqual(g.gitCalls, []); }
    finally { rmS4(g.dir, { recursive: true, force: true }); }
  }
  const g = s6Gate({ env: { TABWISE_QUALIFICATION_ENABLED: 'true', TABWISE_R2_ENABLED: undefined } });
  try { assert.throws(() => checkR2Entry(g.input), /^Error: BLOCK: R2 disabled by default/); } finally { rmS4(g.dir, { recursive: true, force: true }); }
});

test('S6-G3 inherited loader hooks and test-only switches are refused (NODE_OPTIONS, NODE_PATH, execArgv, R1T_*)', async () => {
  const { checkR2Entry } = await runModule();
  for (const over of [{ env: { NODE_OPTIONS: '--import=./test/helpers/faults.mjs' } }, { env: { node_options: '--require x' } }, { env: { NODE_PATH: '/x' } }, { env: { R1T_FS_DELAY_MS: '30' } },
    { env: { NODE_TEST_CONTEXT: 'child-v8' } }, { execArgv: ['--import', 'x.mjs'] }, { execArgv: ['--inspect'] }]) {
    const g = s6Gate(over);
    try { assert.throws(() => checkR2Entry(g.input), /^Error: BLOCK: inherited runtime hooks refused/, JSON.stringify(over)); assert.deepEqual(g.gitCalls, []); }
    finally { rmS4(g.dir, { recursive: true, force: true }); }
  }
});

test('S6-G4 every gate passes only together; each forged, retired, wrong-HEAD, wrong-digest, dirty or altered input refuses', async () => {
  const { checkR2Entry } = await runModule();
  const ok = s6Gate();
  try {
    const gate = checkR2Entry(ok.input);
    assert.deepEqual([gate.mode, gate.head, gate.pages.map((p) => p.id)], ['check-only', S4_HEAD, ['validation-healthy', 'validation-broken']]);
    assert.equal(gate.fixtures.get('validation-broken').length > 0, true);
    assert.deepEqual(ok.gitCalls, ['rev-parse HEAD', 'status --porcelain --untracked-files=all']);
    assert.equal(Object.isFrozen(gate), true);
  } finally { rmS4(ok.dir, { recursive: true, force: true }); }
  const cases = [
    ['retired approval', { status: { owner_approval_ref: 'D-73' }, env: { TABWISE_R2_OWNER_APPROVAL: 'D-73' } }, /retired/],
    ['wrong HEAD', { head: 'c'.repeat(40) }, /revision/],
    ['wrong R2 digest', { status: { reviewed_sha256: '0'.repeat(64) } }, /R2 content changed/],
    ['wrong qualification digest', { status: { qualification_sha256: '0'.repeat(64) } }, /qualification content changed/],
    ['reviewer is the actor', { status: { reviewer: 'test-owner' } }, /independent/],
    ['forged plan digest', { status: { plan_sha256: '0'.repeat(64) } }, /run plan identity/],
    ['dirty tree', { dirty: '?? scripts/tabwise/r2-session.mjs' }, /^Error: BLOCK: checkout is not clean$/],
    ['frozen integrity', { frozen: () => ({ ok: false, errors: ['R1 frozen mismatch: scripts/r1.mjs'] }) }, /R1 frozen mismatch/],
    ['not Windows', { platform: 'linux' }, /Windows/],
    ['page not in the plan', { argv: null, page: 'status-healthy' }, /not in the approved plan/],
  ];
  for (const [name, over, pattern] of cases) {
    const g = s6Gate(over);
    if (over.page) g.input.argv = ['--page', over.page, '--plan', g.path];
    try { assert.throws(() => checkR2Entry(g.input), pattern, name); } finally { rmS4(g.dir, { recursive: true, force: true }); }
  }
  // A plan whose declared fixture hash is wrong is approved byte-for-byte, yet the fixture itself refuses.
  const wrong = s6PlanObject(); wrong.pages[1].fixture_sha256 = wrong.pages[0].fixture_sha256;
  const g = s6Gate({ plan: wrong });
  try { assert.throws(() => checkR2Entry(g.input), /fixture validation-broken hash/); } finally { rmS4(g.dir, { recursive: true, force: true }); }
  // The plan changed after approval.
  const h = s6Gate();
  try { writeS4(h.path, h.text.replace('10000', '10001')); assert.throws(() => checkR2Entry(h.input), /run plan identity/); } finally { rmS4(h.dir, { recursive: true, force: true }); }
});

test('S6-R1 run directory: hosted single-attempt identity, outside the checkout, spaces preserved', async () => {
  const { r2RunDir } = await runModule();
  const env = { RUNNER_TEMP: joinS4(tmpdirS4(), 'runner temp'), GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '1' };
  assert.equal(r2RunDir(env, process.cwd()), joinS4(tmpdirS4(), 'runner temp', 'tabwise-r2', '42-1'));
  for (const over of [{ RUNNER_TEMP: '' }, { RUNNER_TEMP: 'relative' }, { RUNNER_TEMP: joinS4(process.cwd(), 'cache') }, { GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_RUN_ID: '0' }, { GITHUB_RUN_ID: '1/..' }])
    assert.throws(() => r2RunDir({ ...env, ...over }, process.cwd()), /^Error: BLOCK: R2 run directory/, JSON.stringify(over));
});

test('S6-R2 child environment is an allowlist: no loader hooks, test switches or qualification opt-ins are inherited', async () => {
  const { r2ChildEnv } = await runModule();
  const env = r2ChildEnv({ Path: 'C:\\Windows', SystemRoot: 'C:\\Windows', GITHUB_SHA: 'x', RUNNER_TEMP: 't', TABWISE_R2_ENABLED: 'true', TABWISE_R2_PLAN_SHA256: 'p',
    NODE_OPTIONS: '--import x', node_options: 'y', NODE_PATH: 'z', NODE_TEST_CONTEXT: 'child', R1T_STALL_MS: '40', TABWISE_QUALIFICATION_ENABLED: 'true', TABWISE_OBSERVER_APPROVED_REVISION: 'r', SECRET_TOKEN: 's', GH_TOKEN: 't',
    GITHUB_TOKEN: 'ghs', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'o', TABWISE_R2_API_KEY: 'k', RUNNER_SECRET: 'x' });
  assert.deepEqual(Object.keys(env).sort(), ['GITHUB_SHA', 'Path', 'RUNNER_TEMP', 'SystemRoot', 'TABWISE_R2_ENABLED', 'TABWISE_R2_PLAN_SHA256']);
  assert.equal(Object.getPrototypeOf(env), null);
});

test('S6-R3 page child command: argument vector (no shell), paths with spaces and quotes verbatim, no inherited execArgv', async () => {
  const { r2PageCommand } = await runModule();
  const plan = 'C:\\Runner Temp\\plan "v1" & x.json', entry = 'D:\\a\\Tabwise repo\\scripts\\tabwise-r2.mjs';
  const c = r2PageCommand({ entry, page: 'validation-healthy', planPath: plan, env: { Path: 'x' }, cwd: 'D:\\a\\Tabwise repo' });
  assert.equal(c.file, process.execPath);
  assert.deepEqual(c.args, [entry, '--page', 'validation-healthy', '--plan', plan]);
  assert.deepEqual([c.options.shell, c.options.windowsHide, c.options.cwd], [false, true, 'D:\\a\\Tabwise repo']);
  assert.deepEqual(c.options.stdio, ['ignore', 'pipe', 'pipe']);
  assert.deepEqual(c.options.env, { Path: 'x' });
  assert.throws(() => r2PageCommand({ entry, page: '../x', planPath: plan, env: {}, cwd: '.' }), /usage/);
});

// ---- S6 run coordinator with stub children (EventEmitters; no process is spawned) ----
const s6Exit = (page, over = {}) => JSON.stringify({ schema: 'tabwise-r2-page-exit/1', page, completed: true, nvda: 'stopped', manifest_sha256: 'a'.repeat(64), reasons: [], ...over }) + '\n';
function s6Child(script) {
  const child = new EmitterS6();
  child.stdout = new EmitterS6(); child.stderr = new EmitterS6(); child.kills = [];
  child.kill = (signal) => { child.kills.push(signal); if (script.onKill) script.onKill(child); return true; };
  setImmediate(() => script.run?.(child));
  return child;
}
const s6Close = (child, code, signal = null) => child.emit('close', code, signal);
function s6Launcher(scripts) {
  const log = [];
  return { log, launch: (page) => { log.push({ page, at: log.length, closedBefore: log.every((l) => l.closed) }); const entry = log.at(-1); const script = scripts[page] ?? {};
    if (script.throws) throw Error(script.throws);
    const child = s6Child(script); child.on('close', () => { entry.closed = true; }); return child; } };
}
const s6Ok = (page) => ({ run: (c) => { c.stdout.emit('data', Buffer.from(s6Exit(page))); s6Close(c, 0); } });
const S6_LIMITS = { timeoutMs: 200, killGraceMs: 50, maxOutputBytes: 4096 };

test('S6-C1 pages run strictly sequentially; each starts only after the previous child closed with an accepted result', async () => {
  const { runR2Pages } = await runModule();
  const l = s6Launcher({ a: s6Ok('a'), b: s6Ok('b'), c: s6Ok('c') });
  const r = await runR2Pages({ pages: ['a', 'b', 'c'], launch: l.launch, ...S6_LIMITS });
  assert.deepEqual(l.log.map((x) => [x.page, x.closedBefore]), [['a', true], ['b', true], ['c', true]]);
  assert.deepEqual(r.pages.map((p) => [p.id, p.exit_code, p.outcome]), [['a', 0, 'accepted'], ['b', 0, 'accepted'], ['c', 0, 'accepted']]);
  assert.equal(r.stopped_after, null);
});

test('S6-C2 the first non-zero exit stops the run; no later page is launched', async () => {
  const { runR2Pages } = await runModule();
  const l = s6Launcher({ a: s6Ok('a'), b: { run: (c) => { c.stderr.emit('data', Buffer.from('BLOCK')); s6Close(c, 2); } }, c: s6Ok('c') });
  const r = await runR2Pages({ pages: ['a', 'b', 'c'], launch: l.launch, ...S6_LIMITS });
  assert.deepEqual(l.log.map((x) => x.page), ['a', 'b']);
  assert.deepEqual(r.pages.map((p) => [p.id, p.exit_code, p.outcome]), [['a', 0, 'accepted'], ['b', 2, 'failed']]);
  assert.equal(r.stopped_after, 'b');
});

test('S6-C3 timeout kills the child and stops; a child whose exit is never confirmed is reported, never followed', async () => {
  const { runR2Pages, EXIT } = await runModule();
  let l = s6Launcher({ a: { onKill: (c) => setImmediate(() => s6Close(c, null, 'SIGKILL')) }, b: s6Ok('b') });
  let r = await runR2Pages({ pages: ['a', 'b'], launch: l.launch, ...S6_LIMITS });
  assert.deepEqual(l.log.map((x) => x.page), ['a']);
  assert.deepEqual([r.pages[0].exit_code, r.pages[0].outcome], [EXIT.timeout, 'timeout']);
  l = s6Launcher({ a: {}, b: s6Ok('b') });
  r = await runR2Pages({ pages: ['a', 'b'], launch: l.launch, ...S6_LIMITS });
  assert.deepEqual(l.log.map((x) => x.page), ['a']);
  assert.deepEqual([r.pages[0].exit_code, r.pages[0].outcome], [EXIT.unconfirmed, 'exit-unconfirmed']);
});

test('S6-C4 malformed, incomplete, oversized or claim-bearing results refuse even with exit 0', async () => {
  const { runR2Pages, EXIT } = await runModule();
  const bodies = ['', 'not json\n', s6Exit('a') + s6Exit('a'), 'log line\n' + s6Exit('a'), s6Exit('b'), s6Exit('a', { completed: false }), s6Exit('a', { nvda: 'unconfirmed' }),
    s6Exit('a', { nvda: 'not-started' }), s6Exit('a', { manifest_sha256: null }), s6Exit('a', { class: 'genuine-unqualified' }), s6Exit('a', { provenance: 'owned-vendored-runtime' }),
    s6Exit('a', { schema: 'tabwise-r2-page-exit/0' }), s6Exit('a', { reasons: 'none' }), s6Exit('a', { completed: 'true' }), JSON.stringify([s6Exit('a')]) + '\n', 'x'.repeat(5000)];
  for (const body of bodies) {
    const l = s6Launcher({ a: { run: (c) => { c.stdout.emit('data', Buffer.from(body)); s6Close(c, 0); }, onKill: (c) => setImmediate(() => s6Close(c, null, 'SIGKILL')) }, b: s6Ok('b') });
    const r = await runR2Pages({ pages: ['a', 'b'], launch: l.launch, ...S6_LIMITS });
    assert.deepEqual(l.log.map((x) => x.page), ['a'], body.slice(0, 80));
    assert.deepEqual([r.pages[0].exit_code, r.pages[0].outcome], [EXIT.refused, 'result-refused'], body.slice(0, 80));
  }
});

test('S6-C5 spawn failures, crashes and signal exits are failures; late output after settlement changes nothing', async () => {
  const { runR2Pages, EXIT } = await runModule();
  let l = s6Launcher({ a: { throws: 'spawn ENOENT' }, b: s6Ok('b') });
  let r = await runR2Pages({ pages: ['a', 'b'], launch: l.launch, ...S6_LIMITS });
  assert.deepEqual([r.pages[0].exit_code, r.pages[0].outcome, l.log.length], [EXIT.spawn, 'spawn-error', 1]);
  l = s6Launcher({ a: { run: (c) => { c.emit('error', Error('EPERM')); s6Close(c, null, null); } }, b: s6Ok('b') });
  r = await runR2Pages({ pages: ['a', 'b'], launch: l.launch, ...S6_LIMITS });
  assert.deepEqual([r.pages[0].exit_code, r.pages[0].outcome, l.log.length], [EXIT.spawn, 'spawn-error', 1]);
  l = s6Launcher({ a: { run: (c) => s6Close(c, null, 'SIGSEGV') }, b: s6Ok('b') });
  r = await runR2Pages({ pages: ['a', 'b'], launch: l.launch, ...S6_LIMITS });
  assert.deepEqual([r.pages[0].exit_code, r.pages[0].outcome, l.log.length], [EXIT.signal, 'failed', 1]);
  l = s6Launcher({ a: { run: (c) => { s6Close(c, 3); c.stdout.emit('data', Buffer.from(s6Exit('a'))); s6Close(c, 0); } }, b: s6Ok('b') });
  r = await runR2Pages({ pages: ['a', 'b'], launch: l.launch, ...S6_LIMITS });
  assert.deepEqual([r.pages[0].exit_code, r.pages[0].outcome, l.log.length], [3, 'failed', 1]);
  for (const bad of [{ pages: [], launch: l.launch }, { pages: ['a', 'a'], launch: l.launch }, { pages: ['a'], launch: null }, { pages: ['a'], launch: l.launch, timeoutMs: 0 }])
    await assert.rejects(runR2Pages({ ...S6_LIMITS, ...bad }), /R2 run/);
});

// ---- S6 entry, executed in a worker thread with an isolated env and a fresh module graph ----
test('S6-E1 the real entry refuses with the shipped BLOCK status in every mode and loads no runtime, session or browser module', async () => {
  const plan = '/nonexistent plan/p.json';
  const runs = [{ argv: ['--check-only', '--plan', plan], env: {} }, { argv: ['--run', '--plan', plan], env: { TABWISE_R2_ENABLED: 'true' } },
    { argv: ['--check-only', '--plan', plan], env: { TABWISE_R2_ENABLED: 'true' } }, { argv: ['--page', 'validation-healthy', '--plan', plan], env: { TABWISE_R2_ENABLED: 'true' } },
    { argv: ['--page', 'validation-healthy', '--plan', plan], env: { TABWISE_R2_ENABLED: 'true', NODE_OPTIONS: '--import x' } }];
  for (const run of runs) {
    const r = await s6Worker({ file: S6_ENTRY, ...run });
    assert.equal(r.error, null, JSON.stringify(run));
    assert.equal(r.code, 2, JSON.stringify(run));
    assert.equal(r.out, '', 'nothing on stdout (no page or run result)');
    assert.match(r.err, /R2 refused: BLOCK: /, JSON.stringify(run));
    const loaded = r.seen.filter((s) => ENTRY_RUNTIME_SPEC.test(s));
    assert.deepEqual(loaded, [], `no runtime import: ${loaded}`);
  }
});

test('S6-E2 invalid arguments refuse before the opt-in is consulted; still no runtime import', async () => {
  for (const argv of [[], ['--page'], ['--run', '--check-only', '--plan', 'p'], ['--compose', '--plan', 'p']]) {
    const r = await s6Worker({ file: S6_ENTRY, argv, env: { TABWISE_R2_ENABLED: 'true' } });
    assert.equal(r.code, 2); assert.match(r.err, /R2 refused: R2 usage: /, JSON.stringify(argv));
    assert.deepEqual(r.seen.filter((s) => ENTRY_RUNTIME_SPEC.test(s)), []);
  }
});

test('S6-S1 static: the loader and session are imported only inside runPage, in order, around the brand check; --run and --check-only never reach it', () => {
  const code = readS4(S6_ENTRY, 'utf8').replace(/\r\n/g, '\n');
  const dynamic = [...code.matchAll(/await import\('([^']+)'\)/g)].map((m) => [m[1], m.index]);
  assert.deepEqual(dynamic.map((d) => d[0]), ['./tabwise/qualification-loader.mjs', './tabwise/r2-session.mjs']);
  assert.equal([...code.matchAll(/\bimport\s*\(/g)].length, 2, 'no other dynamic import');
  const start = code.indexOf('async function runPage('), end = code.indexOf('\n}\n', start);
  assert.ok(start > 0 && end > start);
  for (const [, at] of dynamic) assert.ok(at > start && at < end, 'dynamic imports only inside runPage');
  const body = code.slice(start, end);
  const brand = body.indexOf('if (!isQualificationRuntime(runtime))');
  assert.ok(brand > body.indexOf("import('./tabwise/qualification-loader.mjs')") && brand < body.indexOf("import('./tabwise/r2-session.mjs')"), 'brand check between loader and session');
  assert.ok(body.indexOf('createQualificationIntegrity(') < body.indexOf("import('./tabwise/qualification-loader.mjs')"), 'source integrity before the loader');
  assert.equal(code.match(/\brunPage\(/g).length, 2, 'declared once, called once');
  assert.match(code, /if \(gate\.mode === 'page'\) return runPage\(gate\);/);
  for (const forbidden of ['composeR2Page', 'r2-compose', 'NODE_ENV', 'TABWISE_R2_TEST', 'synthetic', 'provenance', 'genuine-unqualified', 'owned-vendored-runtime'])
    assert.equal(code.includes(forbidden), false, `tabwise-r2.mjs must not name ${forbidden}`);
  const envNames = [...new Set([...code.matchAll(/env\.([A-Z_0-9]+)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(envNames, [], 'the entry passes process.env to the gate helper and reads no variable itself');
});

test('S6-S2 r2-run is capability-free; R2_FILES covers S5b and S6; the shipped status stays disabled/BLOCK', () => {
  const code = readS4(S6_RUN, 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bimport\s*\(|child_process|node:net|node:http|playwright|qualification-loader|r2-session|r2-compose|worker_threads/);
  for (const file of [S6_SESSION, S6_ENTRY, S6_RUN]) assert.ok(R2_FILES.includes(file), file);
  const shipped = readR2Status();
  assert.deepEqual([shipped.enabled, shipped.verdict, shipped.reviewed_sha256, shipped.plan_sha256], [false, 'BLOCK', null, null]);
});

test('S6-C6 a run whose last child exit is unconfirmed is never sealed; confirmed failures still are', async () => {
  const { runR2Pages, r2RunSealable } = await runModule();
  let l = s6Launcher({ a: s6Ok('a'), b: {} });
  let r = await runR2Pages({ pages: ['a', 'b'], launch: l.launch, ...S6_LIMITS });
  assert.equal(r2RunSealable(r), false);
  l = s6Launcher({ a: s6Ok('a'), b: { run: (c) => s6Close(c, 2) } });
  r = await runR2Pages({ pages: ['a', 'b'], launch: l.launch, ...S6_LIMITS });
  assert.equal(r2RunSealable(r), true);
  for (const bad of [null, {}, { pages: 'x' }]) assert.equal(r2RunSealable(bad), false);
});

test('S5b/S6 static: failure paths stop the gate and completion requires a live gate (session and page entry)', () => {
  const session = readS4(S6_SESSION, 'utf8'), entry = readS4(S6_ENTRY, 'utf8').replace(/\r\n/g, '\n');
  assert.match(session, /const completed = compose\?\.completed === true && post && !unexpected\.length && !cleanup\.length && !reasons\.length && !guard\.isStopped\(\);/);
  assert.match(session, /if \(!completed && !guard\.isStopped\(\)\) guard\.stop\(/);
  assert.match(entry, /failure = message\(error\);\n\s*abort\('session refused'\);/);
  assert.match(entry, /if \(runtime\.guard\.isStopped\(\)\) reasons\.push\(/);
  assert.match(entry, /if \(!completed\) abort\('incomplete'\);/);
  assert.match(entry, /process\.exitCode = process\.exitCode \? process\.exitCode : code;/);
  assert.match(entry, /if \(!r2RunSealable\(outcome\)\) \{/, '--run never seals over an unconfirmed child exit');
  assert.ok(entry.indexOf('const integrity = phase.verifyPhase();') > entry.indexOf("import('./tabwise/r2-session.mjs')"), 'phase verification after the session, on every path');
});


// Three review corrections: raw JSON, real filesystem aliases, and in-memory session lifecycle.
test('FIX1 containment resolves ancestors and rejects dot-prefix descendants and aliases', async () => {
  const {r2RunDir} = await runModule();
  const dir = tmpS4(joinS4(tmpdirS4(), 'r2 containment '));
  const root = joinS4(dir, 'Checkout With Spaces'); mkdirS4(root);
  const env = temp => ({RUNNER_TEMP: temp, GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '1'});
  try {
    for (const temp of [root, joinS4(root, '..evidence'), joinS4(root, 'nested', 'missing')])
      assert.throws(() => r2RunDir(env(temp), root), /BLOCK: R2 run directory/);
    for (const temp of [joinS4(dir, 'sibling'), joinS4(dir, 'external', 'missing')])
      assert.equal(r2RunDir(env(temp), root), joinS4(temp, 'tabwise-r2', '42-1'));
    // Resolve an existing junction plus a non-existent suffix, without creating that suffix.
    const alias = joinS4(dir, 'alias'); symlinkS6(root, alias, 'junction');
    assert.throws(() => r2RunDir(env(joinS4(alias, 'missing')), root), /BLOCK: R2 run directory/);
    if (process.platform === 'win32') assert.throws(() => r2RunDir(env(joinS4(root.toUpperCase(), 'missing')), root), /BLOCK: R2 run directory/);
    const broken = joinS4(dir, 'broken'); symlinkS6(joinS4(dir, 'absent'), broken, 'junction');
    assert.throws(() => r2RunDir(env(joinS4(broken, 'missing')), root), /BLOCK: R2 run directory/);
    assert.throws(() => r2RunDir(env(joinS4(dir, 'outside')), joinS4(dir, 'missing checkout')), /BLOCK: R2 run directory/);
    const file = joinS4(dir, 'file'); writeS4(file, 'x');
    assert.throws(() => r2RunDir(env(joinS4(file, 'missing')), root), /BLOCK: R2 run directory/);
    try {
      const link = joinS4(dir, 'symlink'); symlinkS6(root, link, 'dir');
      assert.throws(() => r2RunDir(env(link), root), /BLOCK: R2 run directory/);
    } catch (e) { if (process.platform !== 'win32' || e.code !== 'EPERM') throw e; }
  } finally { rmS4(dir, {recursive:true, force:true}); }
});

test('FIX2 raw duplicate decoded JSON members are rejected in plans and child results', async () => {
  const {parseR2Plan, parseR2PageExit} = await runModule();
  const raw = JSON.stringify(s6PlanObject());
  for (const text of [raw.replace('"split":"development"', '"split":"withheld","split":"development"'),
    raw.replace('"ackMs":1000', '"ackMs":500,"ackMs":1000'),
    raw.replace('"id":"validation-healthy"', '"id":"wrong","id":"validation-healthy"'),
    raw.replace('"split":"development"', '"split":"withheld","\\u0073plit":"development"')])
    assert.throws(() => parseR2Plan(Buffer.from(text)), /duplicate/i);
  const exit = s6Exit('a');
  for (const text of [exit.replace('"completed":true', '"completed":false,"completed":true'),
    exit.replace('"nvda":"stopped"', '"nvda":"unconfirmed","nvda":"stopped"'),
    exit.replace('"completed":true', '"completed":false,"\\u0063ompleted":true')])
    assert.throws(() => parseR2PageExit(text,'a'), /duplicate/i);
  assert.equal(parseR2Plan(Buffer.from(raw)).pages.length, 2); // repeated names in separate objects
  const tricky = s6Exit('a', {reasons: ['text "nvda":"x", { } : \\ "completed":false']});
  assert.throws(() => parseR2PageExit(tricky,'a'), /page did not complete/); // grammar accepted, schema refuses reasons
  for (const text of ['{', '{"a":', '{"a":"bad\\x"}', '{"a":1,}', '[{"a":1}', '{"a":"unterminated}']) {
    assert.throws(() => parseR2Plan(Buffer.from(text)), /JSON/);
    assert.throws(() => parseR2PageExit(text+'\n','a'), /JSON/);
  }
  assert.equal(parseR2PageExit(exit,'a').completed, true);
});

const reviewDeferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
// Substitute only module boundaries in memory. No loader brand can be forged in the on-disk module.
async function reviewSessionHarness(createObserver, composeFn) {
  let code = readS4(S6_SESSION, 'utf8');
  code = code.replace("import {isQualificationRuntime} from './qualification-loader.mjs';", 'const isQualificationRuntime = () => true;')
    .replace("import {composeR2Page} from './r2-compose.mjs';", 'const composeR2Page = globalThis.__r2Review.compose;')
    .replace('const CLEANUP_MS = 10000;', 'const CLEANUP_MS = 80;');
  const begin = code.indexOf('await Promise.all(['), end = code.indexOf(']);',begin)+3;
  assert.ok(begin > 0 && end > begin);
  code = code.slice(0,begin) + 'globalThis.__r2Review.modules;' + code.slice(end);
  let stopped = false;
  const guard = {status:()=>({live:0,sends:0}),isStopped:()=>stopped,stop:()=>{stopped=true;}};
  const page = {goto:async()=>{},bringToFront:async()=>{}};
  const context = {addInitScript:async()=>{},newPage:async()=>page,close:async()=>{}};
  const browser = {version:()=> 'fake',close:async()=>{}};
  const writer = {identity:{served:'test'},failure:()=>null,seal:async()=>{}};
  globalThis.__r2Review = {compose:composeFn,modules:[
    {randomBytes:()=>Buffer.from('12345678','hex'),randomUUID:()=> 'id'},
    {createServer:()=>({once(){},listen(a,b,done){done();},address:()=>({port:1}),close(done){done();}})},
    {isAbsolute:()=>true}, {chromium:{launchServer:async()=>({process:()=>({pid:1}),wsEndpoint:()=>'',close:async()=>{}}),connect:async()=>browser}},
    {AxeBuilder:class{}}, {BROWSER_ARGS:[],createIsolatedContext:async()=>context}, {createSpeechObserver:createObserver},
    {createGuardedPressExecutor(){}},{foregroundMismatch(){}},{settingsMismatch:()=>[]},
    {applyTitleNonce:()=>({record:{fixture_sha256:'hash'}}),buildR2StepMap(){},planR2EvidenceCaps(){},createR2EvidenceWriter:()=>writer},{installR2PageRecorder(){}}
  ]};
  const module = await import('data:text/javascript;base64,'+Buffer.from(code+`\n// ${Math.random()}`).toString('base64'));
  const runtime = {guard,getGate:()=>guard,assertAuthentic(){},createForeground:()=>({close:async()=>{}}),nvda:{},cfg:{}};
  return module.runR2Session(runtime,{approved:{fixture_sha256:'hash',task:[]},evidenceDir:'/fake',fixture:Buffer.from('x'),fixture_id:'a',focusWaitMs:10,handleTimeoutMs:10,spec:{}});
}
const reviewComplete = () => ({completed:true,teardown:{order:[],errors:[]},evidence:{}});

test('FIX3 normal observer cleanup is idempotent', async () => {
  let closes=0;
  const r=await reviewSessionHarness(async()=>({close:async()=>{closes++;}}),async h=>{
    await h.observer.open({}); await h.observer.close(); await h.observer.close(); return reviewComplete();
  });
  assert.equal(closes,1); assert.equal(r.completed,true);
});
test('FIX3 rejected acquisition fails closed without unhandled rejection', async () => {
  const r=await reviewSessionHarness(async()=>{throw Error('acquisition failed');},async h=>{await h.observer.open({});return reviewComplete();});
  assert.equal(r.completed,false); assert.match(r.reasons.join(),/acquisition failed/);
});
test('FIX3 late acquisition after composition timeout is closed once and cannot complete', async () => {
  const acquisition=reviewDeferred(), closing=reviewDeferred(), entered=reviewDeferred(); let closes=0, open;
  const pending=reviewSessionHarness(()=>acquisition.promise,async h=>{
    open=h.observer.open({}); open.catch(()=>{}); h.observer.close().catch(()=>{}); entered.resolve(); throw Error('composition timeout');
  });
  await entered.promise;
  await new Promise(r=>setTimeout(r,5));
  acquisition.resolve({close:()=>{closes++;return closing.promise;}});
  await new Promise(r=>setTimeout(r,5)); assert.equal(closes,1);
  closing.resolve();
  const result=await pending; await Promise.allSettled([open]);
  assert.equal(closes,1); assert.equal(result.completed,false);
});
test('FIX3 pending acquisition and failed late close are reported without false success', async () => {
  const acquisition=reviewDeferred(); let closes=0,open;
  const r=await reviewSessionHarness(()=>acquisition.promise,async h=>{open=h.observer.open({});open.catch(()=>{});return reviewComplete();});
  assert.equal(r.completed,false); assert.match(r.cleanup_errors.join(),/observer/);
  acquisition.resolve({close:async()=>{closes++;throw Error('late close failed');}});
  await Promise.allSettled([open]); assert.equal(closes,1);
});
test('FIX3 close rejection is retained across repeated cleanup', async () => {
  let closes=0;
  const r=await reviewSessionHarness(async()=>({close:async()=>{closes++;throw Error('close failed');}}),async h=>{
    await h.observer.open({}); await h.observer.close().catch(()=>{}); return reviewComplete();
  });
  assert.equal(closes,1);assert.equal(r.completed,false);assert.match(r.cleanup_errors.join(),/close failed/);
});
test('FIX3 delayed close stays owned until settled', async () => {
  const closing=reviewDeferred(),entered=reviewDeferred();let closes=0;
  const pending=reviewSessionHarness(async()=>({close:()=>{closes++;entered.resolve();return closing.promise;}}),async h=>{await h.observer.open({});return reviewComplete();});
  await entered.promise; closing.resolve();const r=await pending;
  assert.equal(closes,1);assert.equal(r.completed,true);
});


test('FIX2 scanner handles nested arrays, escaped strings and adversarial decoded names', async () => {
  const {parseR2Plan,parseR2PageExit}=await runModule();
  for (const key of ['', '__proto__', 'a"b', 'a\\b', 'a,b:c{}[]', 'snowman\u2603']) {
    const k=JSON.stringify(key);
    assert.throws(()=>parseR2Plan(Buffer.from('{"x":[{"nested":{'+k+':1,'+k+':2}}]}')),/duplicate/);
    assert.throws(()=>parseR2PageExit('{"x":[{'+k+':1,'+k+':2}]}\n','a'),/duplicate/);
    const valid = JSON.stringify({x:[{[key]:'a\\"b,{}:'},{[key]:2}]});
    assert.throws(()=>parseR2Plan(Buffer.from(valid)),/must be exactly/);
  }
});
test('FIX3 unsettled close fails closed and repeated open is refused', async () => {
  const closing=reviewDeferred();let closes=0;
  const r=await reviewSessionHarness(async()=>({close:()=>{closes++;return closing.promise;}}),async h=>{
    await h.observer.open({}); await assert.rejects(h.observer.open({}),/observer already/); return reviewComplete();
  });
  assert.equal(closes,1);assert.equal(r.completed,false);assert.match(r.cleanup_errors.join(),/unconfirmed close/);
  closing.resolve();await new Promise(r=>setImmediate(r));
});


test('FIX1 containment uses native canonical identity for non-link Windows aliases', async () => {
  const dir=tmpS4(joinS4(tmpdirS4(),'r2 native alias '));
  // Always exercise an aliased TEMP ancestor; a direct local TEMP hid the malformed native mock.
  const physical=joinS4(dir,'physical'),parent=joinS4(dir,'alias');
  mkdirS4(physical);symlinkS6(physical,parent,'junction');
  const root=joinS4(parent,'checkout'),outside=joinS4(parent,'outside');
  mkdirS4(root);mkdirS4(outside);
  const realFs=await import('node:fs');let nativeCalls=0;
  const canonicalRoot=realFs.realpathSync.native(root);
  assert.notEqual(canonicalRoot,root,'fixture must distinguish canonical and lexical checkout paths');
  // A native resolver returns physical identity, including when the fixture itself is reached via an alias.
  const canonical = p => p===outside ? canonicalRoot : realFs.realpathSync.native(p);
  const ordinary=p=>realFs.realpathSync(p);
  ordinary.native=p=>{nativeCalls++;return canonical(p);};
  globalThis.__r2ReviewFs={...realFs,realpathSync:ordinary};
  let code=readS4(S6_RUN,'utf8').replace("import {readFileSync, lstatSync, realpathSync} from 'node:fs';",'const {readFileSync,lstatSync,realpathSync}=globalThis.__r2ReviewFs;');
  code=code.replace(/from '(\.\.?\/[^']+)'/g,(_,spec)=>'from '+JSON.stringify(new URL(spec,fileUrlS6(resolveS5a(S6_RUN))).href));
  try {
    const m=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
    assert.throws(()=>m.r2RunDir({RUNNER_TEMP:outside,GITHUB_RUN_ID:'42',GITHUB_RUN_ATTEMPT:'1'},root),/BLOCK: R2 run directory/);
    assert.ok(nativeCalls>=2);
  } finally {delete globalThis.__r2ReviewFs;rmS4(dir,{recursive:true,force:true});}
});

// ---- R2 S7 (A-1..A-3): --verify-run entry mode and the hosted workflow static policy ----
test('S7-A1 strict CLI accepts --verify-run --plan only; combinations with another mode or a page refuse', async () => {
  const { parseR2Args } = await runModule();
  assert.deepEqual(parseR2Args(['--verify-run', '--plan', 'p.json']), { mode: 'verify-run', page: null, plan: 'p.json' });
  assert.deepEqual(parseR2Args(['--plan', 'C:\\a b\\p.json', '--verify-run']), { mode: 'verify-run', page: null, plan: 'C:\\a b\\p.json' });
  for (const argv of [['--verify-run'], ['--verify-run', '--run', '--plan', 'p'], ['--verify-run', '--check-only', '--plan', 'p'], ['--verify-run', '--verify-run', '--plan', 'p'],
    ['--verify-run', '--page', 'a', '--plan', 'p'], ['--page', 'a', '--verify-run', '--plan', 'p'], ['--verify-run=1', '--plan', 'p'], ['--verify', '--plan', 'p'], ['--VERIFY-RUN', '--plan', 'p']])
    assert.throws(() => parseR2Args(argv), /^Error: R2 usage:/, JSON.stringify(argv));
});

test('S7-G1 --verify-run passes through every gate: the shipped BLOCK refuses before git; a passing gate needs a clean approved checkout', async () => {
  const { checkR2Entry } = await runModule();
  assert.throws(() => checkR2Entry({ argv: ['--verify-run', '--plan', '/nonexistent/p.json'], env: { TABWISE_R2_ENABLED: 'true' }, execArgv: [], root: process.cwd(), platform: 'win32',
    git: () => { throw Error('git must not run'); }, frozen: () => { throw Error('frozen must not run'); }, readStatus: () => readR2Status() }), /^Error: BLOCK: R2 status is disabled\/BLOCK$/);
  const off = s6Gate({ env: { TABWISE_R2_ENABLED: undefined }, readStatus: () => { throw Error('status must not be read'); } });
  try { off.input.argv = ['--verify-run', '--plan', off.path]; assert.throws(() => checkR2Entry(off.input), /^Error: BLOCK: R2 disabled by default/); }
  finally { rmS4(off.dir, { recursive: true, force: true }); }
  const ok = s6Gate();
  try {
    ok.input.argv = ['--verify-run', '--plan', ok.path];
    const gate = checkR2Entry(ok.input);
    assert.deepEqual([gate.mode, gate.page, gate.pages.map((p) => p.id)], ['verify-run', null, ['validation-healthy', 'validation-broken']]);
    assert.deepEqual(ok.gitCalls, ['rev-parse HEAD', 'status --porcelain --untracked-files=all']);
  } finally { rmS4(ok.dir, { recursive: true, force: true }); }
  for (const [name, over, pattern] of [['dirty tree', { dirty: '?? x' }, /checkout is not clean/], ['wrong R2 digest', { status: { reviewed_sha256: '0'.repeat(64) } }, /R2 content changed/],
    ['wrong HEAD', { head: 'c'.repeat(40) }, /revision/], ['hooks', { env: { NODE_OPTIONS: '--import x' } }, /inherited runtime hooks/]]) {
    const g = s6Gate(over);
    try { g.input.argv = ['--verify-run', '--plan', g.path]; assert.throws(() => checkR2Entry(g.input), pattern, name); }
    finally { rmS4(g.dir, { recursive: true, force: true }); }
  }
});

test('S7-E1 the real entry refuses --verify-run under the shipped BLOCK status and loads no runtime, session or browser module', async () => {
  for (const env of [{}, { TABWISE_R2_ENABLED: 'true' }, { TABWISE_R2_ENABLED: 'true', RUNNER_TEMP: tmpdirS4(), GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1' }]) {
    const r = await s6Worker({ file: S6_ENTRY, argv: ['--verify-run', '--plan', '/nonexistent plan/p.json'], env });
    assert.equal(r.error, null); assert.equal(r.code, 2, JSON.stringify(env)); assert.equal(r.out, '', 'no verification summary under BLOCK');
    assert.match(r.err, /R2 refused: BLOCK: /);
    assert.deepEqual(r.seen.filter((s) => ENTRY_RUNTIME_SPEC.test(s)), []);
  }
});

test('S7-S1 static: --verify-run is read-only; it never seals, spawns, writes, or reaches the loader, session or a runtime', () => {
  const code = readS4(S6_ENTRY, 'utf8').replace(/\r\n/g, '\n');
  assert.match(code, /if \(gate\.mode === 'verify-run'\) return verifyRun\(gate\);/);
  const start = code.indexOf('async function verifyRun('), end = code.indexOf('\n}\n', start);
  assert.ok(start > 0 && end > start, 'verifyRun is declared');
  const body = code.slice(start, end);
  for (const forbidden of ['import(', 'spawn', 'mkdirSync', 'writeFile', 'sealR2Run', 'runPage', 'runAll', 'runR2Pages', 'loadQualificationRuntime', 'r2PageCommand', 'r2ChildEnv'])
    assert.equal(body.includes(forbidden), false, `verifyRun must not use ${forbidden}`);
  assert.match(body, /r2VerifyRun\(gate, r2RunDir\(process\.env, root\)\)/);
  // The entry cannot run past BLOCK offline, so its print-and-return is pinned statically.
  assert.match(body, /\n  console\.log\(JSON\.stringify\(summary\)\);\n  return code;$/);
  assert.ok(code.indexOf("if (gate.mode === 'verify-run')") < code.indexOf("if (gate.mode === 'page')"), 'dispatched before any runtime-capable mode');
  const run = readS4(S6_RUN, 'utf8').replace(/\r\n/g, '\n'), at = run.indexOf('export async function r2VerifyRun(');
  assert.ok(at > 0, 'r2VerifyRun is declared');
  const v = run.slice(at, run.indexOf('\n}\n', at));
  for (const forbidden of ['sealR2Run', 'writeFile', 'mkdir', 'spawn']) assert.equal(v.includes(forbidden), false, `r2VerifyRun must not use ${forbidden}`);
});

// Text-level invariants over the committed workflow (indentation-scoped; no YAML dependency). Ported from R2-S7/validate-proposed-workflow.mjs.
const S7_WORKFLOW = '.github/workflows/tabwise-r2.yml';
const S7_PINS = new Map([
  ['actions/checkout', '3d3c42e5aac5ba805825da76410c181273ba90b1'],
  ['actions/setup-node', '949feb2413d6458794dcd2491c4babbbce0c15c1'],
  ['actions/upload-artifact', 'cf430e030ddbb5b0abf93d22962f4752f3646cd9'],
  ['actions/download-artifact', '9000827ccba6bdab643e8b6fd33ac0654aef8333'],
  ['actions/attest', '1e69f48acb82d1966a394da916b4c1698aa569d6'],
]);
function s7Jobs(text) {
  const lines = text.split('\n'), start = lines.indexOf('jobs:');
  if (start < 0) return null;
  const out = new Map();
  let name = null;
  for (const line of lines.slice(start + 1)) {
    const m = /^  ([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (m) { name = m[1]; out.set(name, []); continue; }
    if (/^\S/.test(line)) break;
    if (name) out.get(name).push(line);
  }
  return new Map([...out].map(([k, v]) => [k, v.join('\n')]));
}
function s7RunBodies(text) {
  const lines = text.split('\n'), bodies = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:- )?run:\s*(\|)?\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    if (!m[2]) { bodies.push(m[3]); continue; }
    const indent = m[1].length, body = [];
    for (i++; i < lines.length && (lines[i].trim() === '' || lines[i].search(/\S/) > indent); i++) body.push(lines[i]);
    i--;
    bodies.push(body.join('\n'));
  }
  return bodies;
}
function s7CheckWorkflow(text) {
  const errors = [], err = (m) => errors.push(m);
  if (!/^on:\n  workflow_dispatch:/m.test(text)) err('W1 trigger must be workflow_dispatch only');
  if (/pull_request|push:|schedule:|workflow_run|repository_dispatch|workflow_call/.test(text)) err('W1 non-manual trigger present');
  if (!/^permissions:\n  contents: read\n\n/m.test(text)) err('W2 top-level permissions must be exactly contents: read');
  if (/secrets\./.test(text)) err('W3 secrets referenced');
  if (!/concurrency:\n  group: tabwise-r2\n  cancel-in-progress: false/.test(text)) err('W4 single non-cancelling concurrency group');
  const uses = [...text.matchAll(/uses:\s*([^@\s]+)@(\S+)/g)];
  if (uses.length !== (text.match(/uses:/g) ?? []).length) err('W5 every uses: must name owner/action@sha');
  for (const m of uses) {
    if (!S7_PINS.has(m[1])) err(`W5 unreviewed action ${m[1]}`);
    else if (m[2] !== S7_PINS.get(m[1])) err(`W5 ${m[1]} not pinned to the verified SHA`);
  }
  for (const body of s7RunBodies(text)) if (/\$\{\{/.test(body)) err(`W6 expression inside run body: ${body.trim().slice(0, 60)}`);
  const j = s7Jobs(text);
  if (!j || !j.has('r2') || !j.has('attest') || j.size !== 2) { err('W7 exactly jobs r2 and attest'); return errors; }
  const r2 = j.get('r2'), at = j.get('attest');
  if (!/runs-on: windows-2025\n/.test(r2 + '\n')) err('W8 r2 must run on GitHub-hosted windows-2025');
  if (!/runs-on: ubuntu-24\.04\n/.test(at + '\n')) err('W8 attest must run on GitHub-hosted ubuntu-24.04');
  for (const [n, b] of [['r2', r2], ['attest', at]])
    if (!/github\.ref == 'refs\/heads\/main'/.test(b) || !/github\.run_attempt == '1'/.test(b)) err(`W8 ${n} must be main and initial attempt only`);
  if (/id-token|attestations:|artifact-metadata/.test(r2)) err('W9 r2 must not hold id-token/attestations permissions');
  if (!/permissions:\n      contents: read\n    outputs:/.test(r2)) err('W9 r2 job permissions must be exactly contents: read');
  for (const p of ['id-token: write', 'attestations: write', 'artifact-metadata: write', 'contents: read']) if (!at.includes(p)) err(`W9 attest needs ${p}`);
  if ((text.match(/id-token: write/g) ?? []).length !== 1) err('W9 id-token: write must appear exactly once');
  const gate = r2.indexOf('--check-only'), run = r2.indexOf('--run --plan'), verify = r2.indexOf('--verify-run'), upload = r2.indexOf('name: Upload sealed run evidence');
  if (!(gate > 0 && gate < run && run < verify && verify < upload)) err('W10 r2 order must be gate -> run -> verify -> upload');
  if ((text.match(/TABWISE_R2_ENABLED: 'true'/g) ?? []).length !== 3 || (text.match(/TABWISE_R2_ENABLED/g) ?? []).length !== 3) err('W10 TABWISE_R2_ENABLED only on the three gated steps');
  if (/TABWISE_R2_ENABLED/.test(r2.slice(0, Math.max(0, r2.indexOf('steps:'))))) err('W10 opt-in must not be job-wide');
  for (const s of ['scripts/tabwise-r2.mjs --check-only', 'scripts/tabwise-r2.mjs --run', 'scripts/tabwise-r2.mjs --verify-run']) if (!r2.includes(s)) err(`W10 missing ${s}`);
  if (/r2-session|r2-compose|qualification-loader|r2-run\.mjs|r2-evidence\.mjs/.test(text)) err('W10 workflow must reach R2 only through scripts/tabwise-r2.mjs');
  if (!/verified=true/.test(r2) || !/steps\.verify\.outputs\.verified/.test(r2)) err('W10 verified output must come from the verify step');
  // PowerShell -ne $true accepts "true" and 1; .NET $ accepts a trailing newline (both measured offline, S7).
  for (const need of ["$v.schema -isnot [string] -or $v.schema -cne 'tabwise-r2-verify/1'", '$v.ok -isnot [bool] -or -not $v.ok', '$v.complete -isnot [bool] -or -not $v.complete',
    "$v.run_manifest_sha256 -isnot [string] -or $v.run_manifest_sha256 -cnotmatch '^[0-9a-f]{64}\\z'"])
    if (!r2.includes(need)) err(`W10 verify step must require exact types: ${need}`);
  if (/-c?(?:not)?match '[^']*\$'/.test(text) || (text.match(/-cnotmatch '\^[^']*\\z'/g) ?? []).length !== 5) err('W14 every PowerShell shape check is anchored with \\z');
  if (!/needs: r2\n/.test(at)) err('W11 attest must need r2');
  if (!/needs\.r2\.result == 'success'/.test(at) || !/needs\.r2\.outputs\.verified == 'true'/.test(at)) err('W11 attest only after r2 success and verified=true');
  if (/always\(\)|failure\(\)|cancelled\(\)|continue-on-error/.test(at)) err('W11 attest job must not run on failure paths');
  const dl = at.indexOf('actions/download-artifact'), rec = at.indexOf('name: Recompute run manifest digest'), att = at.indexOf('actions/attest@'),
    exp = at.indexOf('steps.attest.outputs.bundle-path'), up = at.indexOf('name: Upload attestation bundle');
  if (!(dl > 0 && dl < rec && rec < att && att < exp && exp < up)) err('W11 attest order must be download -> recompute -> attest -> export -> upload');
  if (!/digest-mismatch: error/.test(at)) err('W11 artifact digest mismatch must be an error');
  if (!/EXPECTED: \$\{\{ needs\.r2\.outputs\.run_manifest_sha256 \}\}/.test(at) || !/\[ "\$actual" = "\$EXPECTED" \]/.test(at)) err('W11 recomputed digest must equal the verified job output');
  if (!/test ! -L "\$dir\/run-manifest\.json"/.test(at) || !/\[ "\$\(cat "\$dir\/run-manifest\.sha256"\)" = "\$actual  run-manifest\.json" \]/.test(at)) err('W11 subject must be a regular file matching its digest file');
  if (!/subject-path: \$\{\{ steps\.subject\.outputs\.path \}\}/.test(at)) err('W11 subject must be the recomputed run manifest');
  if (/predicate|sbom-path|push-to-registry: true/.test(at.replace(/SLSA build provenance; workflow-origin only/, ''))) err('W11 no custom predicate, SBOM or registry push');
  if (!/if-no-files-found: error/.test(at)) err('W12 bundle upload must fail if no bundle');
  if (!at.includes(`printf '%s  run-manifest.sigstore.jsonl\\n' "$(sha256sum < "$RUNNER_TEMP/attestation/run-manifest.sigstore.jsonl" | cut -d' ' -f1)" > "$RUNNER_TEMP/attestation/bundle.sha256"`))
    err('W12 bundle digest file must be "<hex>  run-manifest.sigstore.jsonl" with no runner path');
  if (!/workflow-origin claim only/.test(text) || !/not NVDA, runtime or physical-input qualification/.test(text)) err('W13 header must state the O-10 claim boundary');
  return errors;
}
const S7_MUTATIONS = [
  ['trigger on push', (t) => t.replace('on:\n  workflow_dispatch:', 'on:\n  push:\n  workflow_dispatch:')],
  ['reusable workflow_call', (t) => t.replace('on:\n  workflow_dispatch:', 'on:\n  workflow_call:\n  workflow_dispatch:')],
  ['top-level id-token', (t) => t.replace('permissions:\n  contents: read\n\n', 'permissions:\n  contents: read\n  id-token: write\n\n')],
  ['r2 job gets id-token', (t) => t.replace('    permissions:\n      contents: read\n    outputs:', '    permissions:\n      contents: read\n      id-token: write\n    outputs:')],
  ['attest tag instead of SHA', (t) => t.replace('actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6', 'actions/attest@v4')],
  ['download-artifact other SHA', (t) => t.replace('actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333', 'actions/download-artifact@' + '1'.repeat(40))],
  ['unreviewed action', (t) => t.replace('actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333', 'someone/download@9000827ccba6bdab643e8b6fd33ac0654aef8333')],
  ['local action', (t) => t.replace('uses: actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6', 'uses: ./local-attest')],
  ['input interpolated into run', (t) => t.replace('node scripts/tabwise-r2.mjs --check-only --plan $env:TABWISE_R2_PLAN_PATH', 'node scripts/tabwise-r2.mjs --check-only --plan ${{ inputs.plan_path }}')],
  ['gate step removed', (t) => t.replace(/      # Gate first[\s\S]*?throw "R2 gate refused \(exit \$LASTEXITCODE\)" \}\n/, '')],
  ['verify step removed', (t) => t.replace(/      # A fresh process[\s\S]*?run_manifest_sha256=\$\(\$v\.run_manifest_sha256\)" >> \$env:GITHUB_OUTPUT\n/, '')],
  ['complete check removed', (t) => t.replace(' -or $v.complete -isnot [bool] -or -not $v.complete', '')],
  ['ok compared loosely', (t) => t.replace('$v.ok -isnot [bool] -or -not $v.ok', '$v.ok -ne $true')],
  ['complete compared loosely', (t) => t.replace('$v.complete -isnot [bool] -or -not $v.complete', '$v.complete -ne $true')],
  ['schema type check removed', (t) => t.replace('$v.schema -isnot [string] -or ', '')],
  ['digest type check removed', (t) => t.replace('$v.run_manifest_sha256 -isnot [string] -or ', '')],
  ['plan path anchored with $', (t) => t.replace("{0,63}\\.json\\z'", "{0,63}\\.json$'")],
  ['revision anchored with $', (t) => t.replace("'^[0-9a-f]{40}\\z'", "'^[0-9a-f]{40}$'")],
  ['verify digest anchored with $', (t) => t.replace("-cnotmatch '^[0-9a-f]{64}\\z') { throw 'verification", "-cnotmatch '^[0-9a-f]{64}$') { throw 'verification")],
  ['bundle digest records the runner path', (t) => t.replace(/          printf '%s  run-manifest\.sigstore\.jsonl\\n'[^\n]*\n/, '          sha256sum "$RUNNER_TEMP/attestation/run-manifest.sigstore.jsonl" > "$RUNNER_TEMP/attestation/bundle.sha256"\n')],
  ['opt-in made job-wide', (t) => t.replace('    env:\n      TABWISE_R2_APPROVED_REVISION', "    env:\n      TABWISE_R2_ENABLED: 'true'\n      TABWISE_R2_APPROVED_REVISION")],
  ['opt-in on the test step', (t) => t.replace('      - name: Offline tests\n', "      - name: Offline tests\n        env:\n          TABWISE_R2_ENABLED: 'true'\n")],
  ['attest runs always', (t) => t.replace("    if: needs.r2.result == 'success' && needs.r2.outputs.verified == 'true'", '    if: always()')],
  ['attest ignores verified output', (t) => t.replace(" && needs.r2.outputs.verified == 'true'", '')],
  ['digest compare removed', (t) => t.replace('[ "$actual" = "$EXPECTED" ] || { echo \'run manifest digest differs from the verified job output\'; exit 1; }', 'true')],
  ['symlink check removed', (t) => t.replace(' && test ! -L "$dir/run-manifest.json"', '')],
  ['digest file check removed', (t) => t.replace(/          \[ "\$\(cat "\$dir\/run-manifest\.sha256"\)"[^\n]*\n/, '')],
  ['download digest mismatch tolerated', (t) => t.replace('digest-mismatch: error', 'digest-mismatch: warn')],
  ['attest before recompute', (t) => t.replace(/(      - name: Recompute run manifest digest[\s\S]*?)(      - name: Attest sealed run manifest[\s\S]*?show-summary: true\n)/, '$2$1')],
  ['custom predicate', (t) => t.replace('          show-summary: true', "          predicate-type: https://example.com/x\n          predicate: '{}'\n          show-summary: true")],
  ['self-hosted runner', (t) => t.replace('runs-on: windows-2025', 'runs-on: [self-hosted, windows]')],
  ['re-run attempts allowed', (t) => t.replace("&& github.ref == 'refs/heads/main' && github.run_attempt == '1'\n    runs-on: windows-2025", "&& github.ref == 'refs/heads/main'\n    runs-on: windows-2025")],
  ['secret used', (t) => t.replace('          node-version: 24.22.1', '          node-version: 24.22.1\n          token: ${{ secrets.META_KEY }}')],
  ['session reached directly', (t) => t.replace('node scripts/tabwise-r2.mjs --run --plan', 'node scripts/tabwise/r2-session.mjs --run --plan')],
  ['bundle upload tolerates no files', (t) => t.replace(/(name: tabwise-r2-attestation-[\s\S]*?if-no-files-found: )error/, '$1ignore')],
  ['third job added', (t) => t + '\n  extra:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: echo hi\n'],
  ['claim boundary text dropped', (t) => t.replace('It is not NVDA, runtime or physical-input qualification.', 'It qualifies R2.')],
];

test('S7-W1 the committed tabwise-r2 workflow satisfies the S7 static policy (W1-W13)', () => {
  assert.deepEqual(s7CheckWorkflow(readS4(S7_WORKFLOW, 'utf8').replace(/\r\n/g, '\n')), []);
});

test('S7-W2 every named weakening of the workflow is refused by the static policy', () => {
  const base = readS4(S7_WORKFLOW, 'utf8').replace(/\r\n/g, '\n');
  for (const [name, mutate] of S7_MUTATIONS) {
    const mutated = mutate(base);
    assert.notEqual(mutated, base, `mutation applies: ${name}`);
    assert.ok(s7CheckWorkflow(mutated).length > 0, `refused: ${name}`);
  }
});

test('S7-W4 the reviewed R2 digest binds the workflow text: R2_FILES lists it, and a one-byte edit changes r2Digest (CRLF still tolerated)', () => {
  assert.ok(R2_FILES.includes(R2_WORKFLOW), 'R2_FILES lists the R2 workflow (owner decision R-S7-1)');
  const tmp = tmpS4(joinS4(tmpdirS4(), 'tabwise r2 digest '));
  try {
    for (const file of R2_FILES) { mkdirS4(dirnameS4(joinS4(tmp, file)), { recursive: true }); copyWritableS4(file, joinS4(tmp, file)); }
    assert.equal(r2Digest(tmp), r2Digest());
    const wf = joinS4(tmp, R2_WORKFLOW), body = readS4(wf, 'utf8').replace(/\r\n/g, '\n');
    writeS4(wf, body.replace(/\n/g, '\r\n'));
    assert.equal(r2Digest(tmp), r2Digest(), 'Git CRLF checkout conversion is not a change');
    writeS4(wf, body.replace('digest-mismatch: error', 'digest-mismatch: warn'));
    assert.notEqual(r2Digest(tmp), r2Digest(), 'a workflow edit invalidates the reviewed digest');
  } finally { rmS4(tmp, { recursive: true, force: true }); }
});

test('S7-W3 the workflow path is the one the R2 policy pins; the shipped status stays disabled/BLOCK', () => {
  assert.equal(R2_WORKFLOW, S7_WORKFLOW);
  const shipped = readR2Status();
  assert.deepEqual([shipped.enabled, shipped.verdict, shipped.reviewed_sha256, shipped.plan_sha256], [false, 'BLOCK', null, null]);
});
