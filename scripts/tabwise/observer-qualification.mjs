// Assessment/preparation only: no process, NVDA, browser, credential, dispatch or network imports.
export function assessObserverQualification(sample){
 const {before,after,journal,primary_phrase,owned_pid,relay_pid_before,relay_pid_after,action_started_ms}=sample;
 const reasons=[];
 if(!Number.isInteger(owned_pid)||owned_pid<=0||relay_pid_before!==owned_pid||relay_pid_after!==owned_pid)reasons.push('relay ownership changed');
 if(!before?.session||before.session!==after?.session||!Array.isArray(before.phrases)||before.phrases.length!==0)reasons.push('unexpected pre-action speech or reset');
 if(after?.connected!==true||after?.complete!==true||!Array.isArray(after.phrases))reasons.push('observer incomplete');
 if(typeof primary_phrase!=='string'||!primary_phrase.trim()||!after?.phrases?.includes(primary_phrase))reasons.push('primary title absent from observer');
 const ordered=Array.isArray(journal)&&journal.length===after?.phrases?.length&&journal.every((e,i)=>e.seq===i+1&&e.text===after.phrases[i]&&Number.isFinite(e.t)&&e.t>=action_started_ms&&(i===0||e.t>=journal[i-1].t));
 if(!ordered)reasons.push('journal incomplete or outside action window');
 const match=ordered?journal.find(e=>e.text===primary_phrase):null;
 return {candidate_pass:reasons.length===0,reasons,first_match_lag_ms:match?match.t-action_started_ms:null,relay_equivalence_verified:false,scope:'single controlled title observation only; no general broadcast, non-interference or timing qualification'};
}
export function createQualificationTeardown({guard,finalRead,observer,browser,nvda}){
 let pending;
 return ()=>pending??=(async()=>{
  const errors=[];const attempt=async(label,fn)=>{try{return await fn();}catch(error){errors.push(`${label}: ${error.message}`);}};
  await attempt('disarm',()=>guard.disarm());
  const quiet=await attempt('quiesce',()=>guard.quiesce(1000));
  if(quiet?.quiet!==true)await attempt('guard stop',()=>guard.stop('qualification teardown has live sends','timeout'));
  await attempt('final boundary',finalRead);await attempt('observer close',()=>observer.close());
  if(quiet?.quiet===true)await attempt('browser close',()=>browser.close());
  await attempt('NVDA stop',()=>nvda.stop());
  return {quiescence:quiet?.quiet===true?'QUIET_AT_TEARDOWN':'LIVE_AT_TEARDOWN',physical_quiescence_verified:false,errors};
 })();
}
