// R1 evidence presentation (T-P0-10, REV-01). Every displayed claim comes from its own data file.
// Step 1 result: the PASS run's artifact is not present in this repository, so it is NOT validated (Step 2b).
export const R1_PASS_LEDGER={run_id:'r1-20261028T153344Z',validated:false};
export const R1_SCOPE_NOTE='Measured with NVDA under the A15 profile (browse mode off on page load). This shows real screen-reader speech capture; it does not prove R2 causal diagnosis, Fernway findings, Spark output or patch verification.';
export const R1_FAILED_SCOPE_NOTE='Real NVDA speech captured before the A15 profile. This failed run shows how Tabwise reports incomplete evidence; it does not prove R2 causal diagnosis, Fernway findings, Spark output or patch verification.';
export const R1_PASS_PENDING='A later R1 run is recorded as PASS in the project ledger but its evidence has not been validated for display.';
export function r1View(data,pass=null){
 if(!data||typeof data.run_id!=='string'||!['FAIL','PASS'].includes(data.result))throw Error('R1 data missing');
 const failed=data.result==='FAIL';
 return {run_id:data.run_id,result:data.result,label:failed?'Failed run · incomplete evidence':'PASS',tone:failed?'failed':'ok',profile:data.profile,
  scope:failed?R1_FAILED_SCOPE_NOTE:R1_SCOPE_NOTE,
  // A PASS view may only render from a validated PASS data file — never from ledger text.
  passNotice:pass&&pass.validated===true&&pass.result==='PASS'?null:R1_PASS_PENDING};
}
