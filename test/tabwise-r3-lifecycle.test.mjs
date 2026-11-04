import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateRepairPacket} from '../scripts/tabwise/repair-session.mjs';
test('native repair delivery refuses missing or forged run/owner/revision/attempt authorization',()=>{
 for(const packet of [null,{}, {schema:'tabwise-r3-native-input/1',owner_id:'foreign'}])assert.throws(()=>validateRepairPacket({packet,head:'a'.repeat(40),env:{GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'123'}}));
});
import {recomputeStoredRepair} from '../web/lib/server/repair-verdict.mjs';
test('verdict ingestion never accepts labels or predictions in place of native evidence',async()=>{
 await assert.rejects(()=>recomputeStoredRepair({userId:'owner',run:{qualified:true},bundle:{},finding:{kind:'validation'},download:async()=>{throw Error('must not fetch');}}));
});
import {assessNativeRepair} from '../web/lib/server/repair-verdict.mjs';
// Pure synthetic oracle fixtures; these never mint qualified native evidence.
test('sealed snapshot oracle uses final focus, not an earlier focusin, and refuses absent triggers',()=>{
 const cap=active=>({source:'nvda',completed:true,outcome:'COMPLETE',reasons:[],records:[{step:'a1',press:'Enter',capture_status:'observed-silence',reasons:[],page:{before:{state:{dialogs:['dialog#1']}},after:{identity_version:2,active_identity:{available:true,connected:true,node_key:active,is_body:active==='body',tag:active==='body'?'body':'button',id:active==='body'?null:'choose-seat',id_unique:active==='body'?null:true},active,state:{dialogs:[]}}}}]});
 const args={baselineCapture:cap('body'),rerunCapture:cap('choose-seat#1'),baselineEvidence:{lanes:{speech:[]}},rerunEvidence:{lanes:{speech:[]}},steps:[{step:1,key:'Enter'}],oracle:{kind:'focus',step:1}};
 assert.equal(assessNativeRepair(args).verdict,'FIXED');
 args.rerunCapture.records[0].page.after=cap('body').records[0].page.after;assert.equal(assessNativeRepair(args).verdict,'NOT_FIXED');
 args.rerunCapture.completed=false;assert.equal(assessNativeRepair(args).verdict,'INCONCLUSIVE');
 args.rerunCapture=cap('choose-seat#1');args.oracle.kind='validation';assert.equal(assessNativeRepair(args).verdict,'INCONCLUSIVE');
 args.oracle.kind='focus';args.baselineCapture.records[0].page.before.state.dialogs=[];assert.equal(assessNativeRepair(args).verdict,'INCONCLUSIVE');
});
import {prepareOracleRegistration} from '../src/repair/oracle.mjs';
test('owner must explicitly freeze a source-bound check before rerun admission',()=>{
 const a={userId:'owner',run:{id:'base',user_id:'owner',status:'completed',evidence_status:'complete',spec:{app_hash:'a'.repeat(64)}},patch:{id:'patch',run_id:'base',status:'approved',reviewed_by:'owner',diff:'diff'},finding:{step:2},input:{kind:'focus',step:2,review_ref:'Owner baseline review',base_sha256:'a'.repeat(64),patch_sha256:sha256('diff')}};
 const out=prepareOracleRegistration(a);assert.equal(out.p_step,2);assert.equal(out.p_user,'owner');
 for(const change of [a=>a.userId='foreign',a=>a.input.patch_sha256='b'.repeat(64),a=>a.input.base_sha256='c'.repeat(64),a=>a.input.step=3,a=>a.input.review_ref='',a=>a.patch.status='proposed',a=>a.input.kind='prediction',a=>a.input.approved=true]){const b=structuredClone(a);change(b);assert.throws(()=>prepareOracleRegistration(b));}
});
import {sha256} from '../packages/contracts/index.mjs';
