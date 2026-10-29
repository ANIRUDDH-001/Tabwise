import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateSnapshot} from '../lib/snapshot.mjs';
const snapshot=JSON.parse(readFileSync(new URL('../data/r1.json',import.meta.url),'utf8'));
test('static R1 snapshot binds source bytes, provenance and limitations',()=>{
  assert.equal(validateSnapshot(snapshot).ok,true);
  for(const field of ['run_id','github_run_id','model_provenance','limitations','snapshot_sha256']){
    const altered=structuredClone(snapshot);delete altered[field];
    assert.equal(validateSnapshot(altered).ok,false,field);
  }
  const altered=structuredClone(snapshot);altered.raw=['invented speech'];
  assert.equal(validateSnapshot(altered).ok,false);
});
test('snapshot refuses private/evaluation inputs even if otherwise well formed',()=>{
  const altered=structuredClone(snapshot);altered.source_kind='private-eval';
  assert.equal(validateSnapshot(altered).ok,false);
});
