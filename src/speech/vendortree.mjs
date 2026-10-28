// D-39 vendored Guidepup tree (vendor/guidepup-0.36.4-r1): what is on disk, and what is loaded.
// checkVendor: every file is byte-identical to the installed upstream @guidepup/guidepup 0.36.4, except the
// CHANGED files (their sha256 must match VENDORED.md) and the ADDED ones; no extra files, no CR bytes.
// vendorIntegrity: before every send (sendGate setIntegrity), the loaded tree is frozen, holds this run's
// gate, and no upstream Guidepup lib/ module is loaded beside it.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const HEADER = 'Modified for R1 (D-39) from @guidepup/guidepup 0.36.4, MIT © 2023 Craig Morten; see VENDORED.md';
export const CHANGED = Object.freeze([
  'lib/teardown.js', 'lib/windows/NVDA/NVDA.js', 'lib/windows/NVDA/NVDAClient.js', 'lib/windows/runVbsScript.js', 'lib/windows/sendKeys.js',
  'lib/windows/NVDA/start.js', 'lib/windows/NVDA/quit.js', 'lib/windows/NVDA/isRunning.js',
]);
export const headerFor = (file) => HEADER.replace('(D-39)', ['lib/windows/NVDA/start.js', 'lib/windows/NVDA/quit.js', 'lib/windows/NVDA/isRunning.js'].includes(file) ? '(D-43)' : '(D-39)');
export const ADDED = Object.freeze(['VENDORED.md', 'lib/windows/r1Gate.js']);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const VENDOR_DIR = path.join(ROOT, 'vendor', 'guidepup-0.36.4-r1');
export const UPSTREAM_VERSION = '0.36.4';

// D-42 (D39-S02): the installed upstream files fixtures/r1/lock.json pins (its dependencies), exactly these.
const UP = 'node_modules/@guidepup/guidepup';
export const UPSTREAM_PINS = Object.freeze([
  `${UP}/package.json`, `${UP}/lib/windows/NVDA/NVDAClient.js`, `${UP}/lib/windows/NVDA/NVDA.js`,
  `${UP}/lib/windows/NVDA/keyCodeCommands.js`, `${UP}/lib/windows/Key.js`, `${UP}/lib/windows/sendKeys.js`,
  `${UP}/lib/windows/runVbsScript.js`,
  `${UP}/lib/windows/NVDA/start.js`, `${UP}/lib/windows/NVDA/quit.js`, `${UP}/lib/windows/NVDA/isRunning.js`,
]);
// lockDeps: the lock's dependencies; actual: path -> sha256 of the installed file (null if unreadable).
export function pinErrors(lockDeps, actual) {
  const pins = lockDeps && typeof lockDeps === 'object' ? lockDeps : {};
  const out = [];
  for (const k of UPSTREAM_PINS) {
    if (!(k in pins)) out.push(`missing from lock.dependencies: ${k}`);
    else if (!/^[0-9a-f]{64}$/.test(pins[k] ?? '')) out.push(`not a sha256 in lock.dependencies: ${k}`);
    else if (actual?.[k] !== pins[k]) out.push(`installed file differs from lock.dependencies: ${k}`);
  }
  for (const k of Object.keys(pins)) if (!UPSTREAM_PINS.includes(k)) out.push(`not expected in lock.dependencies: ${k}`);
  return out;
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const abs = (dir, rel) => path.join(dir, ...rel.split('/'));

export function walk(dir) {
  const out = [];
  const visit = (sub) => {
    for (const e of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${e.name}` : e.name;
      if (e.isDirectory()) visit(rel);
      else out.push(rel);
    }
  };
  visit('');
  return out.sort();
}

export function treeHash(dir) {
  const h = createHash('sha256');
  for (const rel of walk(dir)) h.update(`${rel}\0${sha(fs.readFileSync(abs(dir, rel)))}\n`);
  return h.digest('hex');
}

// Relative require() targets reachable from entry, entry included.
export function closure(dir, entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    if (!rel.endsWith('.js')) continue;
    const text = fs.readFileSync(abs(dir, rel), 'utf8');
    for (const [, spec] of text.matchAll(/require\("(\.{1,2}\/[^"]+)"\)/g)) {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
      const hit = [base, `${base}.js`, `${base}.json`, `${base}/index.js`].find((c) => fs.existsSync(abs(dir, c)) && fs.statSync(abs(dir, c)).isFile());
      if (!hit) throw new Error(`closure: ${rel} requires ${spec}, not found`);
      queue.push(hit);
    }
  }
  return [...seen].sort();
}

// VENDORED.md rows: | `path` | upstream sha256 or — | vendored sha256 | change |
export function vendoredRows(text) {
  const rows = {};
  for (const [, rel, up, ours] of text.matchAll(/^\| `([\w./-]+)` \| (?:`([0-9a-f]{64})`|—) \| `([0-9a-f]{64})` \|/gm)) {
    rows[rel] = { upstream: up ?? null, vendored: ours };
  }
  return rows;
}

export function checkVendor({ vendor = VENDOR_DIR, upstream }) {
  const out = [];
  const files = walk(vendor);
  for (const f of [...CHANGED, ...ADDED]) if (!files.includes(f)) out.push(`${f}: missing from the vendored tree`);
  const rows = files.includes('VENDORED.md') ? vendoredRows(fs.readFileSync(abs(vendor, 'VENDORED.md'), 'utf8')) : {};
  for (const f of Object.keys(rows)) if (!CHANGED.includes(f) && !ADDED.includes(f)) out.push(`VENDORED.md lists ${f}, which is not a changed or added file`);
  try {
    const v = JSON.parse(fs.readFileSync(path.join(upstream, 'package.json'), 'utf8')).version;
    if (v !== UPSTREAM_VERSION) out.push(`upstream @guidepup/guidepup is ${v}, not ${UPSTREAM_VERSION}`);
  } catch (e) { out.push(`upstream package.json unreadable: ${e.message}`); }
  for (const f of files) {
    const buf = fs.readFileSync(abs(vendor, f));
    if (buf.includes(0x0d)) out.push(`${f}: contains a CR byte`);
    if (f === 'VENDORED.md') continue;
    const up = abs(upstream, f);
    const inUpstream = fs.existsSync(up);
    if (CHANGED.includes(f) || ADDED.includes(f)) {
      const row = rows[f];
      if (!row) { out.push(`${f}: no row in VENDORED.md`); continue; }
      if (sha(buf) !== row.vendored) out.push(`${f}: sha256 ${sha(buf)} does not match VENDORED.md ${row.vendored}`);
      if (CHANGED.includes(f)) {
        if (!inUpstream || sha(fs.readFileSync(up)) !== row.upstream) out.push(`${f}: upstream sha256 does not match VENDORED.md`);
        if (buf.toString('utf8').split('\n')[0] !== `// ${headerFor(f)}`) out.push(`${f}: first line is not the R1 header`);
      } else if (inUpstream) out.push(`${f}: added file also exists upstream`);
      continue;
    }
    if (!inUpstream) out.push(`${f}: not in upstream @guidepup/guidepup`);
    else if (!buf.equals(fs.readFileSync(up))) out.push(`${f}: differs from upstream`);
  }
  return out;
}

const norm = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));

export function upstreamLoaded(cache, root = ROOT) {
  const prefix = norm(path.join(root, 'node_modules', '@guidepup', 'guidepup', 'lib')) + path.sep;
  return Object.keys(cache).filter((k) => norm(k).startsWith(prefix));
}

// mods: the vendored modules as loaded (r1Gate, NVDAClient, runVbsScript, sendKeys, teardown, KeyCodes,
// Modifiers, Key, keyCodeCommands); nvda: the loaded NVDA.js exports.
export function vendorIntegrity({ mods, nvda, gate, getGate, cache, root = ROOT, vendor = VENDOR_DIR }) {
  const out = [];
  const frozen = (name, ...values) => { if (!values.every((v) => Object.isFrozen(v))) out.push(`${name} is not frozen`); };
  const entries = (o) => Object.values(o ?? {});
  frozen('KeyCodes', mods.KeyCodes, ...entries(mods.KeyCodes));
  frozen('Modifiers', mods.Modifiers, ...entries(mods.Modifiers));
  frozen('Key', mods.Key, mods.Key?.prototype);
  const cmds = entries(mods.keyCodeCommands);
  frozen('keyCodeCommands', mods.keyCodeCommands, ...cmds, ...cmds.flatMap((c) => [c.keyCode, c.modifiers].filter((x) => x && typeof x === 'object')));
  frozen('NVDAClient.prototype', mods.NVDAClient?.prototype);
  frozen('sendKeys exports', mods.sendKeys);
  frozen('runVbsScript exports', mods.runVbsScript);
  frozen('r1Gate exports', mods.r1Gate);
  frozen('teardown exports', mods.teardown);
  if (!nvda) out.push('NVDA.js is not loaded');
  else frozen('NVDA', nvda, nvda.NVDA, nvda.NVDA?.prototype);
  try {
    if (getGate() !== gate) out.push("the vendored r1Gate holds a gate that is not this run's gate");
  } catch (e) { out.push(`r1Gate: ${e.message}`); }
  const loaded = (rel) => cache[abs(vendor, rel)]?.exports;
  frozen('send gate', gate);
  for (const rel of ['lib/windows/NVDA/start.js', 'lib/windows/NVDA/quit.js', 'lib/windows/NVDA/isRunning.js']) {
    const mod = loaded(rel);
    if (!mod || !Object.isFrozen(mod)) out.push(`${rel}: lifecycle exports are missing or not frozen`);
  }
  for (const [rel, mod] of [['lib/windows/r1Gate.js', mods.r1Gate], ['lib/windows/runVbsScript.js', mods.runVbsScript], ['lib/windows/sendKeys.js', mods.sendKeys]]) {
    if (loaded(rel) !== mod) out.push(`${rel}: the loaded module is not the one checked`);
  }
  if (loaded('lib/windows/NVDA/NVDAClient.js')?.NVDAClient !== mods.NVDAClient) out.push('lib/windows/NVDA/NVDAClient.js: the loaded module is not the one checked');
  const up = upstreamLoaded(cache, root);
  if (up.length) out.push(`upstream Guidepup module loaded: ${up.join(', ')}`);
  return out;
}
