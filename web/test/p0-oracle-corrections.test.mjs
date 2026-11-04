import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessNativeRepair} from '../lib/server/repair-verdict.mjs';
const identity=(active)=>({available:true,connected:true,is_body:active==='body',tag:active==='body'?'body':'button',id:active==='body'?null:'choose-seat',id_unique:active==='body'?null:true,node_key:active});
function args(){const cap=active=>({source:'nvda',completed:true,outcome:'COMPLETE',reasons:[],records:[{step:'a1',press:'Enter',capture_status:'observed-silence',reasons:[],page:{before:{state:{dialogs:['dialog#1']}},after:{identity_version:2,active_identity:identity(active),active,state:{dialogs:[]}}}}]});return {baselineCapture:cap('body'),rerunCapture:cap('choose-seat#2'),baselineEvidence:{lanes:{speech:[]}},rerunEvidence:{lanes:{speech:[]}},steps:[{step:1,key:'Enter'}],oracle:{kind:'focus',step:1}};}
test('unambiguous synthetic v2 oracle controls: correct, wrong, and transient restoration',()=>{
 const a=args();assert.equal(assessNativeRepair(a).verdict,'FIXED');
 a.rerunCapture.records[0].page.events=[{type:'focusin',target:'choose-seat#2'}];
 a.rerunCapture.records[0].page.after={identity_version:2,active:'body',active_identity:identity('body'),state:{dialogs:[]}};
 assert.equal(assessNativeRepair(a).verdict,'NOT_FIXED');
});
for(const side of ['baselineCapture','rerunCapture'])for(const mutation of ['legacy','missing','detached','contradictory','radio','spoofed-id'])test(`${side} ${mutation} cannot certify FIXED`,()=>{
 const a=args(),p=a[side].records[0].page.after;
 if(mutation==='legacy'){delete p.identity_version;delete p.active_identity;}
 if(mutation==='missing')delete p.active_identity;
 if(mutation==='detached')p.active_identity.connected=false;
 if(mutation==='contradictory')p.active_identity.node_key='other#9';
 if(mutation==='radio'){p.active_identity.tag='input';p.active_identity.input_type='radio';p.active_identity.is_body=false;}
 if(mutation==='spoofed-id'){p.active_identity.id='other';p.active_identity.tag='input';}
 assert.equal(assessNativeRepair(a).verdict,'INCONCLUSIVE');
});
