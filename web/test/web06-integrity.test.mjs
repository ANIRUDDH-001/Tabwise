import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sha256} from '../../packages/contracts/index.mjs';
import {validatePassSnapshot} from '../lib/r1-pass.mjs';
import {saveJourneyToAccount} from '../lib/account-save.mjs';
const original=JSON.parse(readFileSync(new URL('../data/r1-pass.json',import.meta.url),'utf8'));
function edited(edit){const value=structuredClone(original);edit(value);const {snapshot_sha256,...body}=value;value.snapshot_sha256=sha256(JSON.stringify(body));return value;}
test('PASS anchoring refuses changed keys, step numbers and redistributed speech even after resealing',()=>{
 for(const edit of [s=>{s.attempts[0].steps[0].keys=['Escape'];},s=>{s.attempts[0].steps[0].step=99;},s=>{s.attempts[0].steps[1].phrases.unshift(...s.attempts[0].steps[0].phrases);s.attempts[0].steps[0].phrases=[];}])assert.equal(validatePassSnapshot(edited(edit)).ok,false);
});
test('PASS rejects unexpected nested fields and invented model costs or profile metadata',()=>{
 for(const edit of [s=>{s.attempts[0].steps[0].private_metadata={machine:'private'};},s=>{s.attempts[0].private_metadata='private';},s=>{s.model_provenance.private_metadata='private';},s=>{s.model_provenance.cost=99;},s=>{s.profile='default';},s=>{s.limitations=['81 of 171'];}])assert.equal(validatePassSnapshot(edited(edit)).ok,false);
});
test('malformed success responses produce safe unconfirmed account-save feedback',async()=>{
 const journey={version:'0.1.0',journey_id:'fernway-seat',name:'Seat',steps:[]};
 for(const response of [new Response('{private-backend-detail',{status:201}),Response.json(null,{status:201})])await assert.rejects(()=>saveJourneyToAccount(journey,async()=>response),error=>error.kind==='unconfirmed'&&!error.message.includes('private-backend-detail'));
});
