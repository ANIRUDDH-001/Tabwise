import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadOwnedWorkspace} from '../lib/server/workspace-data.mjs';
import {workspaceSummary} from '../lib/workspace-state.mjs';
test('workspace includes retained diagnostic reports only after owner validation',async()=>{
 const reads=[];
 const data=await loadOwnedWorkspace('owner',async table=>table==='runs'?[{id:'failed-run',user_id:'owner',status:'failed',evidence_status:'incomplete'},{id:'empty-run',user_id:'owner',status:'failed',evidence_status:'incomplete'}]:[],async id=>{reads.push(id);return id==='failed-run';});
 assert.deepEqual(reads,['failed-run','empty-run']);
 assert.deepEqual(workspaceSummary(data).reports.map(r=>r.id),['failed-run']);
});
test('foreign run rows never reach diagnostic lookup',async()=>{
 let reads=0;
 await assert.rejects(()=>loadOwnedWorkspace('owner',async()=>[{id:'foreign',user_id:'other'}],async()=>{reads++;return true;}));
 assert.equal(reads,0);
});
test('diagnostic lookup failures cannot silently become an empty report list',async()=>{
 await assert.rejects(()=>loadOwnedWorkspace('owner',async table=>table==='runs'?[{id:'r',user_id:'owner'}]:[],async()=>{throw Error('unavailable');}));
});
