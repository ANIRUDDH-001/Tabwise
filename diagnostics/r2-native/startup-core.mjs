import {safeDiagnostic} from './startup-diagnostics.mjs';
// No native imports; receives only lifecycle operations. Never receives arm or input capabilities.
export async function runStartupOnly({start,stop,authentic,status,disarm,diagnostic=()=>({stage:'nvda-class-start',code:'startup-failed'})}){
 const result={schema:'tabwise-startup-only/1',startup_pass:false,production_qualified:false,native_interaction_pass:false,physical_quiescence_verified:false,sends:0,receipt:null,error:null,cleanup_error:false};
 let startupError=null;
 try{
  authentic();disarm();const before=status();if(before.stopped||before.sends!==0||before.refused!==0||before.live!==0)throw Error('precondition');
  const receipt=await start();authentic();
  if(!Number.isSafeInteger(receipt?.pid)||receipt.pid<=0||receipt.relay_pid!==receipt.pid||receipt.reset_confirmed!==true)throw Error('ownership');
  result.receipt={pid:receipt.pid,relay_pid:receipt.relay_pid,reset_confirmed:true};
 }catch(error){startupError=error;result.diagnostic=safeDiagnostic(diagnostic(error));result.error='startup-or-identity-refused';}
 finally{
  // A failed start can retain owned processes; always try the unchanged stop path.
  try{const cleanup=await stop(startupError);result.cleanup_diagnostic=safeDiagnostic({stage:'cleanup',code:cleanup?.state??'stopped'});}catch{result.cleanup_error=true;result.cleanup_diagnostic={stage:'cleanup',code:'cleanup-failed'};}
  try{authentic();const final=status();result.sends=final.sends;if(final.stopped||final.sends!==0||final.refused!==0||final.live!==0)result.error='zero-key-or-lifecycle-refused';}catch{result.error='final-integrity-refused';}
 }
 result.startup_pass=result.error===null&&!result.cleanup_error&&result.receipt!==null&&result.sends===0;
 return result;
}
