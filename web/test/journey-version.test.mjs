import {test} from 'node:test';import assert from 'node:assert/strict';
import {ownedJourneyVersion} from '../lib/server/journey-version.mjs';
const row=()=>({id:'00000000-0000-4000-8000-000000000001',user_id:'owner',journey_id:'fernway-seat',n:2,sha256:'a'.repeat(64),steps:[{step:1,key:'Tab',text:null,checkpoint:true}],created_at:'2026-10-29T00:00:00Z'});
test('saved version detail projects the immutable stored version, not the current local draft',()=>{
 const value=ownedJourneyVersion({id:'owner'},{data:row(),error:null});assert.equal(value.n,2);assert.equal(value.sha256,'a'.repeat(64));assert.equal(value.user_id,undefined);assert.equal(value.steps[0].checkpoint,true);
});
test('saved version detail distinguishes outage, missing/foreign record and invalid stored steps',()=>{
 assert.throws(()=>ownedJourneyVersion({id:'owner'},{error:{message:'outage'}}),e=>e.status===503);
 for(const data of [null,{...row(),user_id:'other'}])assert.throws(()=>ownedJourneyVersion({id:'owner'},{data}),e=>e.status===404);
 assert.throws(()=>ownedJourneyVersion({id:'owner'},{data:{...row(),steps:[{step:1,key:'Escape',text:null,checkpoint:true}]}}),e=>e.status===409);
});
