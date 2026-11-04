// Cancellation is installed before every awaited admission/loader boundary.
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
  runtime=await load();
  const authentic=()=>{if(cancelled||!channel.connected){runtime.guard.stop('startup supervisor lost','pre');throw Error('supervisor lost');}runtime.assertAuthentic();};
  const result=await runStartupOnly({authentic,disarm:()=>runtime.guard.disarm(),status:()=>runtime.guard.status(),start:()=>{authentic();return runtime.nvda.start({capture:false,settings:structuredClone(runtime.cfg.nvda_settings)});},stop:()=>runtime.nvda.stop()});
  return {...result,observed_process:runtime.observedProcess?.()??null};
 }finally{clearTimer(timer);if(onMessage)channel.removeListener('message',onMessage);for(const name of signals)channel.removeListener(name,cancel);}
}
