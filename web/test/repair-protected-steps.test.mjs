// Deterministic synthetic controls only; no native evidence or qualification.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessNativeRepair} from '../lib/server/repair-verdict.mjs';
const identity=(id,key=id+'#1')=>({available:true,connected:true,node_key:key,is_body:id==='body',tag:id==='body'?'body':'button',id:id==='body'?null:id,id_unique:id==='body'?null:true,role:id==='body'?null:'button',input_type:null});
const snapshot=(id,key=id+'#1')=>({identity_version:2,active:id==='body'?'body':key,active_identity:identity(id,id==='body'?'body':key),state:{dialogs:[]}});
function args(){
 const cap=active=>({source:'nvda',completed:true,outcome:'COMPLETE',reasons:[],records:[
  {step:'a1',press:'Tab',capture_status:'speech',reasons:[],page:{after:snapshot('choose-seat')}},
  {step:'a2',press:'Enter',capture_status:'speech',reasons:[],page:{before:{state:{dialogs:['dialog#1']}},after:snapshot(active)}}]});
 return {baselineCapture:cap('body'),rerunCapture:cap('choose-seat'),baselineEvidence:{lanes:{speech:[{step:1,text:'Choose seat button'}]}},rerunEvidence:{lanes:{speech:[{step:1,text:'Choose seat button'}]}},steps:[{step:1,key:'Tab'},{step:2,key:'Enter'}],oracle:{kind:'focus',step:2}};
}
test('unchanged protected logical focus permits different per-session ordinals',()=>{const a=args();a.rerunCapture.records[0].page.after=snapshot('choose-seat','choose-seat#7');assert.equal(assessNativeRepair(a).verdict,'FIXED');});
test('unchanged speech cannot hide an unrelated focus regression',()=>{const a=args();a.rerunCapture.records[0].page.after=snapshot('cancel');assert.equal(assessNativeRepair(a).verdict,'REGRESSED');});
for(const kind of ['legacy','missing','detached','duplicate-id','contradictory-key','missing-speech','null-speech'])test('protected step cannot be certified with '+kind,()=>{
 const a=args(),after=a.rerunCapture.records[0].page.after;
 if(kind==='legacy')delete after.identity_version;
 if(kind==='missing')delete after.active_identity;
 if(kind==='detached')after.active_identity.connected=false;
 if(kind==='duplicate-id')after.active_identity.id_unique=false;
 if(kind==='contradictory-key')after.active_identity.node_key='other#4';
 if(kind==='missing-speech')a.baselineEvidence.lanes.speech=[];
 if(kind==='null-speech')a.baselineEvidence.lanes.speech[0].text=null;
 assert.equal(assessNativeRepair(a).verdict,'INCONCLUSIVE');
});
test('known loss of unaffected speech is a regression while absent lane is inconclusive',()=>{
 const a=args();a.rerunEvidence.lanes.speech=[];a.rerunCapture.records[0].capture_status='observed-silence';assert.equal(assessNativeRepair(a).verdict,'REGRESSED');
 delete a.rerunEvidence.lanes.speech;assert.equal(assessNativeRepair(a).verdict,'INCONCLUSIVE');
});
