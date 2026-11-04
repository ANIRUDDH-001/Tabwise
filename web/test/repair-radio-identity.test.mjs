// Synthetic deterministic oracle controls; actual native pairs must be authenticated separately.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {assessNativeRepair} from '../lib/server/repair-verdict.mjs';
function args(){
 const radio=key=>({identity_version:2,active:key,active_identity:{available:true,connected:true,node_key:key,is_body:false,id:null,id_unique:null,tag:'input',input_type:'radio',role:'radio',control_identity:{kind:'named-radio/1',name:'seat',value:'Window',unique:true}}});
 const cap=patched=>({source:'nvda',completed:true,outcome:'COMPLETE',reasons:[],records:[{step:'a1',press:'Enter',capture_status:'speech',reasons:[],page:{after:radio(patched?'input#99':'input#3')}},{step:'a2',press:'Enter',capture_status:'speech',reasons:[],page:{before:{state:{dialogs:['dialog#1']}},after:{identity_version:2,active:patched?'choose-seat#2':'body',state:{dialogs:[]},active_identity:patched?{available:true,connected:true,node_key:'choose-seat#2',is_body:false,tag:'button',id:'choose-seat',id_unique:true}:{available:true,connected:true,node_key:'body',is_body:true,tag:'body',id:null}}}}]});
 return {baselineCapture:cap(false),rerunCapture:cap(true),baselineEvidence:{lanes:{speech:[{step:1,text:'Window radio button selected'}]}},rerunEvidence:{lanes:{speech:[{step:1,text:'Window radio button selected'}]}},steps:[{step:1,key:'Enter'},{step:2,key:'Enter'}],oracle:{kind:'focus',step:2}};
}
test('unique recorder-observed radio name/value survives per-session node ordinal changes',()=>{assert.equal(assessNativeRepair(args()).verdict,'FIXED');});
test('different protected radio value is a regression even when its speech matches',()=>{const a=args();a.rerunCapture.records[0].page.after.active_identity.control_identity.value='Aisle';assert.equal(assessNativeRepair(a).verdict,'REGRESSED');});
for(const kind of ['missing','duplicate','detached','wrong-type','fake-key','empty','overbound','duplicate-id'])test('radio identity refuses '+kind,()=>{
 const a=args(),s=a.rerunCapture.records[0].page.after,i=s.active_identity;
 if(kind==='missing')delete i.control_identity;if(kind==='duplicate')i.control_identity.unique=false;if(kind==='detached')i.connected=false;if(kind==='wrong-type')i.input_type='text';if(kind==='fake-key')s.active='input#100';if(kind==='empty')i.control_identity.name='';if(kind==='overbound')i.control_identity.value='x'.repeat(257);if(kind==='duplicate-id'){i.id='duplicate';i.id_unique=false;}
 assert.equal(assessNativeRepair(a).verdict,'INCONCLUSIVE');
});
