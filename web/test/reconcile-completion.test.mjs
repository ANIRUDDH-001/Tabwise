import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileRun} from '../lib/server/reconcile.mjs';
test('artifact cleanup failure does not invalidate an already ingested complete run',async()=>{
 const transitions=[];
 const api={claim:async()=>true,status:async()=>({status:'completed',conclusion:'success',rate_remaining:5000}),transition:async(...a)=>transitions.push(a),ingest:async()=>({complete:true,artifact_id:'9'}),deleteArtifact:async()=>{throw Error('cleanup unavailable');}};
 const result=await reconcileRun({id:'a',gh_run_id:'1',status:'running',deadline_at:'2099-01-01'},api);
 assert.equal(result.status,'completed');assert.equal(result.artifact_cleanup_pending,true);
 assert.equal(transitions.some(t=>t[2]==='failed'),false);
});
