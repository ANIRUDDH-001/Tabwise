import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {respond} from '../src/meta/client.mjs';
import {metaDiagnosisSchema} from '../packages/contracts/schemas.mjs';
test('Meta structured-output format and bounded request go through async broker before network',async()=>{
 const order=[];let sent;
 const broker={reserve:async()=>{order.push('reserve');return {id:'hosted-id'};},settle:async()=>{order.push('settle');return {settledUsd:0};}};
 const fetchImpl=async(url,request)=>{order.push('send');sent=JSON.parse(request.body);return {ok:true,text:async()=>JSON.stringify({output_text:'{}',usage:{input_tokens:1,output_tokens:1}})};};
 const result=await respond({broker,model:'muse-spark-1.3',input:'synthetic',maxOutputTokens:10,textFormat:{type:'json_schema',name:'tabwise_diagnosis',strict:true,schema:metaDiagnosisSchema},fetchImpl,apiKey:'synthetic-test-key',logDir:mkdtempSync(join(tmpdir(),'tabwise-meta-'))});
 assert.deepEqual(order,['reserve','send','settle']);assert.equal(result.reservationId,'hosted-id');
 assert.deepEqual(sent.text.format.schema,metaDiagnosisSchema);assert.equal(sent.max_output_tokens,10);
});
test('request bytes and output bounds are checked before reservation or send',async()=>{
 let count=0;const broker={reserve:()=>{count++;}};
 await assert.rejects(()=>respond({broker,model:'muse-spark-1.3',input:'x'.repeat(200),maxOutputTokens:1,maxInputBytes:20,apiKey:'synthetic'}),/input.*cap/);
 assert.equal(count,0);
});
