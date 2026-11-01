import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {r1View,R1_PASS_LEDGER,R1_PASS_PENDING} from '../lib/r1-evidence.mjs';
const r1=JSON.parse(readFileSync(new URL('../data/r1.json',import.meta.url),'utf8'));
test('the displayed R1 run id and outcome come from its own data file and stay labelled failed',()=>{
 const v=r1View(r1);assert.equal(v.run_id,r1.run_id);assert.equal(v.result,'FAIL');assert.match(v.label,/Failed/);assert.equal(v.tone,'failed');
 assert.match(v.scope,/does not prove R2 causal diagnosis, Fernway findings, Spark output or patch verification/);
});
test('the PASS run cannot be presented without a validated data file',()=>{
 assert.equal(R1_PASS_LEDGER.validated,false);assert.equal(existsSync(new URL('../data/r1-pass.json',import.meta.url)),false);
 assert.equal(r1View(r1).passNotice,R1_PASS_PENDING);
 assert.equal(r1View(r1,{validated:false,result:'PASS'}).passNotice,R1_PASS_PENDING);
 assert.notEqual(r1.run_id,R1_PASS_LEDGER.run_id);
});
test('limitation statement is present on homepage, demo, trace and report sources',()=>{
 for(const file of ['app/page.tsx','app/w/demo/page.tsx','components/RunDetail.tsx','app/r/[slug]/page.tsx']){const src=readFileSync(new URL(`../${file}`,import.meta.url),'utf8');assert.match(src,/R1ScopeNote|r1View/,file);}
});
