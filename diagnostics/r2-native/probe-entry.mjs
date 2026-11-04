// Separate read-only launcher. Does not import native runtime, browser, network or paid clients.
import {spawn} from 'node:child_process';
import {entryContext,diagnosticEnv} from './entry-context.mjs';
import {runReadOnlyProbe} from './probe-runner.mjs';
const context=entryContext('probe');
if(context.packet)console.log(JSON.stringify(context.packet,null,2));
else if(context.mode==='--check-only')console.log('Exact read-only probe approval accepted');
else{
 context.createOutput();
 const cancellation=new AbortController(),cancel=()=>cancellation.abort();
 const signals=['SIGINT','SIGTERM','SIGBREAK'];for(const name of signals)process.once(name,cancel);
 let result;try{result=await runReadOnlyProbe({signal:cancellation.signal,spawn:(file,args,options)=>spawn(file,args,{...options,env:diagnosticEnv(process.env)})});}finally{for(const name of signals)process.removeListener(name,cancel);}
 context.saveResult('probe.json',result);
 // No raw stdout/stderr is forwarded or logged.
 process.exitCode=result.pass===true&&result.cleanup.process_close_observed===true?0:1;
}
