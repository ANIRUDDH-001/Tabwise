// Diagnostic cleanup only: never suppress prior class teardown failures or infer absence from stop's error.
export async function cleanupFailedStartup({nvda,lifecycle,startupError}){
 let failed=startupError;for(let n=0;failed&&n<8;n++,failed=failed.cause)if(failed.cleanup_errors?.length)throw Error('startup teardown incomplete');
 try{await nvda.stop();return {state:'stopped'};}
 catch(error){
  if(!startupError||error?.message!=='NVDA is not running'||lifecycle.hasOwnedProcess())throw error;
  const receipt=await lifecycle.quit();
  if(receipt?.listener_stopped!==true||lifecycle.hasOwnedProcess())throw Error('startup cleanup unconfirmed');
  return {state:'no-owned-process-listener-absent'};
 }
}
