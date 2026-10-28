// D-50: offline checks for the test-only Windows preflight (.github/workflows/preflight.yml).
// Reads files, runs `node scripts/r1.mjs --hashes` (which starts nothing) and read-only git. Never starts
// R1, NVDA, a browser, desktop input or a network call. Prints one JSON report; exit 1 if any check fails.
// Usage: node scripts/preflight.mjs [--clean] [--out <file>]   --clean also requires an unchanged checkout.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

// DECISIONS D23: PLAN.md from "## Pre-registered Day-1 tests" up to "## Day plan", CRLF -> LF.
const GATES_SHA256 = 'ca0c9feb568e7c9c4ea41832607f510af0cbf5548242adcd77f729e039af3362';
const NODE = '24.22.1';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const lf = (f) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
const attempt = (name, fn) => { try { fn(); } catch (e) { check(name, false, String(e?.message ?? e)); } };

attempt('node version', () => check('node version', process.versions.node === NODE, process.versions.node));

attempt('lock', () => {
  const lock = JSON.parse(readFileSync('fixtures/r1/lock.json', 'utf8'));
  const now = JSON.parse(execFileSync(process.execPath, ['scripts/r1.mjs', '--hashes'], { encoding: 'utf8' }));
  const diff = (a, b) => [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].filter((k) => a?.[k] !== b?.[k]);
  check('lock sha256', isDeepStrictEqual(lock.sha256, now.sha256), diff(lock.sha256, now.sha256));
  check('lock dependencies', isDeepStrictEqual(lock.dependencies, now.dependencies), diff(lock.dependencies, now.dependencies));
  check('lock vendor_tree', lock.vendor_tree === now.vendor_tree, now.vendor_tree);
});

attempt('Day-1 gates', () => {
  const plan = lf('docs/ledger/PLAN.md');
  const a = plan.indexOf('## Pre-registered Day-1 tests');
  const b = plan.indexOf('## Day plan');
  const got = a >= 0 && b > a ? sha(plan.slice(a, b)) : 'section not found';
  check('Day-1 gates', got === GATES_SHA256, got);
});

attempt('dependency tree', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const lockfile = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const wanted = { ...pkg.dependencies, ...pkg.devDependencies };
  const off = Object.entries(wanted).filter(([name]) => {
    const installed = JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version;
    return installed !== lockfile.packages?.[`node_modules/${name}`]?.version;
  }).map(([name]) => name);
  check('dependency tree', off.length === 0, off);
});

if (process.argv.includes('--clean')) {
  attempt('checkout unchanged', () => {
    const status = git(['status', '--porcelain', '--untracked-files=all']);
    check('checkout unchanged', status === '', status ? status.split('\n') : []);
  });
}

let head = null;
attempt('git HEAD', () => { head = git(['rev-parse', 'HEAD']); });
const report = { ok: checks.every((c) => c.ok), head, checks };
const text = `${JSON.stringify(report, null, 2)}\n`;
const outAt = process.argv.indexOf('--out');
if (outAt > 0 && !process.argv[outAt + 1]) { process.stderr.write('--out needs a file\n'); process.exit(2); }
if (outAt > 0) writeFileSync(process.argv[outAt + 1], text);
process.stdout.write(text);
process.exit(report.ok ? 0 : 1);
