import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {publicText} from '../../scripts/tabwise/r2-admission.mjs';import * as stores from './store.mjs';
test('candidate W5 consumption is durable across reopen and mismatched consumers never acquire it',async()=>{
 assert.equal(typeof stores.openCandidateStore,'function','durable candidate W5 adapter missing');
 const dir=mkdtempSync(join(tmpdir(),'tw-candidate-store-')),binding={expires_at:new Date(Date.now()+60000).toISOString()},consumer={run_id:'123',attempt:2},id='candidate-'+randomUUID(),q={id,binding,consumer,coordinator_key:publicText(generateKeyPairSync('ed25519').publicKey)};
 try{let s=stores.openCandidateStore({path:join(dir,'w5.sqlite'),id,binding,consumer});const first=await s.rpc('consume',q);assert.equal(first.fresh,true);s.close();s=stores.openCandidateStore({path:join(dir,'w5.sqlite'),id,binding,consumer});try{const repeated=await s.rpc('consume',{...q,coordinator_key:publicText(generateKeyPairSync('ed25519').publicKey)});assert.equal(repeated.fresh,false);assert.deepEqual(repeated.receipt,first.receipt);await assert.rejects(()=>s.rpc('consume',{...q,consumer:{run_id:'124',attempt:2}}));assert.deepEqual((await s.rpc('read',q)).receipt,first.receipt);}finally{s.close();}}finally{rmSync(dir,{recursive:true,force:true});}
});
