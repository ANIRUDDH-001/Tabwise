import {priceOf,worstCaseNano,settledNano} from '../../../src/budget/prices.mjs';
import {LIMITS} from '../../../packages/contracts/limits.mjs';
export const PROJECT_ID='ueobjrtvsgvkigmjxkks';
export class HttpError extends Error {constructor(status,reason){super(reason);this.status=status;this.reason=reason;}}
export function assertProject(url){const u=new URL(url);if(u.origin!==`https://${PROJECT_ID}.supabase.co`||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new HttpError(503,'wrong_supabase_project');return u.origin;}
export function assertSameOrigin(request){if(request.headers.get('origin')!==new URL(request.url).origin)throw new HttpError(403,'same_origin_required');}
export function authorizeRun(user,run){if(!user?.id||!run||run.user_id!==user.id)throw new HttpError(404,'run_not_found');}
export function verifyWorkerIdentity(run,manifest,expected){
 const errors=[];
 for(const [key,value] of Object.entries({path:'.github/workflows/tabwise-run.yml',event:'workflow_dispatch',head_branch:'main',head_sha:expected.sha,display_title:`tabwise ${expected.run_id}`}))if(run[key]!==value)errors.push(`worker ${key}`);
 if(run.actor?.login!==expected.actor||manifest.runner?.actor!==expected.actor)errors.push('worker actor');
 if(manifest.run_id!==expected.run_id||manifest.spec_sha256!==expected.spec_sha256||manifest.runner?.head_sha!==expected.sha||manifest.runner?.github_run_id!==String(run.id))errors.push('manifest identity');
 return {ok:errors.length===0,errors};
}
export function verifyArtifactIdentity(run,manifest,expected){
 const errors=verifyWorkerIdentity(run,manifest,expected).errors;
 if(!Number.isSafeInteger(run.run_attempt)||run.run_attempt<1||manifest.runner?.github_run_attempt!==run.run_attempt)errors.push('artifact run attempt');
 for(const [field,remote] of [['workflow','path'],['event','event'],['head_branch','head_branch']])if(manifest.runner?.[field]!==run[remote])errors.push(`artifact ${field}`);
 return {ok:errors.length===0,errors};
}
export function createHostedBroker(rpc){
 const reservations=new Map();
 return {
  async reserve({model,inputTokens,maxOutputTokens,images=0,runId=null}){
   if(model!=='muse-spark-1.3'||!priceOf(model)||images!==0||![inputTokens,maxOutputTokens].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('unsupported hosted request');
   const worst=worstCaseNano({model,inputTokens,maxOutputTokens});
   if(!Number.isSafeInteger(worst)||worst<1||worst>LIMITS.HOSTED_CALL_CAP_NANO)throw Error('hosted per-call cap exceeded');
   const {data,error}=await rpc('reserve_hosted',{p_worst:worst,p_run:runId});
   if(error||!data?.id)throw Error(data?.reason??'hosted reservation failed');
   reservations.set(data.id,{model,worst});return {id:data.id,reservedUsd:worst/1e9};
  },
  async settle(id,{usage}={}){
   const r=reservations.get(id);
   if(!r||!Number.isSafeInteger(usage?.input_tokens)||!Number.isSafeInteger(usage?.output_tokens)||usage.input_tokens<0||usage.output_tokens<0||!Number.isSafeInteger(usage.cached_tokens??0)||(usage.cached_tokens??0)<0||(usage.cached_tokens??0)>usage.input_tokens)throw Error('valid usage required; full reservation retained');
   const actual=settledNano(r.model,usage);
   // SQL emits an alarm and retains the reservation if actual exceeds the bound.
   const {data,error}=await rpc('settle_hosted',{p_id:id,p_actual:actual});
   if(error||data?.reason)throw Error(data?.reason??'settlement failed; full reservation retained');
   reservations.delete(id);return {settledUsd:actual/1e9};
  },
 };
}
