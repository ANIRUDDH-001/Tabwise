// T0 sandbox (D-39). Import this first in any test file that loads vendored Guidepup code
// (vendor/guidepup-0.36.4-r1). node --test runs each file in its own process, so these stubs stay
// in that file. Before anything vendored loads:
// - every child_process function, net.connect/createConnection and tls.connect throws, unless the
//   test installs a fake in `fakes` (name -> function);
// - fs.promises mkdtemp/writeFile/rm go through `fakes` when set (to hold or fail them), else real;
// - GUIDEPUP_SCREEN_READERS_PATH and LOCALAPPDATA point at an empty temp folder, so the real NVDA
//   cache on this machine (%LOCALAPPDATA%/guidepup) is never found.
// loadVendor() gives a fresh copy of the vendored tree (and of its one-shot r1Gate) per call.
import cp from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const VENDOR = path.join(ROOT, 'vendor', 'guidepup-0.36.4-r1');
export const REAL_LOCALAPPDATA = process.env.LOCALAPPDATA;

export const fakes = {};
export const calls = [];
export const CP = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'];
function stub(name) {
  return function sandboxed(...args) {
    calls.push(name);
    const fake = fakes[name];
    if (!fake) throw new Error(`SANDBOX: ${name} is blocked`);
    return fake.apply(this, args);
  };
}
for (const name of CP) cp[name] = stub(`child_process.${name}`);
net.connect = stub('net.connect');
net.createConnection = stub('net.createConnection');
tls.connect = stub('tls.connect');
for (const name of ['mkdtemp', 'writeFile', 'rm']) {
  const real = fs.promises[name];
  fs.promises[name] = function delegated(...args) {
    calls.push(`fs.${name}`);
    return (fakes[`fs.${name}`] ?? real).apply(this, args);
  };
}

export const EMPTY = fs.mkdtempSync(path.join(os.tmpdir(), 'r1-sandbox-'));
process.env.GUIDEPUP_SCREEN_READERS_PATH = EMPTY;
process.env.LOCALAPPDATA = EMPTY;

export function count(name) { return calls.filter((c) => c === name).length; }
export function reset() {
  calls.length = 0;
  for (const k of Object.keys(fakes)) delete fakes[k];
  process.env.GUIDEPUP_SCREEN_READERS_PATH = EMPTY;
}

// Fresh module instances of the vendored tree: the install-path memo and the r1Gate singleton reset.
export function loadVendor() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(VENDOR + path.sep)) delete require.cache[key];
  }
  const lib = (p) => require(path.join(VENDOR, 'lib', ...p.split('/')));
  return {
    lib,
    r1Gate: lib('windows/r1Gate.js'),
    NVDAClient: lib('windows/NVDA/NVDAClient.js').NVDAClient,
    runVbsScript: lib('windows/runVbsScript.js'),
    sendKeys: lib('windows/sendKeys.js'),
    teardown: lib('teardown.js'),
    KeyCodes: lib('windows/KeyCodes.js').KeyCodes,
    Modifiers: lib('windows/Modifiers.js').Modifiers,
    Key: lib('windows/Key.js').Key,
    keyCodeCommands: lib('windows/NVDA/keyCodeCommands.js').keyCodeCommands,
    nvdaModule: () => lib('windows/NVDA/NVDA.js'),
  };
}

// A placeholder NVDA install in temp: the files connect() looks for, no real program.
export function fakeNvdaInstall() {
  const manifest = JSON.parse(fs.readFileSync(path.join(VENDOR, 'manifest.json'), 'utf8'));
  const { version } = manifest.screenReaders.find(({ id }) => id === 'nvda').assets[0];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r1-fake-nvda-'));
  const exe = path.join(root, 'nvda', 'all', version, 'extracted', 'nvda.exe');
  const pem = path.join(path.dirname(exe), 'userConfig', 'remoteAccess', 'localRelay', 'NvdaRemoteRelay.pem');
  fs.mkdirSync(path.dirname(pem), { recursive: true });
  fs.writeFileSync(exe, 'placeholder, not a program');
  fs.writeFileSync(pem, 'placeholder');
  process.env.GUIDEPUP_SCREEN_READERS_PATH = root;
  return root;
}
