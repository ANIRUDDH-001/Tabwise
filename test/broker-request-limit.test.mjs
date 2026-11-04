import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openBroker} from '../src/budget/broker.mjs';
const call={model:'muse-spark-1.3',inputTokens:10,maxOutputTokens:20,runId:'test-only',task:'completion-validation'};
function fixture(){const dir=mkdtempSync(join(tmpdir(),'tw-request-limit-'));return {dbPath:join(dir,'budget.sqlite'),costsPath:join(dir,'costs.jsonl')};}
test('request ceiling counts uncertain requests and survives reopening without options',()=>{
 const f=fixture();let b=openBroker({...f,requestBudget:{id:'test-completion',maxRequests:2}});
 b.reserve(call);b.close();b=openBroker(f);b.reserve(call);
 assert.throws(()=>b.reserve(call),/request.*limit|request.*ceiling/i);b.close();
});
test('settling a free response does not release its request slot',()=>{
 const f=fixture(),b=openBroker({...f,requestBudget:{id:'test-completion',maxRequests:1}}),r=b.reserve(call);
 b.settle(r.id,{usage:{input_tokens:0,output_tokens:0}});
 assert.throws(()=>b.reserve(call),/request.*limit|request.*ceiling/i);b.close();
});
test('deleting only the database cannot reset the request ledger',()=>{
 const f=fixture();let b=openBroker({...f,requestBudget:{id:'test-completion',maxRequests:1}});b.reserve(call);b.close();rmSync(f.dbPath);
 b=openBroker({...f,requestBudget:{id:'test-completion',maxRequests:1}});
 assert.throws(()=>b.reserve(call),/request.*limit|request.*ceiling/i);b.close();
});
test('existing request budget cannot be raised or replaced by reopening',()=>{
 const f=fixture(),b=openBroker({...f,requestBudget:{id:'test-completion',maxRequests:1}});b.close();
 assert.throws(()=>openBroker({...f,requestBudget:{id:'test-completion',maxRequests:2}}),/request.*budget/i);
 assert.throws(()=>openBroker({...f,requestBudget:{id:'new-campaign',maxRequests:1}}),/request.*budget/i);
});
test('reservation is durably counted before transport even when no settlement exists',()=>{
 const f=fixture(),b=openBroker({...f,requestBudget:{id:'test-completion',maxRequests:20}});b.reserve(call);b.close();
 const rows=readFileSync(f.costsPath,'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(rows[0].request_budget.id,'test-completion');assert.equal(rows[0].request_budget.sequence,1);
 assert.equal(rows[0].request_budget.max_requests,20);assert.equal(rows[0].verdict,'reserved');
 assert.equal(rows[0].experiment,call.task);assert.equal(rows[0].run_id,call.runId);
 assert.deepEqual(rows[0].requested_tokens,{input:10,output:20,images:0});
});
test('invalid request limits fail before opening a broker',()=>{
 for(const maxRequests of [0,-1,1.5,Infinity])assert.throws(()=>openBroker({...fixture(),requestBudget:{id:'test',maxRequests}}),/request.*budget/i);
});
