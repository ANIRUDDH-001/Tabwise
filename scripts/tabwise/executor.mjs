import {preflightJourney} from './input-policy.mjs';

// Candidate press wrapper only. A reviewed loader must supply the frozen singleton guard,
// guarded NVDA instance, continuous page acknowledgement reader and foreground/intent bindings.
// No process, transport, browser or physical input module is imported here.
export function createGuardedPressExecutor({steps,nvda,guard,checkForeground,persistActionIntent}){
 const journey=preflightJourney(steps);
 if(journey.some(step=>step.key==='type'))throw Error('typed executor remains refused pending independent qualification');
 if(typeof nvda?.press!=='function'||typeof checkForeground!=='function'||typeof persistActionIntent!=='function')throw Error('missing guarded executor bindings');
 let cursor=0,busy=false;
 const state={underlying_started:false,underlying_settled:false,cancellation_requested:false,physical_quiescence_verified:false};
 const stop=(reason,kind)=>{if(!guard.isStopped())guard.stop(reason,kind);};
 const execute=async(action,{signal}={})=>{
  const expected=journey[cursor];
  if(busy||!expected||action?.step!==String(expected.step)||action?.press!==expected.key)throw Error('executor sequence or press mismatch');
  if(guard.isStopped())throw Error('executor guard stopped');
  busy=true;cursor++;
  Object.assign(state,{underlying_started:false,underlying_settled:false,cancellation_requested:false});
  const abort=()=>{state.cancellation_requested=true;stop('R2 executor cancellation requested','timeout');};
  signal?.addEventListener('abort',abort,{once:true});
  try{
   if(signal?.aborted)abort();
   if(guard.isStopped())throw Error('executor cancelled before intent');
   await persistActionIntent({step:expected.step,press:expected.key});
   if(guard.isStopped())throw Error('executor cancelled before foreground check');
   const errors=await checkForeground();
   if(!Array.isArray(errors)||errors.length)throw Error('foreground check refused');
   if(guard.isStopped()||signal?.aborted)throw Error('executor cancelled before arm');
   if(!guard.arm(`tabwise:${expected.step}`))throw Error('executor guard stopped before arm');
   state.underlying_started=true;
   try{await nvda.press(expected.key,{capture:false});}
   finally{state.underlying_settled=true;}
  }catch(error){stop(`executor: ${error.message}`,state.underlying_started?'send':'pre');throw error;}
  finally{
   guard.disarm();
   await new Promise(resolve=>setImmediate(resolve));
   const quiet=await guard.idle(1000);
   if(quiet?.quiet!==true)stop('executor send remains in flight','timeout');
   signal?.removeEventListener('abort',abort);busy=false;
  }
  if(guard.isStopped()||state.cancellation_requested)throw Error('executor stopped or cancelled');
  // No R1 acknowledgement is returned or copied into R2's independent observation cursor.
 };
 return Object.freeze({execute,snapshot:()=>({...state})});
}
