import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openBroker} from '../src/budget/broker.mjs';
test('an above-reservation settlement persists an alarm that blocks later local calls',()=>{
 const dir=mkdtempSync(join(tmpdir(),'tabwise-alarm-'));const paths={dbPath:join(dir,'money.sqlite'),costsPath:join(dir,'costs.jsonl')};
 const request={model:'muse-spark-1.3',inputTokens:1,maxOutputTokens:1};let broker=openBroker(paths);const r=broker.reserve(request);
 assert.throws(()=>broker.settle(r.id,{usage:{input_tokens:100,output_tokens:100}}),/above reservation/);broker.close();
 broker=openBroker(paths);assert.throws(()=>broker.reserve(request),/alarm/);assert.equal(broker.status().openReservations,1);broker.close();
});
