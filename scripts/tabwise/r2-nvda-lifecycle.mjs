// R2-only lifecycle adaptation of frozen Guidepup 0.36.4 (MIT, Craig Morten).
// No R1 module replacement or global require.cache mutation. Physical quiescence is never inferred here.
import {spawn as spawnProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolveOwner,runBounded,systemExecutable,authenticateOwner} from '../../diagnostics/owner-v2/resolver.mjs';
const identityScript=fileURLToPath(new URL('../../diagnostics/owner-v2/identity.ps1',import.meta.url));
export const executableHash=path=>createHash('sha256').update(path.toLowerCase()).digest('hex');
export async function processIdentity(pid,{deadline,signal}={}){
 if(!Number.isSafeInteger(pid)||pid<1||pid>2147483647)throw Error('process identity PID refused');
 const result=await runBounded({file:systemExecutable('WindowsPowerShell/v1.0/powershell.exe'),args:['-NoProfile','-NonInteractive','-File',identityScript,'-ProcessId',String(pid)],deadline,signal,maxBytes:4096});
 if(!result.ok)throw Error('process identity unavailable: '+result.reason);
 let value;try{value=JSON.parse(result.stdout);}catch{throw Error('process identity malformed');}
 if(value?.pid!==pid||!/^([1-9][0-9]{10,19})$/.test(value.created??'')||!/^[a-f0-9]{64}$/.test(value.path_sha256??'')||Object.keys(value).sort().join()!=='created,path_sha256,pid')throw Error('process identity invalid');
 return Object.freeze(value);
}
export function createLifecycle({gate,executable,configPath,spawn=spawnProcess,running,query=resolveOwner,identify=processIdentity,pathHash=executableHash}){
 let owned=null,expected=null,lastObserved=null,stage='nvda-class-start';
 const active=()=>{if(gate.isStopped())throw Error('NVDA startup cancelled: gate stopped');};
 // Every helper has a bounded deadline and observes sticky gate cancellation, including during OS queries.
 async function operation(fn,deadlineMs,allowStopped=false){
  if(!allowStopped)active();
  deadlineMs=Math.min(deadlineMs,performance.now()+5000);
  const controller=new AbortController(),timer=setInterval(()=>{if(!allowStopped&&gate.isStopped()||performance.now()>=deadlineMs)controller.abort();},10);
  let rejectAbort;const cancelled=new Promise((_,reject)=>{rejectAbort=()=>reject(Error('NVDA query cancelled or timed out; physical quiescence unverified'));controller.signal.addEventListener('abort',rejectAbort,{once:true});});
  try{const value=await Promise.race([fn({deadline:deadlineMs,signal:controller.signal}),cancelled]);if(performance.now()>=deadlineMs)throw Error('NVDA operation deadline exhausted');if(!allowStopped)active();return value;}finally{clearInterval(timer);controller.signal.removeEventListener('abort',rejectAbort);}
 }
 const listeners=(deadlineMs,allowStopped=false)=>operation(async options=>{
  const result=await query({port:6837,...options});
  if(!result.query_completed||!['absent','unique','ambiguous'].includes(result.outcome)||!Array.isArray(result.pids)||!result.measurement?.cleanup?.process_close_observed)throw Error('NVDA listener ownership query incomplete');
  if(result.outcome==='absent'&&result.pids.length||result.outcome==='unique'&&result.pids.length!==1||result.outcome==='ambiguous'&&result.pids.length<2)throw Error('NVDA listener ownership query inconsistent');
  return result;
 },deadlineMs,allowStopped);
 const identity=(pid,deadlineMs,allowStopped=false)=>operation(options=>identify(pid,options),deadlineMs,allowStopped);
 async function relayOwnerPid({deadlineMs=performance.now()+5000,allowStopped=false}={}){
  if(!owned||!expected)throw Error('NVDA owned identity not established');
  if(!owned.isAlive())throw Error('NVDA owned process exited');
  const before=await identity(owned.pid,deadlineMs,allowStopped),result=await listeners(deadlineMs,allowStopped),after=await identity(owned.pid,deadlineMs,allowStopped);
  if(authenticateOwner({pids:result.pids,before,after,expected}).outcome!=='authenticated'||!owned.isAlive())throw Error('NVDA relay/process identity mismatch');
  return owned.pid;
 }
 async function start({timeoutMs=15000,pollMs=100,probeMs=500,deadlineMs}={}){
  stage='installation-path';const path=executable();if(!path)throw Error('NVDA not installed');
  const until=Math.min(deadlineMs??Infinity,performance.now()+timeoutMs);active();
  if(performance.now()>=until)throw Error('NVDA startup deadline exhausted');
  stage='initial-listener-query';if((await listeners(until)).outcome!=='absent')throw Error('NVDA listener already running; reset required');
  stage='spawn';active();const child=spawn(path,['--config-path',configPath()],{stdio:'ignore',windowsHide:true,shell:false});
  let exited=false,closed=false,failed=null;child.on('error',e=>{failed=e;});child.once('exit',()=>{exited=true;});child.once('close',()=>{closed=true;});
  const isAlive=()=>!exited&&!failed&&child.exitCode===null;
  owned={pid:child.pid,process:child,isAlive,isClosed:()=>closed};
  try{
   if(!Number.isSafeInteger(child.pid)||child.pid<=0)throw Error('NVDA process has no PID');
   stage='executable-identity';expected=await identity(child.pid,until);
   if(!expected||expected.pid!==child.pid||expected.path_sha256!==pathHash(path)||!isAlive())throw Object.assign(Error('NVDA spawned executable identity mismatch'),{r2_code:'identity-mismatch'});
   lastObserved=Object.freeze({...expected,source:'Windows process handle, StartTime, MainModule.FileName',physical_quiescence_verified:false});
   stage='readiness-relay';for(;;){
    active();if(!isAlive())throw failed??Error('NVDA process exited before readiness');
    if(performance.now()>=until)throw Error('NVDA readiness timed out');
    if(await running({timeoutMs:Math.max(1,Math.min(probeMs,until-performance.now()))})){
     await relayOwnerPid({deadlineMs:until});return owned;
    }
    await new Promise(resolve=>setTimeout(resolve,Math.min(pollMs,Math.max(1,until-performance.now()))));
   }
  }catch(cause){if(failed)stage='spawn';try{child.kill();}catch{}const error=Error('NVDA cannot be started',{cause});error.ownedProcess=owned;error.r2_stage=stage;if(cause.r2_code==='identity-mismatch')error.r2_code='identity-mismatch';throw error;}
 }
 async function quit(options={}){
  stage=owned?'cleanup':'initial-listener-query';
  const deadlineMs=options.deadlineMs??performance.now()+9000;
  const result=await listeners(deadlineMs,true);
  if(result.outcome!=='absent')await relayOwnerPid({deadlineMs,allowStopped:true});
  // Do not send --quit when the PID was reused, even if the relay disappeared.
  if(owned?.isAlive()){
   const current=await identity(owned.pid,deadlineMs,true);
   if(!expected||authenticateOwner({pids:[owned.pid],before:current,after:current,expected}).outcome!=='authenticated')throw Error('NVDA cleanup identity mismatch');
  }
  if(!owned||!owned.isAlive()){
   if(result.outcome!=='absent')throw Error('foreign NVDA reset refused');
   if(owned&&!owned.isClosed())await new Promise((resolve,reject)=>{const child=owned.process;const closed=()=>{clearTimeout(timer);resolve();};const timer=setTimeout(()=>{child.off('close',closed);reject(Error('NVDA dead child close unconfirmed; containment required'));},Math.max(1,deadlineMs-performance.now()));child.once('close',closed);});
   owned=null;expected=null;return {listener_stopped:true};
  }
  // A global nvda.exe --quit could target a newly arrived foreign instance. Terminate only the
  // original ChildProcess handle after exact identity revalidation; the supervisor reaps descendants.
  const child=owned.process;
  await new Promise((resolve,reject)=>{
   let timer;const finish=error=>{clearTimeout(timer);child.off('close',closed);child.off('error',failed);error?reject(error):resolve();};
   const closed=()=>finish(),failed=error=>finish(error);
   child.once('close',closed);child.once('error',failed);
   timer=setTimeout(()=>finish(Error('NVDA direct child close unconfirmed; containment required')),Math.max(1,deadlineMs-performance.now()));
   try{if(!child.kill())finish(Error('NVDA owned handle termination refused'));}catch(error){finish(error);}
  });
  if((await listeners(deadlineMs,true)).outcome!=='absent')throw Error('NVDA cleanup listener remains');
  owned=null;expected=null;return {listener_stopped:true};
 }
 const tagged=fn=>async(...args)=>{try{return await fn(...args);}catch(error){if(!error.r2_stage)error.r2_stage=stage;throw error;}};
 return Object.freeze({start:tagged(start),relayOwnerPid,quit:tagged(quit),observedProcess:()=>lastObserved,hasOwnedProcess:()=>owned!==null,diagnostic:()=>({stage,code:gate.isStopped()?'cancelled':'operation-failed'})});
}
