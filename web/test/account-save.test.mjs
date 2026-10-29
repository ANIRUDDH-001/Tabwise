import {test} from 'node:test';
import assert from 'node:assert/strict';
import {saveJourneyToAccount} from '../lib/account-save.mjs';
const journey={version:'0.1.0',journey_id:'fernway-seat',name:'Seat',steps:[{step:1,key:'Tab',text:null,checkpoint:false}]};
test('account save uses existing journey API and confirms the exact submitted digest without dispatch',async()=>{
 const calls=[];const result=await saveJourneyToAccount(journey,async(path,options)=>{calls.push(path);assert.deepEqual(JSON.parse(options.body),journey);const bytes=new TextEncoder().encode(options.body),digest=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');return Response.json({id:'v1',n:1,sha256:digest},{status:201});});assert.equal(result.n,1);assert.deepEqual(calls,['/api/journeys']);
});
test('account save refuses missing sessions, unknown network outcomes and wrong stored hashes',async()=>{
 for(const fetchImpl of [async()=>Response.json({reason:'sign_in_required'},{status:401}),async()=>{throw Error('lost response');},async()=>Response.json({id:'v',n:1,sha256:'0'.repeat(64)},{status:201})])await assert.rejects(()=>saveJourneyToAccount(journey,fetchImpl));
});
