import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,mkdirSync} from 'node:fs';
import {openBroker} from '../src/budget/broker.mjs';
import {respond} from '../src/meta/client.mjs';
import {diagnose} from '../src/meta/diagnosis.mjs';
import {fixtures} from '../packages/contracts/fixtures.mjs';
import {metaDiagnosisSchema} from '../packages/contracts/index.mjs';
function setup(t,data={}){
 mkdirSync('cache/meta-completion-tests',{recursive:true});const dir=mkdtempSync('cache/meta-completion-tests/case-');
 const broker=openBroker({dbPath:dir+'/budget.sqlite',costsPath:dir+'/COSTS.jsonl'});t.after(()=>broker.close());
 const calls=[];const fetchImpl=async(url,req)=>{assert.equal(broker.status().openReservations,1);calls.push(JSON.parse(req.body));return {ok:true,status:200,text:async()=>JSON.stringify({status:'completed',output_text:JSON.stringify(fixtures['diagnosis-output'].valid),usage:{input_tokens:10,output_tokens:20},...data})};};
 return {dir,broker,calls,options:{input:fixtures['diagnosis-input'].valid,broker,apiKey:'offline-key',logDir:dir,fetchImpl}};
}
test('configured diagnosis sends medium/6000 and unchanged strict schema, logs and settles',async t=>{
 const s=setup(t);const r=await diagnose({...s.options,reasoningEffort:'medium',maxOutputTokens:6000,perCallCapUsd:.05});
 assert.deepEqual(s.calls[0].reasoning,{effort:'medium'});assert.equal(s.calls[0].max_output_tokens,6000);
 assert.deepEqual(s.calls[0].text.format.schema,metaDiagnosisSchema);assert.equal(s.calls[0].text.format.strict,true);
 assert.equal(r.output.verdict,'barrier_found');assert.equal(r.provider_status,'completed');assert.equal(s.broker.status().openReservations,0);
 assert.equal(readdirSync(s.dir).filter(f=>f.endsWith('-request.json')).length,1);assert.equal(readdirSync(s.dir).filter(f=>f.endsWith('-response.json')).length,1);
 assert.equal(JSON.parse(readFileSync(s.dir+'/COSTS.jsonl','utf8')).reasoning_effort,'medium');
});
test('default diagnosis retains 3000 and omits reasoning configuration',async t=>{const s=setup(t);await diagnose(s.options);assert.equal(s.calls[0].max_output_tokens,3000);assert.equal(s.calls[0].reasoning,undefined);});
for(const config of [{reasoningEffort:'none'},{reasoningEffort:'invalid'},{reasoningEffort:null},{maxOutputTokens:-1},{maxOutputTokens:0},{maxOutputTokens:1.5},{maxOutputTokens:NaN}])test('invalid diagnosis options refuse before reserve '+JSON.stringify(config),async t=>{
 const s=setup(t);await assert.rejects(()=>diagnose({...s.options,...config}));assert.equal(s.calls.length,0);assert.equal(s.broker.status().openReservations,0);
});
test('direct client refuses unsupported reasoning before transport',async t=>{const s=setup(t);await assert.rejects(()=>respond({...s.options,model:'muse-spark-1.3',maxOutputTokens:50,reasoningEffort:'none'}));assert.equal(s.calls.length,0);assert.equal(s.broker.status().openReservations,0);});
for(const output_text of [JSON.stringify(fixtures['diagnosis-output'].valid),'{"findings":['])test('incomplete response rejects even parseable findings, reports reason and settles known usage '+output_text.length,async t=>{
 const s=setup(t,{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output_text});const r=await diagnose(s.options);
 assert.equal(r.output.verdict,'insufficient_evidence');assert.deepEqual(r.output.findings,[]);assert.equal(r.provider_status,'incomplete');assert.equal(r.incomplete_reason,'max_output_tokens');assert.match(r.validation_errors.join(' '),/incomplete.*max_output_tokens/);
 assert.equal(s.broker.status().openReservations,0);assert.ok(s.broker.status().spentUsd>0);
});
test('complete output with invented citations remains refused',async t=>{const output=structuredClone(fixtures['diagnosis-output'].valid);output.findings[0].evidence_refs=['invented'];const s=setup(t,{output_text:JSON.stringify(output)});const r=await diagnose({...s.options,reasoningEffort:'medium',maxOutputTokens:6000});assert.equal(r.output.verdict,'insufficient_evidence');assert.ok(r.validation_errors.length);});
test('incomplete without usage retains reservation',async t=>{const s=setup(t,{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:null});await assert.rejects(()=>diagnose(s.options),/usage/);assert.equal(s.broker.status().openReservations,1);});
