import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileRun} from '../lib/server/reconcile.mjs';
test('read reconciliation stops at terminal state or an existing lease',async()=>{
 let calls=0;const api={claim:async()=>false,find:async()=>calls++};
 assert.equal((await reconcileRun({id:'a',status:'completed'},api)).status,'completed');
 assert.equal((await reconcileRun({id:'a',status:'dispatched',deadline_at:'2099-01-01'},api)).status,'dispatched');assert.equal(calls,0);
});
test('deadline expiration transitions once and requests cancellation without discarding evidence',async()=>{
 const events=[];const api={transition:async(...a)=>events.push(a),cancel:async id=>events.push(['cancel',id])};
 const result=await reconcileRun({id:'a',status:'running',gh_run_id:'1',deadline_at:'2000-01-01'},api);
 assert.equal(result.status,'timed_out');assert.deepEqual(events[0].slice(0,3),['a','running','timed_out']);assert.equal(events[1][0],'cancel');
});
test('an untrusted discovered workflow is rejected before any artifact request',async()=>{
 let artifacts=0;const events=[];
 const api={claim:async()=>true,find:async()=>[{id:1,path:'wrong.yml'}],identity:()=>false,transition:async(...args)=>events.push(args),artifacts:async()=>artifacts++};
 const result=await reconcileRun({id:'a',status:'dispatched',deadline_at:'2099-01-01'},api);
 assert.equal(result.status,'failed');assert.equal(artifacts,0);assert.equal(events[0][3],'worker_identity');
});
