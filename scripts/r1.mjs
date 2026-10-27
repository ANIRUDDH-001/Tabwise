// R1: real NVDA speech on our own fixture page (PLAN F-02, D-33, D-34). The user runs it: npm run r1.
// `node scripts/r1.mjs --hashes` prints the hashes fixtures/r1/lock.json must hold and starts nothing.
// Ctrl+C: Guidepup's own teardown (lib/teardown.js) also stops NVDA on SIGINT; ours writes the evidence.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { release } from 'node:os';
import {
  serveDir, specText, lockMismatches, evidenceWriter, runR1, installAbort, buildSummary,
} from '../src/speech/capture.mjs';

const LOCKED = ['fixtures/r1/signup.html', 'fixtures/r1/steps.json', 'src/speech/validate.mjs', 'src/speech/capture.mjs', 'scripts/r1.mjs'];
// SHA-256 of the UTF-8 text with CRLF -> LF, so a checkout under core.autocrlf=true doesn't change the hash.
const sha = (s) => createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex');
const text = (f) => readFileSync(f, 'utf8');
const hashes = () => ({
  'docs/ledger/PLAN.md#F-02': sha(specText(text('docs/ledger/PLAN.md').replace(/\r\n/g, '\n'))),
  ...Object.fromEntries(LOCKED.map((f) => [f, sha(text(f))])),
});

if (process.argv.includes('--hashes')) {
  console.log(JSON.stringify(hashes(), null, 2));
  process.exit(0);
}
if (process.platform !== 'win32') {
  console.error('R1 needs Windows (NVDA).');
  process.exit(2);
}
const lock = JSON.parse(readFileSync('fixtures/r1/lock.json', 'utf8'));
const current = hashes();
const changed = lockMismatches(lock.sha256, current);
if (changed.length) {
  console.error(`Refusing to run: changed since the lock (${lock.locked_at}): ${changed.join(', ')}`);
  process.exit(2);
}

const cfg = JSON.parse(readFileSync('fixtures/r1/steps.json', 'utf8'));
const runId = `r1-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`;
const dir = `docs/evidence/r1/${runId}`;
if (existsSync(dir)) {
  console.error(`Refusing to run: ${dir} exists`);
  process.exit(2);
}
const pkg = (n) => JSON.parse(readFileSync(`node_modules/${n}/package.json`, 'utf8')).version;
const manifest = JSON.parse(readFileSync('node_modules/@guidepup/guidepup/manifest.json', 'utf8'));
const versions = {
  node: process.versions.node,
  '@guidepup/guidepup': pkg('@guidepup/guidepup'),
  '@playwright/test': pkg('@playwright/test'),
  nvda: manifest.screenReaders.find(({ id }) => id === 'nvda').assets[0].version,
  chromium: null,
  os: `${process.platform} ${release()}`,
};

const { nvda } = await import('@guidepup/guidepup');
const { chromium } = await import('@playwright/test');

// Playwright only opens the page: a new headed Chromium per attempt, then bringToFront. No clicks.
const browser = {
  async open(url) {
    const b = await chromium.launch({ headless: false });
    try {
      versions.chromium ??= b.version();
      const page = await b.newPage();
      await page.goto(url, { waitUntil: 'load', timeout: cfg.load_timeout_ms });
      await page.bringToFront();
      return { close: () => b.close() };
    } catch (e) {
      await b.close().catch(() => {});
      throw e;
    }
  },
};

const { server, port } = await serveDir(new URL('../fixtures/', import.meta.url));
const state = { aborted: false };
const evidence = evidenceWriter(dir);
const meta = { spec: 'docs/ledger/PLAN.md F-02 (D-33, D-34)', command: 'npm run r1', evidence_dir: dir, lock: current, versions };
const dispose = installAbort({ state, evidence, cfg, runId, meta });

console.log(`R1 ${runId}: 3 attempts, NVDA will speak. Hands off the keyboard and mouse until it ends.`);
console.log(`Evidence: ${dir}/   Ctrl+C stops it and keeps partial evidence.`);
let summary = null;
try {
  summary = await runR1({ nvda, browser, cfg, runId, baseUrl: `http://127.0.0.1:${port}`, evidence, state, meta });
} catch (e) {
  summary = buildSummary({ cfg, runId, attempts: state.attempts ?? [], status: 'crashed', meta: { ...meta, error: String(e?.message ?? e) } });
  evidence.summary(summary);
} finally {
  if (!state.aborted) {
    dispose();
    server.close();
  }
}
if (summary) {
  for (const a of summary.attempts) {
    console.log(`attempt ${a.attempt}: ${a.status}, fresh ${a.fresh}, complete ${a.complete}`);
    for (const r of a.reasons) console.log(`  - ${r}`);
  }
  console.log(`R1 result: ${summary.result}${summary.rerun_allowed ? ' (setup failed before step 1: a rerun is allowed, F-02)' : ''}`);
  process.exit(summary.result === 'PASS' ? 0 : 1);
}
