import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixtures} from '../fixtures.mjs';
import {validateContract,verifyManifest,validateDiagnosis,sha256} from '../index.mjs';

test('manifest binds its evidence digest to exactly one evidence artifact',()=>{
  const m=structuredClone(fixtures['artifact-manifest'].valid);
  m.evidence_sha256='0'.repeat(64);
  assert.equal(verifyManifest(m,{'evidence.json':Buffer.from('{}')}).ok,false);
});
test('artifact paths reject directory aliases, trailing slashes and reserved control paths',()=>{
  for(const path of ['a//b','a/','./a','../a','a/../b','/a','C:/x','a\\b','.git/config']) {
    const m=structuredClone(fixtures['artifact-manifest'].valid);m.files[0].path=path;
    assert.equal(validateContract('artifact-manifest',m).ok,false,path);
  }
});
test('manifest measures aggregate bytes and individual journal/screenshot caps',()=>{
  for(const [kind,size] of [['screenshot',150001],['journal',512001]]) {
    const bytes=Buffer.alloc(size);const m=structuredClone(fixtures['artifact-manifest'].valid);
    m.files=[{path:'too-large.bin',kind,bytes:size,sha256:sha256(bytes)}];
    assert.equal(verifyManifest(m,{'too-large.bin':bytes}).ok,false);
  }
  const bytes=Buffer.alloc(2000001);const m=structuredClone(fixtures['artifact-manifest'].valid);
  m.files=['a','b'].map(path=>({path,kind:'source',bytes:bytes.length,sha256:sha256(bytes)}));
  assert.equal(verifyManifest(m,{a:bytes,b:bytes}).ok,false);
});
test('evidence refs are globally unique and observed silence has a positive qualified window',()=>{
  const b=structuredClone(fixtures['evidence-bundle'].valid);
  b.lanes.focus.push({...b.lanes.keys[0]});
  assert.equal(validateContract('evidence-bundle',b).ok,false);
  b.lanes.focus=[];b.lanes.speech=[{...b.lanes.keys[0],evidence_ref:'speech:1',kind:'observed-silence',text:null,duration_ms:0}];
  assert.equal(validateContract('evidence-bundle',b).ok,false);
});
test('verdict consistency refuses missing integrity, same run and contradictory fixed assertions',()=>{
  const v=structuredClone(fixtures.verdict.valid);v.verdict='FIXED';
  assert.equal(validateContract('verdict',v).ok,false);
  v.checks={symptom_gone:true,other_steps_preserved:true,evidence_complete:true};
  assert.equal(validateContract('verdict',v).ok,true);
  v.verify_run_id=v.baseline_run_id;
  assert.equal(validateContract('verdict',v).ok,false);
});
test('input citations must originate in timeline/signals and source content hashes match',()=>{
  const input=structuredClone(fixtures['diagnosis-input'].valid);
  input.evidence_refs.push('invented');
  const out=structuredClone(fixtures['diagnosis-output'].valid);out.findings[0].evidence_refs=['invented'];
  assert.equal(validateDiagnosis(input,out).ok,false);
});
