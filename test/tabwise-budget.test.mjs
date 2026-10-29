import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {openBroker} from '../src/budget/broker.mjs';

const paths=()=>{const dir=mkdtempSync(join(tmpdir(),'tabwise-money-'));return {dbPath:join(dir,'budget.sqlite'),costsPath:join(dir,'costs.jsonl')};};
const req={model:'muse-spark-1.3',inputTokens:1000,maxOutputTokens:1000};
test('local broker defaults to $60, cannot be raised to combined $100',()=>{
  const p=paths(),b=openBroker(p);assert.equal(b.status().capUsd,60);b.close();
  assert.throws(()=>openBroker({...paths(),capUsd:60.01}),/60/);
});
test('settlement above reservation is rejected and retains full exposure',()=>{
  const p=paths(),b=openBroker(p),r=b.reserve(req);
  assert.throws(()=>b.settle(r.id,{usage:{input_tokens:1001,output_tokens:1000}}),/above reservation/);
  assert.equal(b.status().reservedUsd,r.reservedUsd);assert.equal(b.status().openReservations,1);b.close();
});
test('invalid/unsafe token counts, cached usage and per-call caps are refused',()=>{
  const b=openBroker(paths());
  assert.throws(()=>b.reserve({...req,inputTokens:Number.MAX_SAFE_INTEGER+1}));
  assert.throws(()=>b.reserve({...req,perCallCapUsd:0.001}),/per-call/);
  const r=b.reserve(req);
  assert.throws(()=>b.settle(r.id,{usage:{input_tokens:5,output_tokens:0,cached_tokens:6}}),/cached/);
  assert.throws(()=>b.settle(r.id,{usage:{input_tokens:5,output_tokens:0,cached_tokens:-1}}),/cached/);
  b.close();
});
test('crash, missing usage and retry keep separate reservations',()=>{
  const p=paths();let b=openBroker(p);const a=b.reserve(req);b.close();
  b=openBroker(p);assert.throws(()=>b.settle(a.id,{}),/usage/);
  const retry=b.reserve(req);assert.notEqual(a.id,retry.id);assert.equal(b.status().openReservations,2);b.close();
});
test('50 process reservations serialize near the local ceiling without overshoot',{timeout:30000},async()=>{
  const p=paths(),b=openBroker({...p,capUsd:0.01});b.close();
  const source=`import {openBroker} from ${JSON.stringify(new URL('../src/budget/broker.mjs',import.meta.url).href)};const b=openBroker({...${JSON.stringify(p)},capUsd:0.01});try{b.reserve(${JSON.stringify(req)});process.stdout.write('admitted')}catch(e){if(!/cap/.test(e.message))throw e;process.stdout.write('refused')}finally{b.close()}`;
  const results=await Promise.all(Array.from({length:50},()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',source],{stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('error',reject);child.on('exit',code=>code===0?resolve(out):reject(new Error(err)));})));
  assert.equal(results.filter(x=>x==='admitted').length,1);
  const after=openBroker({...p,capUsd:0.01});assert.ok(after.status().reservedUsd<=0.01);after.close();
});
test('Meta network calls have only the approved client implementation',()=>{
  const source=readFileSync(new URL('../src/meta/client.mjs',import.meta.url),'utf8');
  assert.match(source,/broker.reserve/);assert.match(source,/broker.settle/);
  assert.match(source,/max_output_tokens/);
});
