import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { checkR1Baseline, BASELINE_REVISION } from '../scripts/check-r1-baseline.mjs';

test('R1 baseline is anchored to the recorded successful A15 revision', () => {
  assert.equal(BASELINE_REVISION, '0c93fa73e0c111a2df65302adfe0006d63f50a39');
  assert.deepEqual(checkR1Baseline().errors, []);
});

test('R1 baseline detects changed files, missing entries and a rewritten manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'tabwise-baseline-'));
  const paths = ['.github/workflows/r1.yml', 'scripts/r1.mjs', 'package-lock.json'];
  for (const p of [...paths, 'ci/r1-baseline.sha256']) {
    mkdirSync(dirname(join(root, p)), {recursive:true});
    writeFileSync(join(root, p), readFileSync(p));
  }
  assert.deepEqual(checkR1Baseline(root).errors, []);
  writeFileSync(join(root, paths[0]), 'tampered');
  assert.match(checkR1Baseline(root).errors.join('\n'), /r1.yml/);
  writeFileSync(join(root, 'ci/r1-baseline.sha256'), '0'.repeat(64)+'  scripts/r1.mjs\n');
  assert.match(checkR1Baseline(root).errors.join('\n'), /manifest/);
});
