import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as storage from '../src/repair/persistence.mjs';
import {fixtures} from '../packages/contracts/fixtures.mjs';
import {sha256} from '../packages/contracts/index.mjs';
import {DIAGNOSIS_PROMPT} from '../src/meta/diagnosis.mjs';
function sample(){
 const input=structuredClone(fixtures['diagnosis-input'].valid),output=structuredClone(fixtures['diagnosis-output'].valid),source='<form></form>';
 input.source=[{path:'index.html',sha256:sha256(source),lines:[{n:1,text:source}]}];output.findings[0].location.path='index.html';
 output.findings[0].patch={diff:'--- a/index.html\n+++ b/index.html\n@@ -1,1 +1,1 @@\n-<form></form>\n+<form aria-label="Passenger"></form>\n',rationale:'Synthetic patch',expected_speech_after:[]};
 return {userId:'owner',run:{id:input.run_id,spec:{app_hash:sha256(source)}},input,source,result:{model:'muse-spark-1.3',mode:'standard',input_sha256:sha256(JSON.stringify(input)),prompt_sha256:sha256(DIAGNOSIS_PROMPT),output,usage:{input_tokens:1,output_tokens:1},reservation_id:'reservation'}};
}
test('diagnosis persistence atomically stores validated findings/patches through the settled-reservation RPC',async()=>{
 const args=sample(),calls=[];const saved=await storage.persistValidatedDiagnosis({...args,rpc:async(name,params)=>{calls.push({name,params});return {data:{diagnosis_id:'stored'},error:null};}});
 assert.equal(saved.diagnosis_id,'stored');assert.equal(calls.length,1);assert.equal(calls[0].name,'persist_diagnosis');
 const p=calls[0].params;assert.equal(p.p_reservation,'reservation');assert.equal(p.p_user,'owner');assert.equal(p.p_findings[0].patch_validation.ok,true);assert.equal(p.p_findings[0].patch_contract.base_sha256,args.run.spec.app_hash);
});
test('invalid patch remains a diagnosis with explicit rejection, never a stored actionable patch',async()=>{
 const args=sample();args.result.output.findings[0].patch.diff=args.result.output.findings[0].patch.diff.replace('-<form></form>','-wrong context');
 let parameters;await storage.persistValidatedDiagnosis({...args,rpc:async(name,p)=>{parameters=p;return {data:{diagnosis_id:'stored'}};}});
 assert.equal(parameters.p_findings[0].patch_contract,null);assert.equal(parameters.p_findings[0].patch_validation.ok,false);
});
test('wrong source, run, input hash, model or citations refuse before persistence',async()=>{
 let calls=0;const rpc=async()=>calls++;
 for(const change of [a=>{a.source='changed';},a=>{a.run.id='other';},a=>{a.result.model='unapproved';},a=>{a.result.input_sha256='0'.repeat(64);},a=>{a.result.output.findings[0].evidence_refs=['invented'];}]){
  const args=sample();change(args);await assert.rejects(()=>storage.persistValidatedDiagnosis({...args,rpc}));
 }
 assert.equal(calls,0);
 const args=sample();await assert.rejects(()=>storage.persistValidatedDiagnosis({...args,rpc:async()=>({error:{message:'internal'}})}),/persistence/);
});
