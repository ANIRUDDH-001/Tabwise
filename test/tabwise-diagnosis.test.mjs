import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {diagnose} from '../src/meta/diagnosis.mjs';
import {fixtures} from '../packages/contracts/fixtures.mjs';
test('diagnosis uses real Spark client path, fake transport only in tests, and validates references',async()=>{
 const order=[];const broker={reserve:async()=>{order.push('reserve');return {id:'test-reservation'};},settle:async()=>{order.push('settle');return {settledUsd:0};}};
 const output=structuredClone(fixtures['diagnosis-output'].valid);
 const options={input:fixtures['diagnosis-input'].valid,broker,apiKey:'synthetic-key',logDir:mkdtempSync(join(tmpdir(),'diagnosis-')),fetchImpl:async(url,req)=>{order.push('send');const body=JSON.parse(req.body);assert.equal(body.model,'muse-spark-1.3');assert.equal(body.text.format.strict,true);assert.equal(body.tools,undefined);return {ok:true,text:async()=>JSON.stringify({output_text:JSON.stringify(output),usage:{input_tokens:1,output_tokens:1}})};}};
 const result=await diagnose(options);assert.equal(result.output.verdict,'barrier_found');assert.deepEqual(order,['reserve','send','settle']);assert.ok(result.input_sha256);assert.ok(result.prompt_sha256);
 output.findings[0].evidence_refs=['invented'];
 const abstention=await diagnose(options);assert.equal(abstention.output.verdict,'insufficient_evidence');assert.ok(abstention.validation_errors.length);
});
test('invalid input refuses before reserving',async()=>{
 let reserved=false;await assert.rejects(()=>diagnose({input:{},broker:{reserve:()=>{reserved=true;}}}));assert.equal(reserved,false);
});
