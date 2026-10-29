import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {checkQualificationApproval,qualificationDigest,QUALIFICATION_FILES} from '../scripts/tabwise/qualification-policy.mjs';

const REVIEW=Object.freeze({reviewer:'Claude (Opus 5.5)',review_ref:'Claude D67 narrow review 2026-10-29T03:29:32Z; sha256=cd4b1dbdad280ddc04d15a80ed801e72424829b20cc2332c36740828badd0231',actor:'ANIRUDDH-001'});
const DISABLED=Object.freeze({enabled:false,verdict:'BLOCK',reviewer:null,review_ref:null,owner_approval_ref:null,actor:null,reviewed_files:Object.freeze([]),reviewed_sha256:null});
function configurationCheck(status,root){
 const head='a'.repeat(40);
 if(status.enabled===false){
  for(const key of Object.keys(DISABLED))assert.deepEqual(status[key],DISABLED[key],key);
 }else{
  assert.equal(status.enabled,true);assert.equal(status.verdict,'PASS');
  for(const [key,value] of Object.entries(REVIEW))assert.equal(status[key],value,key);
  assert.match(status.owner_approval_ref,/^D-[0-9]+$/);assert.deepEqual(status.reviewed_files,QUALIFICATION_FILES);assert.equal(status.reviewed_sha256,qualificationDigest(root));
 }
 const env={GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows',GITHUB_SHA:head,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'ANIRUDDH-001/Tabwise',GITHUB_REF:'refs/heads/main',GITHUB_WORKFLOW_REF:'ANIRUDDH-001/Tabwise/.github/workflows/tabwise-observer.yml@refs/heads/main',GITHUB_ACTOR:status.actor??REVIEW.actor,GITHUB_RUN_ID:'1',GITHUB_RUN_ATTEMPT:'1',RUNNER_TEMP:'synthetic-policy-fixture',TABWISE_QUALIFICATION_ENABLED:'true',TABWISE_OBSERVER_OWNER_APPROVAL:status.owner_approval_ref??'D-999',TABWISE_OBSERVER_APPROVED_REVISION:head};
 assert.equal(checkQualificationApproval({env,head,status,root,platform:'win32'}).ok,status.enabled);
}
test('qualification is disabled until independent content review, exact external revision, actor and explicit owner reference agree',()=>{
 const head='a'.repeat(40),status={enabled:true,verdict:'PASS',reviewer:'independent-test-reviewer',review_ref:'synthetic-offline-review',owner_approval_ref:'D-999',actor:'test-owner',reviewed_files:[...QUALIFICATION_FILES],reviewed_sha256:qualificationDigest()};
 const env={GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows',GITHUB_SHA:head,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'ANIRUDDH-001/Tabwise',GITHUB_REF:'refs/heads/main',GITHUB_WORKFLOW_REF:'ANIRUDDH-001/Tabwise/.github/workflows/tabwise-observer.yml@refs/heads/main',GITHUB_ACTOR:'test-owner',GITHUB_RUN_ID:'1',GITHUB_RUN_ATTEMPT:'1',RUNNER_TEMP:'owned-temp',TABWISE_QUALIFICATION_ENABLED:'true',TABWISE_OBSERVER_OWNER_APPROVAL:'D-999',TABWISE_OBSERVER_APPROVED_REVISION:head};
 assert.equal(checkQualificationApproval({env,head,status,platform:'win32'}).ok,true);
 for(const field of ['TABWISE_QUALIFICATION_ENABLED','TABWISE_OBSERVER_APPROVED_REVISION','TABWISE_OBSERVER_OWNER_APPROVAL','GITHUB_ACTOR'])assert.equal(checkQualificationApproval({env:{...env,[field]:''},head,status,platform:'win32'}).ok,false,field);
 for(const change of [{verdict:'BLOCK'},{enabled:false},{reviewer:null},{review_ref:null},{reviewed_sha256:'0'.repeat(64)},{reviewed_files:[]}])assert.equal(checkQualificationApproval({env,head,status:{...status,...change},platform:'win32'}).ok,false);
 assert.equal(checkQualificationApproval({env:{...env,GITHUB_RUN_ATTEMPT:'2'},head,status,platform:'win32'}).ok,false);
 assert.equal(checkQualificationApproval({env,head,status,platform:'linux'}).ok,false);
});

test('immutable disabled fixture stays fail-closed even with synthetic manual opt-in and revision approval',()=>{
 configurationCheck(DISABLED,process.cwd());assert.equal(Object.isFrozen(DISABLED),true);assert.equal(Object.isFrozen(DISABLED.reviewed_files),true);
});

test('committed configuration is either pristine disabled/BLOCK or exact reviewed activation metadata',()=>{
 configurationCheck(JSON.parse(readFileSync('scripts/tabwise/qualification-status.json','utf8')),process.cwd());
});

test('isolated configurations accept disabled and prepared activation; reject incomplete, mismatched and unreviewed metadata',()=>{
 const root=mkdtempSync(join(tmpdir(),'tw-qual-status-'));try{
  for(const file of QUALIFICATION_FILES){const path=join(root,file);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,readFileSync(file));}
  const path=join(root,'scripts/tabwise/qualification-status.json'),enabled={...REVIEW,enabled:true,verdict:'PASS',owner_approval_ref:'D-999',reviewed_files:[...QUALIFICATION_FILES],reviewed_sha256:qualificationDigest(root)};
  const check=value=>{writeFileSync(path,JSON.stringify(value));configurationCheck(JSON.parse(readFileSync(path,'utf8')),root);};
  check(DISABLED);check(enabled);
  for(const change of [{enabled:null},{verdict:'BLOCK'},{reviewer:null},{reviewer:'unreviewed'},{review_ref:''},{review_ref:'unreviewed'},{owner_approval_ref:null},{owner_approval_ref:'not-a-decision'},{actor:'other-owner'},{reviewed_files:[...QUALIFICATION_FILES].reverse()},{reviewed_files:QUALIFICATION_FILES.slice(1)},{reviewed_sha256:'0'.repeat(64)}])assert.throws(()=>check({...enabled,...change}),JSON.stringify(change));
  assert.throws(()=>check({...DISABLED,verdict:'PASS'}));writeFileSync(path,'{malformed');assert.throws(()=>JSON.parse(readFileSync(path,'utf8')));
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('qualification workflow has one default-disabled manual job, no secrets, pinned actions, and an independent full-worker BLOCK',()=>{
 const workflow=readFileSync('.github/workflows/tabwise-observer.yml','utf8');assert.match(workflow,/workflow_dispatch:/);assert.match(workflow,/default: false/);assert.match(workflow,/TABWISE_OBSERVER_APPROVED_REVISION/);assert.match(workflow,/contents: read/);assert.doesNotMatch(workflow,/secrets\.|id-token:|pull_request_target/);
 for(const match of workflow.matchAll(/uses: ([^\s]+)/g))assert.match(match[1],/@[a-f0-9]{40}$/);
 assert.equal(JSON.parse(readFileSync('scripts/tabwise/review-status.json','utf8')).verdict,'BLOCK');
 const entry=readFileSync('scripts/tabwise-observer.mjs','utf8');assert.doesNotMatch(entry,/^import .*from ['"].*(?:speech|vendor|qualification-core|qualification-loader)/m);assert.ok(entry.indexOf('checkFrozenIntegrity')<entry.indexOf("import('./tabwise/qualification-loader.mjs')"));
});
test('default-disabled executable entry refuses without loading any physical runtime',()=>{
 const child=spawnSync(process.execPath,['scripts/tabwise-observer.mjs','--check-only'],{cwd:process.cwd(),env:{TABWISE_QUALIFICATION_ENABLED:'false',SystemRoot:process.env.SystemRoot},encoding:'utf8'});
 assert.equal(child.status,2);assert.match(child.stderr,/BLOCK: observer qualification disabled by default/);assert.equal(child.stdout,'');
});
test('qualification review digest tolerates only Git CRLF checkout conversion and still detects changed source',()=>{
 const root=mkdtempSync(join(tmpdir(),'tw-qual-review-'));try{
  for(const file of QUALIFICATION_FILES){const path=join(root,file);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,readFileSync(file,'utf8').replace(/\r\n/g,'\n').replace(/\n/g,'\r\n'));}
  assert.equal(qualificationDigest(root),qualificationDigest());
  const path=join(root,QUALIFICATION_FILES[0]);writeFileSync(path,readFileSync(path,'utf8')+'changed');assert.notEqual(qualificationDigest(root),qualificationDigest());
 }finally{rmSync(root,{recursive:true,force:true});}
});
