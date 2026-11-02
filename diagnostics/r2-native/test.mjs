import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {indexFiles,checkIndex,verifyDiagnostic,checkArtifactApproval} from './verify.mjs';
import {checkDiagnosticApproval,packetFor,BRANCH,WORKFLOW,sourceDigest} from './policy.mjs';
import {fileURLToPath} from 'node:url';
const head='a'.repeat(40),digest='b'.repeat(64);
const env={GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows',GITHUB_REPOSITORY:'ANIRUDDH-001/Tabwise',GITHUB_REF:BRANCH,GITHUB_WORKFLOW_REF:`ANIRUDDH-001/Tabwise/${WORKFLOW}@${BRANCH}`,GITHUB_EVENT_NAME:'push',GITHUB_SHA:head,GITHUB_ACTOR:'ANIRUDDH-001',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'2',RUNNER_TEMP:'D:\\temp'};
const approval=packetFor({head,source_digest:digest,run_id:'123',actor:env.GITHUB_ACTOR});
const run=(overrides={})=>checkDiagnosticApproval({env,head,source_digest:digest,approval,platform:'win32',execArgv:[],...overrides});
test('only exact separately approved diagnostic identity is accepted',()=>assert.deepEqual(run(),[]));
test('no approval means no native capability',()=>assert.ok(run({approval:null}).length));
for(const [key,value] of Object.entries({GITHUB_ACTIONS:'false',RUNNER_ENVIRONMENT:'self-hosted',RUNNER_OS:'Linux',GITHUB_REPOSITORY:'other/repo',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_SHA:'c'.repeat(40),GITHUB_ACTOR:'other',GITHUB_RUN_ID:'124',GITHUB_RUN_ATTEMPT:'1',GITHUB_WORKFLOW_REF:'other',RUNNER_TEMP:''}))test('refuses '+key,()=>assert.ok(run({env:{...env,[key]:value}}).length));
for(const change of [{platform:'linux'},{execArgv:['--import=x']},{env:{...env,NODE_OPTIONS:'--require=x'}},{head:'c'.repeat(40)},{source_digest:'d'.repeat(64)},{approval:{...approval,max_ms:180001}},{approval:{...approval,actions:['Tab','Enter']}},{approval:{...approval,extra:true}},{approval:{...approval,run_attempt:3}}])test('refuses changed packet or execution boundary '+JSON.stringify(change),()=>assert.ok(run(change).length));
test('workflow never runs input automatically on first push and separates verifier runner',()=>{
 const text=readFileSync(new URL('../../.github/workflows/tabwise-r2-native-diagnostic.yml',import.meta.url),'utf8');
 assert.match(text,/github\.run_attempt == 2/);assert.match(text,/TABWISE_NATIVE_DIAGNOSTIC_APPROVAL/);
 assert.match(text,/runs-on: windows-2025/);assert.match(text,/runs-on: ubuntu-24\.04/);
 assert.doesNotMatch(text,/id-token: write|attest@|TABWISE_R2_ENABLED:.*true/);
});
test('artifact index accepts original bytes and refuses bit flips, missing and extra source',()=>{
 const dir=mkdtempSync(join(tmpdir(),'r2-diagnostic-index-'));
 try{
  mkdirSync(join(dir,'source'));const path=join(dir,'source','capture.json');writeFileSync(path,'{"raw":[]}');
  writeFileSync(join(dir,'index.json'),JSON.stringify(indexFiles(dir)));assert.equal(Object.keys(checkIndex(dir)).length,1);
  writeFileSync(path,'{"raw":[1]}');assert.throws(()=>checkIndex(dir),/hash\/index/);
  rmSync(path);assert.throws(()=>checkIndex(dir),/hash\/index/);
  writeFileSync(path,'{"raw":[]}');writeFileSync(join(dir,'extra.txt'),'x');assert.throws(()=>checkIndex(dir),/hash\/index/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('a self-consistent hashed report cannot promote itself to qualified native evidence',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'r2-diagnostic-forged-'));
 try{writeFileSync(join(dir,'report.json'),JSON.stringify({classification:'QUALIFIED',w2a_qualified:true,production_qualified:true,pass:true}));writeFileSync(join(dir,'index.json'),JSON.stringify(indexFiles(dir)));await assert.rejects(verifyDiagnostic(dir),/source\/classification/);}
 finally{rmSync(dir,{recursive:true,force:true});}
});
test('artifact approval rejects cross-run reuse and changed actions even with a resealed index',()=>{
 const source_digest=sourceDigest(fileURLToPath(new URL('../../',import.meta.url))),packet=packetFor({head,source_digest,run_id:'123',actor:env.GITHUB_ACTOR});
 assert.doesNotThrow(()=>checkArtifactApproval(packet,env));
 for(const changed of [{...packet,run_id:'124'},{...packet,actions:['Enter']},{...packet,run_attempt:3},{...packet,workflow:'.github/workflows/tabwise-r2.yml'}])assert.throws(()=>checkArtifactApproval(changed,env),/approval\/run/);
});
test('diagnostic delegates process launch, census, grace, cancellation and custody to existing coordinator',()=>{
 const text=readFileSync(new URL('./run.mjs',import.meta.url),'utf8');assert.match(text,/runR2Pages\(\{/);assert.match(text,/if\(!report.preflight.quiescent\)throw/);assert.match(text,/r2RunSealable\(outcome\)/);assert.doesNotMatch(text,/child\.kill\(/);
});
