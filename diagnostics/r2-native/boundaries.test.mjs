import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,mkdirSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {boundaryPacket,checkBoundary,BOUNDARIES} from './boundary-policy.mjs';
import {runStartupOnly} from './startup-core.mjs';
import {sendGate} from '../../src/speech/sendguard.mjs';
import {EventEmitter} from 'node:events';
import {runStartupWorker} from './startup-worker.mjs';
import {runReadOnlyProbe} from './probe-runner.mjs';
import {PassThrough} from 'node:stream';
import {diagnosticEnv,preExecutionIntegrity,boundaryFiles} from './entry-context.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
for(const mode of ['probe','startup'])test(`${mode}: exact authorization; reject every changed binding before capability loading`,()=>{
 const revision='a'.repeat(40),run='123',packet=boundaryPacket({root,revision,run,mode});
 const env={GITHUB_SHA:revision,GITHUB_WORKFLOW_SHA:revision,GITHUB_REPOSITORY:packet.repository,GITHUB_REF:packet.ref,GITHUB_WORKFLOW_REF:`${packet.repository}/${packet.workflow}@${packet.ref}`,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ID:run,GITHUB_RUN_ATTEMPT:'2',GITHUB_ACTOR:packet.actor,GITHUB_TRIGGERING_ACTOR:packet.actor,GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows',RUNNER_TEMP:'C:/runner-temp'};
 const input={root,mode,revision,env,approval:packet,platform:'win32',execArgv:[],clean:true};
 assert.deepEqual(checkBoundary(input),[]);
 for(const key of Object.keys(packet)){const altered={...packet,[key]:null};assert.ok(checkBoundary({...input,approval:altered}).length,key);}
 for(const key of Object.keys(env))assert.ok(checkBoundary({...input,env:{...env,[key]:'wrong'}}).length,key);
 for(const change of [{clean:false},{platform:'linux'},{execArgv:['--inspect']},{approval:null},{env:{...env,NODE_OPTIONS:'--require evil'}},{env:{...env,NODE_PATH:'evil'}}])assert.ok(checkBoundary({...input,...change}).length);
 assert.ok(checkBoundary({...input,mode:mode==='probe'?'startup':'probe'}).length);
 assert.throws(()=>boundaryPacket({root,revision,run:'future',mode}));
});
test('startup lifecycle uses real unarmed guard; successful matching receipt still never sends',async()=>{
 const guard=sendGate(),calls=[];
 const result=await runStartupOnly({disarm:()=>guard.disarm(),status:()=>guard.status(),authentic:()=>{},start:async()=>{calls.push('start');return {pid:11,relay_pid:11,reset_confirmed:true};},stop:async()=>{calls.push('stop');}});
 assert.equal(result.startup_pass,true);assert.equal(result.native_interaction_pass,false);assert.equal(result.production_qualified,false);assert.equal(result.sends,0);assert.deepEqual(calls,['start','stop']);assert.equal(guard.status().sends,0);
});
for(const kind of ['start','owner','integrity','cleanup','stray'])test(`startup ${kind} failure is sticky and cleanup still attempted`,async()=>{
 const guard=sendGate();let stops=0,checks=0;
 const result=await runStartupOnly({disarm:()=>guard.disarm(),status:()=>guard.status(),authentic:()=>{checks++;if(kind==='integrity'&&checks>1)throw Error('SECRET');},start:async()=>{
  if(kind==='start')throw Error('SECRET');if(kind==='stray')await guard.admit({path:'sendkeys',char:'a'});
  return {pid:11,relay_pid:kind==='owner'?12:11,reset_confirmed:true};},stop:async()=>{stops++;if(kind==='cleanup')throw Error('SECRET');}});
 assert.equal(stops,1);assert.equal(result.startup_pass,false);assert.equal(result.sends,0);assert.doesNotMatch(JSON.stringify(result),/SECRET/);
});
test('inventories include every executable diagnostic and distinct workflow; no worker action entry imports',async()=>{
 const {SOURCE_FILES}=await import('./policy.mjs');
 for(const file of readdirSync(new URL('./',import.meta.url)).filter(p=>/\.(mjs|ps1)$/.test(p)))assert.ok(SOURCE_FILES.includes('diagnostics/r2-native/'+file),file);
 for(const policy of Object.values(BOUNDARIES))assert.ok(SOURCE_FILES.includes(policy.workflow));
 for(const f of ['startup-core.mjs','startup-entry.mjs']){
  const code=readFileSync(new URL(f,import.meta.url),'utf8');assert.doesNotMatch(code,/\.arm\s*\(|\.press\s*\(|\.type\s*\(|r2-session|r2-compose|executor|sendKeyCode/);
 }
 const probe=readFileSync(new URL('./probe-entry.mjs',import.meta.url),'utf8');assert.doesNotMatch(probe,/qualification-loader|startup-entry|runR2Pages|fetch\(|https?:/);
});
test('supervisor disconnect during loader prevents native start and preserves cleanup',async()=>{
 const channel=Object.assign(new EventEmitter(),{connected:true,send(){}}),guard=sendGate();let starts=0,stops=0;
 const result=runStartupWorker({channel,load:async()=>{channel.connected=false;channel.emit('disconnect');return {guard,assertAuthentic(){},cfg:{nvda_settings:{}},nvda:{start:async()=>{starts++;},stop:async()=>{stops++;}}};}});
 channel.emit('message',{schema:'tabwise-startup-custody-admitted/1'});
 const value=await result;assert.equal(starts,0);assert.equal(stops,1);assert.equal(value.startup_pass,false);assert.equal(guard.isStopped(),true);assert.equal(channel.listenerCount('disconnect'),0);
});
test('worker refuses absent IPC before loading any native capability',async()=>{
 let loads=0;await assert.rejects(runStartupWorker({channel:Object.assign(new EventEmitter(),{connected:false}),load:()=>{loads++;}}));assert.equal(loads,0);
});
test('probe budget includes synchronous launch delay; inherited secrets never reach PowerShell',async()=>{
 let time=0;const timers=[],child=Object.assign(new EventEmitter(),{pid:1,stdout:new PassThrough(),stderr:new PassThrough(),kill(){}});
 const promise=runReadOnlyProbe({spawn:()=>{time=28000;return child;},now:()=>time,setTimer:(fn,ms)=>{timers.push({fn,ms});return 1;},clearTimer:()=>{}});
 assert.equal(timers[0].ms,1);timers[0].fn();timers.at(-1).fn();await promise;
 const env=diagnosticEnv({PATH:'safe',SYSTEMROOT:'C:/Windows',PROCESSOR_ARCHITECTURE:'AMD64',PROCESSOR_ARCHITEW6432:'AMD64',META_API_KEY:'SECRET',GITHUB_TOKEN:'SECRET',NODE_OPTIONS:'evil',PSModulePath:'evil'});
 assert.deepEqual({...env},{PATH:'safe',SYSTEMROOT:'C:/Windows',PROCESSOR_ARCHITECTURE:'AMD64',PROCESSOR_ARCHITEW6432:'AMD64'});
});
test('workflows remain manual, first attempt offline, separately approved and free of interpolated commands',()=>{
 for(const {workflow,variable} of Object.values(BOUNDARIES)){
  const code=readFileSync(new URL('../../'+workflow,import.meta.url),'utf8');assert.match(code,/workflow_dispatch:/);assert.doesNotMatch(code,/\n  push:|\n  pull_request:|secrets\./);
  assert.ok(code.includes('github.run_attempt == 2 && vars.'+variable));assert.ok(code.includes('startup-supervisor.test.mjs'));
  assert.doesNotMatch(code,/run:.*\$\{\{/);assert.match(code,/persist-credentials: false/);
 }
 const probe=readFileSync(new URL('../../'+BOUNDARIES.probe.workflow,import.meta.url),'utf8');assert.doesNotMatch(probe,/npm ci|guidepup|install nvda|startup-entry|playwright/);
});
test('fresh checkout probe and pre-setup gates require no installed packages; native execution still does',()=>{
 const scratch=mkdtempSync(join(tmpdir(),'tabwise-source-only-'));
 try{
  for(const path of ['ci/r1-baseline.sha256','.github/workflows/r1.yml','scripts/r1.mjs','package-lock.json']){mkdirSync(dirname(join(scratch,path)),{recursive:true});copyFileSync(join(root,path),join(scratch,path));}
  assert.equal(preExecutionIntegrity(scratch,'probe','--run').ok,true);
  assert.equal(preExecutionIntegrity(scratch,'startup','--check-only').ok,true);
  assert.equal(preExecutionIntegrity(scratch,'startup','--run').ok,false);
 }finally{rmSync(scratch,{recursive:true,force:true});}
});
test('artifact cap includes the serialized index and exclusive file set',()=>{
 const small=boundaryFiles('probe.json',{pass:false},{});assert.ok(small['index.json']);
 const result={padding:'x'.repeat(130900)};
 assert.throws(()=>boundaryFiles('probe.json',result,{}),/artifact cap/);
 assert.throws(()=>boundaryFiles('../outside',{},{}));
});
