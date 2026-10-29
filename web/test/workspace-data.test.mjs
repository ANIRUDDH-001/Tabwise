import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadOwnedWorkspace} from '../lib/server/workspace-data.mjs';
test('workspace reads bind each collection to the authenticated owner and omit private run payloads',async()=>{
 const calls=[];const view=await loadOwnedWorkspace('owner',async(table,user)=>{calls.push([table,user]);return [{id:table,user_id:user,spec:{private:true},status:'failed',n:1}];});
 assert.deepEqual(calls,[['journey_versions','owner'],['runs','owner']]);assert.equal(view.runs[0].spec,undefined);assert.equal(view.runs[0].user_id,undefined);
});
test('workspace refuses missing identity, foreign rows and read errors',async()=>{
 await assert.rejects(()=>loadOwnedWorkspace('',async()=>[]));
 await assert.rejects(()=>loadOwnedWorkspace('owner',async()=>[{user_id:'other'}]));
 await assert.rejects(()=>loadOwnedWorkspace('owner',async()=>{throw Error('offline read failed');}));
});
