import {test} from 'node:test';import assert from 'node:assert/strict';
import {prepareOwnedCandidateRepair} from '../lib/server/candidate-repair.mjs';
import {OWNER,BASE_SHA,repairContext} from '../../diagnostics/r2-candidate/repair.mjs';
test('reopening an accepted exact repair recovers it before any new candidate allocation',async()=>{
 const {review}=repairContext(),existing={product_run_id:'a0000000-0000-4000-8000-000000000001',journey_version_id:'a0000000-0000-4000-8000-000000000002',user_id:OWNER,state:'EVIDENCE_READY',repair:{baseline_run_id:'baseline',patch_sha256:review.patch_sha256,source_sha256:review.source_sha256,review}};
 const db={rpc:async()=>{throw Error('must not allocate again');},from:()=>{const filters={},b={select:()=>b,eq:(k,v)=>{filters[k]=v;return b;},maybeSingle:async()=>({data:filters.product_run_id==='baseline'?{user_id:OWNER,state:'EVIDENCE_READY',spec:{variant:'broken',app_hash:BASE_SHA},readback:{native_interaction_pass:true}}:existing})};return b;}};
 const result=await prepareOwnedCandidateRepair({db,userId:OWNER,baselineId:'baseline',key:'new-browser-key',sourceRoot:process.cwd(),revision:'a'.repeat(40)});
 assert.equal(result.product_run_id,existing.product_run_id);assert.equal(result.state,'EVIDENCE_READY');
});
