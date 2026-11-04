import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticErrorChain} from './policy.mjs';
import {readFileSync} from 'node:fs';
test('complete nested and aggregate startup causes remain diagnostic-only and redact credentials',()=>{const inner=Object.assign(Error('relay timed out with token=synthetic-secret'),{code:'ETIMEDOUT'}),middle=Error('NVDA cannot be started',{cause:inner}),outer=new AggregateError([middle],'startup wrapper',{cause:middle});const result=diagnosticErrorChain(outer,{MODEL_API_KEY:'synthetic-secret'});assert.equal(result.truncated,false);assert.equal(result.chain.cause.cause.code,'ETIMEDOUT');assert.match(result.chain.cause.cause.message,/relay timed out/);assert.equal(result.chain.errors[0].omitted,'cycle');assert.doesNotMatch(JSON.stringify(result),/synthetic-secret/);});
test('cycles, getters and bounds cannot break error capture or expose arbitrary fields',()=>{const e=Error('outer');e.cause=e;e.password='private';assert.equal(diagnosticErrorChain(e,{}).chain.cause.omitted,'cycle');assert.doesNotMatch(JSON.stringify(diagnosticErrorChain(e,{})),/private/);const x={get message(){throw Error('getter');}};assert.match(diagnosticErrorChain(x,{}).chain.message,/unreadable/);});
test('hook is observational: original rejection rethrown, no timeout/vendor change',()=>{const code=readFileSync(new URL('../../scripts/tabwise/r2-session.mjs',import.meta.url),'utf8');assert.match(code,/onStartupError/);assert.match(code,/catch\{\}\s*throw error/);const worker=readFileSync(new URL('./run.mjs',import.meta.url),'utf8');assert.match(worker,/startup-errors\.json/);});

import {tamperChecks,indexFiles} from './verify.mjs';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
test('tamper harness selects an existing sealed manifest when startup produced no capture',async()=>{const dir=mkdtempSync(join(tmpdir(),'r2-startup-no-capture-'));try{mkdirSync(join(dir,'source','validation-healthy'),{recursive:true});writeFileSync(join(dir,'source','validation-healthy','manifest.json'),'{}');writeFileSync(join(dir,'report.json'),JSON.stringify({pass:false,classification:'UNTRUSTED_TEST_FIXTURE'}));writeFileSync(join(dir,'index.json'),JSON.stringify(indexFiles(dir)));assert.deepEqual((await tamperChecks(dir)).map(v=>v.type),['changed-source','missing-source','forged-pass']);}finally{rmSync(dir,{recursive:true,force:true});}});
test('credential-shaped fields and oversized errors are omitted or redacted explicitly',()=>{const v=diagnosticErrorChain(Error('Authorization: Basic abc123'),{});assert.doesNotMatch(JSON.stringify(v),/abc123/);const huge=diagnosticErrorChain('x'.repeat(9000),{});assert.equal(huge.truncated,true);});

test('oversize omission is honestly marked incomplete',()=>{assert.equal(diagnosticErrorChain({message:'x'.repeat(1000001)},{}).truncated,true);});
