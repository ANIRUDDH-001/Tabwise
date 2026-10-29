import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createQualificationWriter,verifyQualificationArtifact} from '../scripts/tabwise/qualification-evidence.mjs';
test('qualification artifacts bind original journals/result and metadata with read-back hashes',()=>{
 const root=mkdtempSync(join(tmpdir(),'tw-qual-evidence-'));try{
  const dir=join(root,'evidence'),writer=createQualificationWriter(dir,{head_sha:'a'.repeat(40),run_id:'1',attempt:1,profile:'A15'});
  writer.append('intents',{id:1,key:'Insert+T'});writer.append('focus',{pid:123,nonce:'owned'});
  assert.throws(()=>writer.append('../escape',{}),/journal/);
  const sealed=writer.finish({candidate_pass:false,relay_equivalence_verified:false,reasons:['synthetic offline test']});
  assert.match(sealed.manifest_sha256,/^[a-f0-9]{64}$/);assert.equal(verifyQualificationArtifact(dir).ok,true);
  assert.throws(()=>writer.append('intents',{}),/sealed/);
  writeFileSync(join(dir,'intents.jsonl'),'forged');assert.equal(verifyQualificationArtifact(dir).ok,false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
