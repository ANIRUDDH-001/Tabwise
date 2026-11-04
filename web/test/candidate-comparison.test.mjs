import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as comparison from '../lib/server/candidate-comparison.mjs';
test('comparison refuses missing, foreign or incomplete owned native pairs before storage access',async()=>{
 for(const row of [null,{user_id:'foreign'},{user_id:'owner',state:'RUN_BOUND'},{user_id:'owner',state:'EVIDENCE_READY',repair:null}]){
  await assert.rejects(()=>comparison.compareStoredCandidateRepair({userId:'owner',row,read:()=>{throw Error('must not read');},download:()=>{throw Error('must not download');}}),/owned complete candidate repair/);
 }
});
test('the exact repaired source is mandatory even for a completed candidate row',async()=>{
 const row={user_id:'owner',state:'EVIDENCE_READY',repair:{baseline_run_id:'baseline',source_sha256:'f'.repeat(64)},spec:{app_hash:'f'.repeat(64)}};
 await assert.rejects(()=>comparison.compareStoredCandidateRepair({userId:'owner',row,read:async()=>null,download:()=>{throw Error('must not download');}}));
});
