// D-73 run 40849425253: windows-2025 checkout (core.autocrlf=true) wrote package-lock.json as CRLF, while the
// R1 manifest pins the LF Git blob. Temporary fixtures only; frozen files are never modified.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { checkR1Baseline, checkFrozenIntegrity, BASELINE_REVISION } from '../scripts/check-r1-baseline.mjs';

const BASELINE = ['.github/workflows/r1.yml', 'scripts/r1.mjs', 'package-lock.json'];
const LOCK_CRLF_SHA = '2306bb99ff313aecee64e63117534cb084b26262b3c58c41ad7db0175f7fb820';
const blob = path => execFileSync('git', ['cat-file', 'blob', `${BASELINE_REVISION}:${path}`]);
const lf = bytes => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const crlf = bytes => Buffer.from(lf(bytes).toString('latin1').replace(/\n/g, '\r\n'), 'latin1');
const sha = bytes => execFileSync(process.execPath, ['-e', 'process.stdin.pipe(require("crypto").createHash("sha256").setEncoding("hex")).pipe(process.stdout)'], { input: bytes, encoding: 'utf8' });
const put = (root, path, bytes) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes); };

function baselineRoot(eol) {
  const root = mkdtempSync(join(tmpdir(), 'tabwise-eol-'));
  for (const path of BASELINE) put(root, path, eol(blob(path)));
  put(root, 'ci/r1-baseline.sha256', eol(readFileSync('ci/r1-baseline.sha256')));
  return root;
}

// Every Git-tracked text input of checkFrozenIntegrity in the given line-ending form; node_modules (npm) and
// vendor/** (-text) keep their raw bytes, exactly as a hosted checkout + npm ci leaves them.
function frozenRoot(eol) {
  const root = baselineRoot(eol), lock = JSON.parse(readFileSync('fixtures/r1/lock.json', 'utf8'));
  for (const path of ['fixtures/r1/lock.json', ...Object.keys(lock.sha256).map(p => p.split('#')[0])]) put(root, path, eol(readFileSync(path)));
  for (const path of Object.keys(lock.dependencies)) put(root, path, readFileSync(path));
  cpSync('vendor/guidepup-0.36.4-r1', join(root, 'vendor/guidepup-0.36.4-r1'), { recursive: true });
  return root;
}

const withRoot = (make, fn) => { const root = make(); try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); } };

test('the frozen baseline is the LF Git blob at the R1 revision, and its CRLF conversion is byte-equivalent', () => {
  for (const path of BASELINE) {
    const bytes = blob(path);
    assert.equal(bytes.includes(13), false, `${path} blob contains no CR, so CRLF->LF is lossless`);
    assert.deepEqual(lf(crlf(bytes)), bytes, path);
  }
  assert.equal(sha(crlf(blob('package-lock.json'))), LOCK_CRLF_SHA, 'hash reported by the D-73 CRLF checkout reproduction');
});

test('R1 baseline accepts the original LF bytes and a uniform CRLF checkout', () => {
  withRoot(() => baselineRoot(lf), root => assert.deepEqual(checkR1Baseline(root).errors, []));
  withRoot(() => baselineRoot(crlf), root => {
    assert.equal(sha(readFileSync(join(root, 'package-lock.json'))), LOCK_CRLF_SHA);
    assert.deepEqual(checkR1Baseline(root).errors, []);
  });
});

test('R1 baseline rejects a genuine lockfile change in either line-ending form', () => {
  for (const eol of [lf, crlf]) withRoot(() => baselineRoot(eol), root => {
    const text = readFileSync(join(root, 'package-lock.json'), 'latin1');
    const changed = text.replace(/"version": "[^"]+"/, '"version": "9.9.9"');
    assert.notEqual(changed, text);
    writeFileSync(join(root, 'package-lock.json'), changed, 'latin1');
    assert.deepEqual(checkR1Baseline(root).errors, ['R1 baseline mismatch: package-lock.json']);
  });
});

test('R1 baseline rejects non-uniform line endings and stray carriage returns in the lockfile', () => {
  const original = blob('package-lock.json').toString('latin1');
  const variants = {
    mixed: original.replace('\n', '\r\n'),
    'mixed (one LF left in CRLF)': crlf(blob('package-lock.json')).toString('latin1').replace('\r\n', '\n'),
    'lone CR': original.replace('{', '{\r'),
    'CR CR LF': crlf(blob('package-lock.json')).toString('latin1').replace('\r\n', '\r\r\n'),
    'trailing CRLF added': crlf(blob('package-lock.json')).toString('latin1') + '\r\n',
  };
  for (const [name, text] of Object.entries(variants)) withRoot(() => baselineRoot(lf), root => {
    writeFileSync(join(root, 'package-lock.json'), text, 'latin1');
    assert.deepEqual(checkR1Baseline(root).errors, ['R1 baseline mismatch: package-lock.json'], name);
  });
});

test('R1 baseline rejects a manifest rewritten to trust the CRLF hash or a tampered lockfile', () => {
  withRoot(() => baselineRoot(crlf), root => {
    const path = join(root, 'ci/r1-baseline.sha256');
    writeFileSync(path, readFileSync(path, 'latin1').replace(/^[a-f0-9]{64}(?=  package-lock\.json)/m, LOCK_CRLF_SHA), 'latin1');
    assert.match(readFileSync(path, 'latin1'), new RegExp(`${LOCK_CRLF_SHA}  package-lock.json`));
    assert.deepEqual(checkR1Baseline(root).errors, ['baseline manifest differs from trusted revision']);
  });
});

test('full frozen integrity accepts a CRLF checkout yet still rejects modified frozen sources', () => {
  withRoot(() => frozenRoot(crlf), root => {
    assert.deepEqual(checkFrozenIntegrity(root).errors, []);
    for (const file of ['src/speech/sendguard.mjs', 'scripts/r1.mjs', 'package-lock.json']) {
      const path = join(root, file), before = readFileSync(path);
      writeFileSync(path, Buffer.concat([before, Buffer.from('\r\n/* changed */\r\n')]));
      assert.equal(checkFrozenIntegrity(root).ok, false, file);
      writeFileSync(path, before);
    }
    assert.deepEqual(checkFrozenIntegrity(root).errors, []);
  });
});

test('observer entry still refuses before runtime loading when the lockfile content differs', () => {
  const run = root => {
    for (const file of ['scripts/tabwise-observer.mjs', 'scripts/check-r1-baseline.mjs']) put(root, file, readFileSync(file));
    return spawnSync(process.execPath, [join(root, 'scripts/tabwise-observer.mjs'), '--check-only'], { encoding: 'utf8', env: { ...process.env, TABWISE_QUALIFICATION_ENABLED: 'true' } });
  };
  withRoot(() => frozenRoot(crlf), root => {
    writeFileSync(join(root, 'package-lock.json'), readFileSync(join(root, 'package-lock.json'), 'latin1').replace('"lockfileVersion"', '"lockfileVersion_"'), 'latin1');
    const result = run(root);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Observer qualification refused\/failed: BLOCK: R1 baseline mismatch: package-lock\.json/);
  });
  // A legitimate CRLF checkout passes the frozen gate; this stripped root then fails loading the policy module,
  // which proves the refusal above came from the pre-runtime integrity check.
  withRoot(() => frozenRoot(crlf), root => {
    const result = run(root);
    assert.equal(result.status, 2);
    assert.doesNotMatch(result.stderr, /R1 /);
    assert.match(result.stderr, /qualification-policy/);
  });
});
