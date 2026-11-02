// Nonqualifying Windows NVDA startup diagnostic. Does not press keys, launch pages or enable R2.
import {spawn, execFileSync} from 'node:child_process';
import {readFileSync, mkdirSync, writeFileSync, renameSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {windowsProcessTools, processBaseline, quiescenceOf} from './r2-proctree.mjs';
import {loadQualificationRuntime} from './qualification-loader.mjs';

const BASE = 'd75f04335dc0ba6c9e64fb92fcedc408c5867cfc';
const BRANCH = 'refs/heads/diag/tabwise-r2-startup';
const OUTPUT = join(process.env.RUNNER_TEMP || '.', 'tabwise-nvda-startup-diagnostic');
const FILE = join(OUTPUT, 'report.json');
const save = value => {
  const bytes = JSON.stringify(value, null, 2) + '\n';
  if (Buffer.byteLength(bytes) > 131072) throw Error('Diagnostic report exceeds 128 KiB');
  mkdirSync(OUTPUT, {recursive: true});
  writeFileSync(FILE + '.tmp', bytes);
  renameSync(FILE + '.tmp', FILE);
};
// Refuse before any process observation or runtime load on the owner's desktop.
if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true'
  || process.env.RUNNER_ENVIRONMENT !== 'github-hosted'
  || process.env.GITHUB_REPOSITORY !== 'ANIRUDDH-001/Tabwise'
  || process.env.GITHUB_REF !== BRANCH || process.env.GITHUB_EVENT_NAME !== 'push'
  || process.env.GITHUB_WORKFLOW !== 'tabwise-nvda-startup-diagnostic'
  || process.env.GITHUB_RUN_ATTEMPT !== '1') throw Error('Dedicated hosted diagnostic workflow required; no local NVDA execution');

// Separate supervisor survives a stuck runtime and preserves the last checkpoint. It never claims
// killing the worker stopped native descendants; the independent OS snapshot determines residue.
if (!process.argv.includes('--worker')) {
  let timedOut = false, launchError = null;
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker'], {
    stdio: 'inherit', windowsHide: true, shell: false,
  });
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, 125000);
  const result = await new Promise(resolve => {
    child.once('error', error => { launchError = error.message; resolve({code: null, signal: null}); });
    child.once('close', (code, signal) => resolve({code, signal}));
  });
  clearTimeout(timer);
  let value;
  try { value = JSON.parse(readFileSync(FILE, 'utf8')); }
  catch { value = {classification: 'NONQUALIFYING_STARTUP_DIAGNOSTIC', pass: false, errors: []}; }
  value.supervisor = {timed_out: timedOut, launch_error: launchError, ...result};
  value.errors ??= [];
  if (timedOut || launchError || result.code !== 0) {
    value.pass = false;
    value.errors.push({stage: 'supervisor', classification: timedOut ? 'WORKER_TIMEOUT_CONTAINMENT_REQUIRED' : 'WORKER_FAILED', message: launchError ?? `exit ${result.code}, signal ${result.signal}`});
  }
  try {
    const snapshot = await windowsProcessTools({spawn, env: process.env}).snapshot();
    value.independent_post = {...quiescenceOf(snapshot), helper_processes: snapshot.processes
      .filter(p => /^nvdahelperremoteloader\.exe$/i.test(p.name)).slice(0, 64)};
    if (!value.independent_post.quiescent || value.independent_post.helper_processes.length) {
      value.pass = false;
      value.errors.push({stage: 'supervisor', classification: 'RESIDUAL_PROCESS_OR_LISTENER', message: 'Independent post-run snapshot found native residue; VM disposal required'});
    }
  } catch (error) {
    value.pass = false;
    value.errors.push({stage: 'supervisor', classification: 'QUIESCENCE_UNCONFIRMED', message: String(error.message).slice(0, 512)});
  }
  value.completed_at = new Date().toISOString();
  save(value);
  console.log(JSON.stringify(value));
  process.exit(value.pass && result.code === 0 ? 0 : 1);
}
const report = {
  schema: 'tabwise-nvda-startup-diagnostic/1',
  classification: 'NONQUALIFYING_STARTUP_DIAGNOSTIC',
  w2a_qualified: false,
  r2_capture_completed: false,
  base_revision: BASE,
  workflow_revision: process.env.GITHUB_SHA || null,
  run_id: process.env.GITHUB_RUN_ID || null,
  started_at: new Date().toISOString(),
  preflight: null,
  startup: {attempted: false, elapsed_ms: null, receipt: null},
  settings: null,
  relay: null,
  process: null,
  shutdown: {attempted: false, elapsed_ms: null, completed: false},
  quiescence: null,
  errors: [],
  pass: false,
};
let stage = 'preflight';
const checkpoint = next => { stage = next; report.stage = next; save(report); };
const record = error => {
  let current = error;
  const chain = [];
  for (let depth = 0; current && depth < 5; depth++, current = current.cause) {
    chain.push(String(current.message || current).slice(0, 300));
  }
  const message = chain.join(' -> ');
  const classification = /timed out|deadline|abandon/i.test(message) ? 'TIMEOUT_UNCONFIRMED'
    : /residue/i.test(message) ? 'RESIDUAL_PROCESS_OR_LISTENER' : 'OPERATION_FAILED';
  report.errors.push({stage, classification, message,
    cleanup_errors: (error.cleanup_errors ?? []).slice(0, 16).map(x => String(x).slice(0, 512))});
};
const assert = (condition, message) => { if (!condition) throw Error(message); };
let runtime = null, tools = null, started = false;
try {
  assert(process.platform === 'win32', 'Windows runner required');
  assert(process.env.GITHUB_ACTIONS === 'true' && process.env.RUNNER_ENVIRONMENT === 'github-hosted', 'GitHub-hosted runner required');
  assert(process.env.GITHUB_REPOSITORY === 'ANIRUDDH-001/Tabwise', 'Unexpected repository');
  assert(process.env.GITHUB_REF === BRANCH && process.env.GITHUB_EVENT_NAME === 'push' && process.env.GITHUB_RUN_ATTEMPT === '1', 'Unexpected workflow trigger');
  const git = args => execFileSync('git', args, {encoding: 'utf8'}).trim();
  assert(git(['rev-parse', 'HEAD']) === process.env.GITHUB_SHA, 'Runner checkout is not event revision');
  git(['merge-base', '--is-ancestor', BASE, 'HEAD']);
  const allowed = new Set(['scripts/tabwise/nvda-startup-diagnostic.mjs', '.github/workflows/tabwise-nvda-startup-diagnostic.yml',
    'docs/ledger/STATE.md', 'docs/ledger/PLAN.md', 'docs/ledger/DECISIONS.md', 'docs/ledger/LOG.jsonl', 'docs/CODEMAP.md']);
  const changed = git(['diff', '--name-only', BASE, 'HEAD']).split(/\r?\n/).filter(Boolean);
  assert(changed.every(path => allowed.has(path)), 'Source differs from integrated base outside diagnostic allowlist');
  assert(git(['status', '--porcelain', '--untracked-files=no']) === '', 'Tracked checkout is dirty');
  report.source = {base_ancestor: true, changed_files: changed, tracked_clean: true};
  for (const path of ['scripts/tabwise/r2-status.json', 'scripts/tabwise/qualification-status.json']) {
    const status = JSON.parse(readFileSync(path, 'utf8'));
    assert(status.enabled === false && status.verdict === 'BLOCK', `${path} unexpectedly enabled`);
  }
  tools = windowsProcessTools({spawn, env: process.env});
  report.preflight = await processBaseline(tools);
  assert(report.preflight.quiescent, `NVDA/relay not quiescent at baseline: ${report.preflight.errors.join('; ')}`);

  checkpoint('integrity-and-load');
  runtime = await loadQualificationRuntime();
  runtime.assertAuthentic();
  report.integrity = {frozen_runtime: true, versions: runtime.versions};
  const {settingsMismatch} = await import('../../src/speech/validate.mjs');
  report.startup.attempted = true;
  checkpoint('startup');
  const startTime = performance.now();
  let receipt;
  try {
    receipt = await runtime.nvda.start({settings: structuredClone(runtime.cfg.nvda_settings)});
  } finally {
    report.startup.elapsed_ms = Math.round(performance.now() - startTime);
  }
  started = true;
  report.startup.receipt = {
    pid: receipt.pid,
    relay_pid: receipt.relay_pid,
    reset_confirmed: receipt.reset_confirmed,
  };
  assert(Number.isSafeInteger(receipt.pid) && receipt.pid > 0, 'NVDA returned invalid process PID');
  assert(receipt.relay_pid === receipt.pid && receipt.reset_confirmed === true, 'NVDA start receipt did not establish ownership/reset');
  runtime.assertAuthentic();

  checkpoint('settings-readback');
  const settings = runtime.nvda.getSettings();
  const readback = Object.fromEntries(Object.entries(runtime.cfg.nvda_settings)
    .flatMap(([section, values]) => Object.keys(values)
      .map(key => [`${section}.${key}`, settings?.[section]?.[key] ?? null])));
  const mismatches = settingsMismatch(runtime.cfg.nvda_settings, readback);
  report.settings = {source: 'authentic nvda.getSettings(): session configuration file readback; no in-memory NVDA RPC available', readback, mismatches, matched: mismatches.length === 0};
  assert(mismatches.length === 0, `NVDA settings readback mismatch: ${mismatches.join('; ')}`);

  checkpoint('process-and-relay');
  const observedOwner = await runtime.relayOwnerPid();
  report.relay = {observed_owner_pid: observedOwner, receipt_pid: receipt.pid, matched: observedOwner === receipt.pid};
  assert(observedOwner === receipt.pid, 'Relay owner does not match owned NVDA process');
  const during = await tools.snapshot();
  const ownedProcess = during.processes.find(p => p.pid === receipt.pid && /^nvda(?:_[a-z0-9]+)?\.exe$/i.test(p.name));
  report.process = {pid: receipt.pid, alive: Boolean(ownedProcess), relay_listener_owned: during.nvda_listeners.includes(receipt.pid)};
  assert(report.process.alive && report.process.relay_listener_owned, 'Owned NVDA process or relay listener not present in OS snapshot');
} catch (error) {
  record(error);
} finally {
  if (started && runtime) {
    report.shutdown.attempted = true;
    checkpoint('shutdown');
    const stopTime = performance.now();
    try {
      await runtime.nvda.stop();
      report.shutdown.completed = true;
    } catch (error) {
      record(error);
    } finally {
      report.shutdown.elapsed_ms = Math.round(performance.now() - stopTime);
    }
  }
  if (tools) {
    checkpoint('post-quiescence');
    try {
      const snapshot = await tools.snapshot();
      const state = quiescenceOf(snapshot);
      const helpers = snapshot.processes.filter(p => /^nvdahelperremoteloader\.exe$/i.test(p.name)).map(p => ({pid: p.pid, name: p.name}));
      report.quiescence = {...state, helper_processes: helpers};
      if (!state.quiescent || helpers.length) record(Error(`Post-run residue: ${[...state.errors, ...helpers.map(p => `helper ${p.pid}`)].join('; ')}`));
    } catch (error) {
      record(Error(`Post-run quiescence unavailable: ${error.message || error}`));
    }
  }
  report.pass = report.errors.length === 0 && report.preflight?.quiescent === true
    && report.startup.receipt !== null && report.settings?.matched === true
    && report.relay?.matched === true && report.process?.alive === true && report.process?.relay_listener_owned === true && report.shutdown.completed === true
    && report.quiescence?.quiescent === true;
  report.completed_at = new Date().toISOString();
  try {
    save(report);
  } catch (error) {
    console.error('Diagnostic report could not be persisted:', error.message);
    process.exitCode = 1;
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}
