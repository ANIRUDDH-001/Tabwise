import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,readFileSync,readdirSync,mkdirSync} from 'node:fs';
import {respond} from '../src/meta/client.mjs';import {openBroker} from '../src/budget/broker.mjs';
for(const [code,kind] of [['ENOTFOUND','dns'],['CERT_HAS_EXPIRED','tls'],['UND_ERR_CONNECT_TIMEOUT','connect-timeout'],['ECONNRESET','socket']])test('safe nested transport diagnosis '+code,async t=>{
 mkdirSync('cache/meta-transport-tests',{recursive:true});const dir=mkdtempSync('cache/meta-transport-tests/run-'),key='secret-key-for-test';
 const broker=openBroker({dbPath:dir+'/budget.sqlite',costsPath:dir+'/COSTS.jsonl'});t.after(()=>broker.close());
 let calls=0;const nested=Object.assign(new Error('Cookie: private-cookie; Bearer '+key),{code,syscall:'connect'});const error=new TypeError('fetch failed',{cause:new AggregateError([nested],'untrusted '+key)});
 await assert.rejects(()=>respond({broker,model:'muse-spark-1.3',input:'owned fixture',maxOutputTokens:50,apiKey:key,baseUrl:'https://user:password@api.meta.ai/v1?secret=private',logDir:dir,fetchImpl:async()=>{calls++;throw error;}}),e=>{
  assert.equal(e.transport.classification,kind);assert.equal(e.transport.endpoint,'https://api.meta.ai/v1');assert.ok(e.transport.elapsed_ms>=0);assert.equal(e.transport.causes[0].cause.errors[0].code,code);assert.equal(e.transport.causes[0].cause.errors[0].syscall,'connect');return true;
 });
 assert.equal(calls,1);assert.equal(broker.status().openReservations,1);const files=readdirSync(dir).filter(f=>f.endsWith('-error.json'));assert.equal(files.length,1);const logged=readFileSync(dir+'/'+files[0],'utf8');for(const secret of [key,'password','private-cookie','secret=private'])assert(!logged.includes(secret));
});
