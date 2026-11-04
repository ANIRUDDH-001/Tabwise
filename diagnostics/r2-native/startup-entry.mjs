// Distinct lifecycle entrypoint; no journey code or physical-input calls.
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {entryContext,diagnosticEnv} from './entry-context.mjs';
import {sourceDigest} from './policy.mjs';
const context=entryContext('startup');
if(context.packet)console.log(JSON.stringify(context.packet,null,2));
else if(context.mode==='--check-only')console.log('Exact startup-only approval accepted');
else if(context.mode==='--worker'){
 const digest=sourceDigest(context.root);
 const {runStartupWorker}=await import('./startup-worker.mjs');
 try{
  const result=await runStartupWorker({channel:process,load:async()=>{
   const {loadR2Runtime}=await import('../../scripts/tabwise/r2-loader.mjs');
   return loadR2Runtime({root:context.root,additionalIntegrity:()=>sourceDigest(context.root)===digest?[]:['startup source changed']});
  }});
  console.log(JSON.stringify(result));process.exitCode=result.startup_pass?0:1;
 }finally{if(process.connected)process.disconnect();}
}else{
 context.createOutput();
 const {windowsProcessTools}=await import('../../scripts/tabwise/r2-proctree.mjs');
 const {superviseStartup}=await import('./startup-supervisor.mjs');
 const env=diagnosticEnv(process.env);
 for(const [key,value] of Object.entries(process.env))if(/^(GITHUB_(SHA|WORKFLOW_SHA|REPOSITORY|REF|WORKFLOW_REF|EVENT_NAME|RUN_ID|RUN_ATTEMPT|ACTOR|TRIGGERING_ACTOR|ACTIONS)|RUNNER_(ENVIRONMENT|OS|TEMP)|TABWISE_STARTUP_ONLY_APPROVAL)$/.test(key))env[key]=value;
 const cancellation=new AbortController(),cancel=()=>cancellation.abort();
 for(const signal of ['SIGINT','SIGTERM','SIGBREAK'])process.on(signal,cancel);
 try{
  const report=await superviseStartup({tools:windowsProcessTools({spawn,env:diagnosticEnv(process.env)}),signal:cancellation.signal,protect:[process.pid,process.ppid],launch:()=>spawn(process.execPath,[join(context.root,'diagnostics/r2-native/startup-entry.mjs'),'--worker'],{cwd:context.root,env,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe','ipc']})});
  context.saveResult('startup.json',report);process.exitCode=report.startup_pass?0:1;
 }finally{for(const signal of ['SIGINT','SIGTERM','SIGBREAK'])process.off(signal,cancel);}
}
