// Cancellation is installed before every awaited admission/loader boundary.
import {safeDiagnostic,STAGES,CODES} from './startup-diagnostics.mjs';
import {runStartupOnly} from './startup-core.mjs';
export async function runStartupWorker({channel,load,setTimer=setTimeout,clearTimer=clearTimeout}){
 let runtime=null,cancelled=false,rejectAdmission=null,timer,onMessage;
 const cancel=()=>{cancelled=true;runtime?.guard.stop('startup supervisor lost or interrupted','pre');rejectAdmission?.(Error('custody admission cancelled'));};
 const signals=['disconnect','SIGINT','SIGTERM','SIGBREAK'];for(const name of signals)channel.on(name,cancel);
 try{
  if(!channel.connected||typeof channel.send!=='function')throw Error('startup requires supervisor IPC custody');
  await new Promise((resolve,reject)=>{
   rejectAdmission=reject;timer=setTimer(()=>reject(Error('custody admission absent')),10000);
   onMessage=message=>{if(message?.schema==='tabwise-startup-custody-admitted/1'&&Object.keys(message).length===1)resolve();else reject(Error('invalid custody admission'));};
   channel.once('message',onMessage);
  });
  clearTimer(timer);rejectAdmission=null;
  if(cancelled||!channel.connected)throw Error('supervisor lost before runtime');
  try{runtime=await load();}catch{return {schema:'tabwise-startup-only/1',startup_pass:false,production_qualified:false,native_interaction_pass:false,physical_quiescence_verified:false,sends:0,receipt:null,error:'runtime-load-refused',cleanup_error:false,diagnostic:{stage:'runtime-load',code:'operation-failed'},cleanup_diagnostic:{stage:'cleanup',code:'not-attempted'}};}
  const authentic=()=>{if(cancelled||!channel.connected){runtime.guard.stop('startup supervisor lost','pre');throw Error('supervisor lost');}runtime.assertAuthentic();};
  const result=await runStartupOnly({authentic,disarm:()=>runtime.guard.disarm(),status:()=>runtime.guard.status(),start:()=>{authentic();return runtime.nvda.start({capture:false,settings:structuredClone(runtime.cfg.nvda_settings)});},stop:error=>runtime.cleanupStartup?runtime.cleanupStartup(error):runtime.nvda.stop(),diagnostic:error=>{let at=error;for(let n=0;at&&n<8;n++,at=at.cause)if(STAGES.includes(at.r2_stage))return safeDiagnostic({stage:at.r2_stage,code:CODES.includes(at.r2_code)?at.r2_code:'operation-failed'});return runtime.startupDiagnostic?.()??{stage:'nvda-class-start',code:'startup-failed'};}});
  return {...result,observed_process:runtime.observedProcess?.()??null,process_exit:runtime.processExit?.()??null};
 }finally{clearTimer(timer);if(onMessage)channel.removeListener('message',onMessage);for(const name of signals)channel.removeListener(name,cancel);}
}
