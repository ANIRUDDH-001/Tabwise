// R1: real NVDA speech on our own fixture page (PLAN F-02, D-33, D-34, D-36, D-37, D-39, D-40).
// Runs only inside the manual GitHub Actions workflow .github/workflows/r1.yml (D-36), never on a dev machine.
// `node scripts/r1.mjs --hashes` prints the hashes fixtures/r1/lock.json must hold and starts nothing.
// `node scripts/r1.mjs --scrub-log <in> <out>` writes a scrubbed, 1 MiB-capped copy of a log (S-04) and starts nothing.
// D-39: Guidepup loads from vendor/guidepup-0.36.4-r1 only, after the vendored gate is set. One teardown
// (installTeardown) owns every signal, a crash and the run's own end.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { release } from 'node:os';
import {
  serveDir, specText, lockMismatches, evidenceWriter, runR1, installTeardown, scrubLog, finishRun,
} from '../src/speech/capture.mjs';
import { fixtureBrowser } from '../src/speech/browser.mjs';
import { foregroundProbe } from '../src/speech/foreground.mjs';
import { ciGuardErrors, repoSnapshot, repoChanges, workflowGuardErrors } from '../src/speech/runguard.mjs';
import { sendGate } from '../src/speech/sendguard.mjs';
import { treeHash, checkVendor, upstreamLoaded, vendorIntegrity, VENDOR_DIR, UPSTREAM_PINS, pinErrors } from '../src/speech/vendortree.mjs';

const LOCKED = [
  'fixtures/r1/signup.html', 'fixtures/r1/steps.json', 'src/speech/validate.mjs', 'src/speech/capture.mjs',
  'src/speech/foreground.mjs', 'src/speech/runguard.mjs', 'src/speech/sendguard.mjs', 'src/speech/vendortree.mjs',
  'scripts/r1.mjs', 'src/speech/browser.mjs', '.github/workflows/r1.yml',
];
// SHA-256 of the UTF-8 text with CRLF -> LF, so a checkout under core.autocrlf=true doesn't change the hash.
const sha = (s) => createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex');
const text = (f) => readFileSync(f, 'utf8');
const hashes = () => ({
  'docs/ledger/PLAN.md#F-02': sha(specText(text('docs/ledger/PLAN.md').replace(/\r\n/g, '\n'))),
  ...Object.fromEntries(LOCKED.map((f) => [f, sha(text(f))])),
});
const testHashes = () => Object.fromEntries(readdirSync('test').filter((f) => f.endsWith('.test.mjs')).sort().map((f) => [`test/${f}`, sha(text(`test/${f}`))]));
// D-37: the installed upstream Guidepup files, raw bytes (npm writes them, not git). They are the reference
// the vendored tree is compared against (checkVendor); R1 never loads them.
const lock = JSON.parse(readFileSync('fixtures/r1/lock.json', 'utf8'));
const rawSha = (f) => { try { return createHash('sha256').update(readFileSync(f)).digest('hex'); } catch { return null; } };
const depHashes = () => Object.fromEntries(UPSTREAM_PINS.map((f) => [f, rawSha(f)]));

if (process.argv.includes('--hashes')) {
  console.log(JSON.stringify({ sha256: hashes(), dependencies: depHashes(), vendor_tree: treeHash(VENDOR_DIR) }, null, 2));
  process.exit(0);
}
const scrubAt = process.argv.indexOf('--scrub-log');
if (scrubAt > 0) {
  const [from, to] = process.argv.slice(scrubAt + 1);
  if (!from || !to) { console.error('usage: node scripts/r1.mjs --scrub-log <in> <out>'); process.exit(2); }
  if (existsSync(from)) writeFileSync(to, scrubLog(readFileSync(from, 'utf8')));
  else console.error(`no log at ${from}`);
  process.exit(0);
}
const refuse = (why) => { console.error(`Refusing to run: ${why}`); process.exit(2); };
// D-36: GitHub-hosted Windows runner only. No override.
const notCi = ciGuardErrors(process.env);
if (notCi.length) refuse(`R1 runs only in .github/workflows/r1.yml on a GitHub-hosted Windows runner (D-36).\n  - ${notCi.join('\n  - ')}`);
if (process.platform !== 'win32') refuse('R1 needs Windows (NVDA).');
const current = hashes();
const changed = lockMismatches(lock.sha256, current);
if (changed.length) refuse(`changed since the lock (${lock.locked_at}): ${changed.join(', ')}`);
const deps = depHashes();
const depChanged = pinErrors(lock.dependencies, deps); // D-42 (D39-S02): exactly UPSTREAM_PINS
if (depChanged.length) refuse(`upstream Guidepup files differ from lock.dependencies: ${depChanged.join(', ')}`);

const cfg = JSON.parse(readFileSync('fixtures/r1/steps.json', 'utf8'));
const runId = `r1-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`;
// S-04/M-07: evidence goes to the runner's temp folder, outside the (read-only) checkout; the workflow uploads it.
if (!process.env.RUNNER_TEMP) refuse('RUNNER_TEMP is not set');
const dir = join(process.env.RUNNER_TEMP, 'r1-evidence', runId);
if (existsSync(dir)) refuse(`${runId} evidence folder exists`);
// D-36: clean checkout at start; re-checked before every step and after every attempt (runR1 watch/interference).
const git = (args) => execFileSync('git', args, { encoding: 'utf8' });
const snap = () => repoSnapshot({ git, hashes: { ...hashes(), ...depHashes(), vendor_tree: treeHash(VENDOR_DIR) }, tests: testHashes() });
const start = snap();
const dirty = repoChanges({ ...start, dirty: [], errors: [] }, start);
if (dirty.length) refuse(`checkout is not clean:\n  - ${[...dirty, `HEAD ${start.head}`].join('\n  - ')}`);
// S-02: manual dispatch of r1.yml on main of this repository, at exactly the checked-out commit.
const notWorkflow = workflowGuardErrors(process.env, start.head);
if (notWorkflow.length) refuse(`not the approved R1 workflow:\n  - ${notWorkflow.join('\n  - ')}`);
// T17: the whole vendored tree, before anything in it loads; then file by file against the installed upstream.
const tree = treeHash(VENDOR_DIR);
if (!lock.vendor_tree || tree !== lock.vendor_tree) refuse(`vendored Guidepup tree ${tree} is not lock.vendor_tree ${lock.vendor_tree ?? '(none)'}`);
const vendorErrors = checkVendor({ vendor: VENDOR_DIR, upstream: 'node_modules/@guidepup/guidepup' });
if (vendorErrors.length) refuse(`vendored Guidepup does not match its record:\n  - ${vendorErrors.join('\n  - ')}`);

const pkg = (n) => JSON.parse(readFileSync(`node_modules/${n}/package.json`, 'utf8')).version;
const manifest = JSON.parse(readFileSync(join(VENDOR_DIR, 'manifest.json'), 'utf8'));
const versions = {
  node: process.versions.node,
  '@guidepup/guidepup': `${JSON.parse(readFileSync(join(VENDOR_DIR, 'package.json'), 'utf8')).version} (vendored, D-39)`,
  '@playwright/test': pkg('@playwright/test'),
  nvda: manifest.screenReaders.find(({ id }) => id === 'nvda').assets[0].version,
  chromium: null,
  os: `${process.platform} ${release()}`,
};
const env = process.env;
const meta = {
  spec: 'docs/ledger/PLAN.md F-02 (D-33, D-34, D-36, D-37, D-39, D-40)', command: 'npm run r1', evidence_dir: `%RUNNER_TEMP%/r1-evidence/${runId}`,
  lock: current, dependencies: deps, vendor_tree: tree, versions,
  checkout: { head: start.head, github_sha: env.GITHUB_SHA ?? null, test_hashes: start.tests },
  runner: {
    github_run_id: env.GITHUB_RUN_ID ?? null, github_run_attempt: env.GITHUB_RUN_ATTEMPT ?? null, workflow_ref: env.GITHUB_WORKFLOW_REF ?? null,
    image_os: env.ImageOS ?? null, image_version: env.ImageVersion ?? null,
  },
};
const diag = (line) => console.error(line);

// Warm the read-only foreground probe (PowerShell start + Add-Type) before NVDA exists; no reading, no run.
const fg = foregroundProbe({ timeoutMs: cfg.action_timeout_ms });
const warm = await fg.check();
if (typeof warm.pid !== 'number') {
  fg.close();
  refuse(`the foreground probe does not work: ${warm.error}`);
}

// D-39: one gate for the whole run; a stop is sticky across attempts. 2 s per foreground check. The vendored
// r1Gate takes it before NVDA.js loads; with no gate set, the vendored code sends nothing.
const guard = sendGate({ checkMs: 2000, settleMs: 50 });
const vreq = createRequire(join(VENDOR_DIR, 'package.json'));
const early = upstreamLoaded(vreq.cache);
if (early.length) { fg.close(); refuse(`upstream Guidepup already loaded: ${early.join(', ')}`); }
const r1Gate = vreq('./lib/windows/r1Gate.js');
r1Gate.setGate(guard);
const nvdaJs = vreq('./lib/windows/NVDA/NVDA.js');
const nvda = new nvdaJs.NVDA();
const mods = {
  r1Gate,
  NVDAClient: vreq('./lib/windows/NVDA/NVDAClient.js').NVDAClient,
  runVbsScript: vreq('./lib/windows/runVbsScript.js'),
  sendKeys: vreq('./lib/windows/sendKeys.js'),
  teardown: vreq('./lib/teardown.js'),
  KeyCodes: vreq('./lib/windows/KeyCodes.js').KeyCodes,
  Modifiers: vreq('./lib/windows/Modifiers.js').Modifiers,
  Key: vreq('./lib/windows/Key.js').Key,
  keyCodeCommands: vreq('./lib/windows/NVDA/keyCodeCommands.js').keyCodeCommands,
};
const late = upstreamLoaded(vreq.cache);
if (late.length) { fg.close(); refuse(`upstream Guidepup loaded alongside the vendored copy: ${late.join(', ')}`); }
// T11: checked again inside every admit, before any key.
guard.setIntegrity(() => vendorIntegrity({ mods, nvda: nvdaJs, gate: guard, getGate: r1Gate.getGate, cache: vreq.cache }));
const first = vendorIntegrity({ mods, nvda: nvdaJs, gate: guard, getGate: r1Gate.getGate, cache: vreq.cache });
if (first.length) { fg.close(); refuse(`vendored Guidepup integrity:\n  - ${first.join('\n  - ')}`); }
const { chromium } = await import('@playwright/test');

// Playwright only opens the page and reads its keydown log: a new headed Chromium per attempt. No clicks, no
// raising (D-36). launchServer gives the browser's own process id, which the foreground check needs.
// INFERENCE: the top-level window belongs to that process; if not, every check fails and no key is sent.
// Its own signal handlers are off: the teardown decides when the browser closes (T18).
const browser = fixtureBrowser({ chromium, cfg, versions });

const { server, port } = await serveDir(new URL('../fixtures/', import.meta.url));
const interference = () => repoChanges(start, snap());
const state = { aborted: false, guard };
const evidence = evidenceWriter(dir);
const report = (summary) => {
  fg.close();
  server.close();
  if (!summary) return;
  for (const a of summary.attempts) {
    console.log(`attempt ${a.attempt}: ${a.status}, fresh ${a.fresh}, complete ${a.complete}${a.error ? `: ${a.error}` : ''}`);
    for (const r of a.reasons) console.log(`  - ${r}`);
  }
  for (const r of summary.result_reasons) console.log(`  run: ${r}`);
  console.log(`R1 result: ${summary.result}${summary.rerun_allowed ? ' (setup failed before step 1: a rerun is allowed, F-02)' : ''}`);
};
// B02: from here on the teardown is the only way out; it exits 0 only for a persisted PASS.
const { teardown } = installTeardown({ state, evidence, cfg, runId, meta, guard, diag, report });

console.log(`R1 ${runId}: 3 attempts in CI run ${env.GITHUB_RUN_ID} at ${start.head}.`);
console.log(`Evidence: ${meta.evidence_dir}/`);
let failed = null;
try {
  await runR1({
    nvda, browser, fg, cfg, runId, baseUrl: `http://127.0.0.1:${port}`, evidence, state, meta, interference,
    guard, watch: interference, diag,
  });
} catch (e) { failed = e; }
// A signal or crash during the run has already entered the teardown (state.aborted); it exits by itself.
await finishRun({ failed, state, teardown });
