// R2-L2 S6: default-blocked R2 entry (design §1.2, §1.5, §2.2, §9). Modes: --check-only | --page <id> | --run |
// --verify-run (S7), each with --plan <path>. The ordered gates (strict arguments, exact TABWISE_R2_ENABLED opt-in with no inherited loader hooks,
// R2 status and checkR2Approval over the approved plan bytes, clean checkout at the approved revision, frozen R1 and R2
// reviewed-source integrity, hash-bound fixtures) run in checkR2Entry before anything else. The shipped status is
// disabled/BLOCK, so every invocation refuses there and no runtime is ever created.
//
// Only --page reaches a runtime: source integrity first, then the dynamic one-shot loader import, the brand check, and
// the dynamic session import. --check-only, --run and --verify-run never import the loader or the session; --run starts
// one --page child per plan page, strictly in order, and stops at the first page that is not accepted. --verify-run
// only reads the sealed run directory and re-verifies it. Nothing here selects the composition seam, and no argument or
// variable bypasses a gate.
import {execFileSync, spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkFrozenIntegrity} from './check-r1-baseline.mjs';
import {r2Digest, readR2Status} from './tabwise/r2-policy.mjs';
import {sealR2Run, verifyR2Run} from './tabwise/r2-evidence.mjs';
import {createQualificationIntegrity} from './tabwise/qualification-integrity.mjs';
import {installQualificationCrashHandlers} from './tabwise/qualification-crash.mjs';
import {checkR2Entry, r2RunDir, r2ChildEnv, r2PageCommand, r2SessionData, r2PageExit, r2RunSealable, r2RunInputs, r2VerifyRun, runR2Pages, PAGE_DEADLINE_MS} from './tabwise/r2-run.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = fileURLToPath(import.meta.url);
const STDERR_CAP = 1_048_576;
const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000}).trim();
const message = error => error?.message ?? String(error);

// One page in this process: integrity scope, branded runtime, session, then the phase-boundary checks.
async function runPage(gate) {
  const page = gate.pages[0], runDir = r2RunDir(process.env, root);
  const phase = createQualificationIntegrity({root, head: gate.head, reviewedDigest: gate.status.qualification_sha256});
  const r2Phase = () => (r2Digest(root) === gate.status.reviewed_sha256 ? [] : ['R2 reviewed content changed']);
  if (r2Phase().length) throw Error('BLOCK: R2 reviewed content changed before runtime load');
  const {loadQualificationRuntime, isQualificationRuntime} = await import('./tabwise/qualification-loader.mjs');
  const runtime = await loadQualificationRuntime({root, additionalIntegrity: phase.checkSend});
  if (!isQualificationRuntime(runtime)) throw Error('BLOCK: authentic R2 runtime required');
  const abort = why => { if (!runtime.guard.isStopped()) runtime.guard.stop(`R2 page ${why}`, 'timeout'); };
  const onSignal = () => abort('signal');
  const removeCrash = installQualificationCrashHandlers({abort: () => abort('crash'), record: event => console.error(JSON.stringify({r2_page: page.id, ...event}))});
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  const deadline = setTimeout(() => abort('deadline'), PAGE_DEADLINE_MS);
  let result = null, failure = null;
  try {
    const {runR2Session} = await import('./tabwise/r2-session.mjs');
    result = await runR2Session(runtime, r2SessionData(gate.plan, page, gate.fixtures.get(page.id), join(runDir, page.id)));
  } catch (error) {
    failure = message(error);
    abort('session refused');
  } finally {
    clearTimeout(deadline); process.off('SIGINT', onSignal); process.off('SIGTERM', onSignal); removeCrash();
  }
  const integrity = phase.verifyPhase();
  const reasons = [...(failure ? [failure] : []), ...(result?.reasons ?? []), ...(result?.cleanup_errors ?? []), ...integrity.errors, ...r2Phase()];
  try {
    runtime.assertAuthentic();
    if (runtime.getGate() !== runtime.guard) throw Error('registered gate identity changed');
  } catch (error) { reasons.push(`teardown authenticity: ${message(error)}`); }
  if (runtime.guard.isStopped()) reasons.push(`gate stopped (${runtime.guard.status().kind}): ${runtime.guard.status().reason}`);
  const completed = result?.completed === true && !reasons.length;
  if (!completed) abort('incomplete');
  if (result) console.error(JSON.stringify(result));
  console.log(JSON.stringify(r2PageExit({page: page.id, completed, nvda: result?.nvda ?? 'not-started', manifest_sha256: result?.manifest_sha256 ?? null, reasons})));
  return completed ? 0 : 2;
}

// Sequential page children; never a runtime in this process. The run manifest is sealed and verified from disk.
async function runAll(gate) {
  const runDir = r2RunDir(process.env, root), env = r2ChildEnv(process.env), forwarded = new Map();
  mkdirSync(dirname(runDir), {recursive: true});
  mkdirSync(runDir);
  const outcome = await runR2Pages({
    pages: gate.pages.map(p => p.id),
    launch: id => { const c = r2PageCommand({entry, page: id, planPath: gate.planPath, env, cwd: root}); return spawn(c.file, c.args, c.options); },
    onStderr: (id, data) => { const used = forwarded.get(id) ?? 0; if (used < STDERR_CAP) { forwarded.set(id, used + data.length); process.stderr.write(data); } },
  });
  // A child whose exit was never confirmed may still write its page directory: the run is not sealed over it.
  if (!r2RunSealable(outcome)) {
    console.log(JSON.stringify({schema: 'tabwise-r2-run-summary/1', run_class: 'incomplete', verified: false, errors: ['run not sealed: a page child exit is unconfirmed'],
      run_manifest_sha256: null, pages: outcome.pages, stopped_after: outcome.stopped_after, genuine_evidence: false}));
    return 2;
  }
  const {plan, inputs} = r2RunInputs(gate);
  const sealed = await sealR2Run(runDir, {enabled: true, plan, pages: outcome.pages.map(({id, exit_code}) => ({id, exit_code})), inputs});
  const verified = await verifyR2Run(runDir, {plan, inputs});
  console.log(JSON.stringify({schema: 'tabwise-r2-run-summary/1', run_class: verified.run_class, verified: verified.ok, errors: verified.errors,
    run_manifest_sha256: sealed.manifest_sha256, pages: outcome.pages, stopped_after: outcome.stopped_after, genuine_evidence: false}));
  return outcome.stopped_after === null && verified.ok ? 0 : 2;
}

// S7: a fresh process re-verifies the sealed run from disk after every gate. Read-only: no child, seal, write or runtime.
async function verifyRun(gate) {
  const {summary, code} = await r2VerifyRun(gate, r2RunDir(process.env, root));
  console.log(JSON.stringify(summary));
  return code;
}

async function main() {
  const gate = checkR2Entry({argv: process.argv.slice(2), env: process.env, execArgv: process.execArgv, root, platform: process.platform, git,
    frozen: checkFrozenIntegrity, readStatus: () => readR2Status(root)});
  if (gate.mode === 'check-only') {
    console.log(JSON.stringify({schema: 'tabwise-r2-check/1', ok: true, head: gate.head, pages: gate.pages.map(p => p.id), runtime_loaded: false}));
    return 0;
  }
  if (gate.mode === 'verify-run') return verifyRun(gate);
  if (gate.mode === 'page') return runPage(gate);
  return runAll(gate);
}

try {
  const code = await main();
  // A crash handler that already set a failure code is never overwritten by a later return.
  process.exitCode = process.exitCode ? process.exitCode : code;
} catch (error) {
  console.error(`R2 refused: ${message(error)}`);
  process.exitCode = 2;
}
