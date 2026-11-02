// Derive W5 request identity from an already owner-authorized stored product run and checked R2 gate.
import {assertContract} from '../../../packages/contracts/index.mjs';
import {bindingFromGate} from '../../../scripts/tabwise/r2-admission.mjs';
import {r2PlanDigest} from '../../../scripts/tabwise/r2-policy.mjs';
import {authorizeRun} from './core.mjs';
export function productR2AdmissionContext({user,run,gate,policy,pageId}){
 authorizeRun(user,run);assertContract('run-spec',run.spec);
 if(run.id!==run.spec.run_id||!['admitted','dispatching','dispatched','running','ingesting'].includes(run.status)||run.gh_head_sha!==gate.head||!/^[1-9][0-9]{0,19}$/.test(String(run.gh_run_id))||gate.status.plan_sha256!==r2PlanDigest(gate.planBytes))throw Error('stored product execution binding');
 const page=gate.plan.pages.find(p=>p.id===pageId);
 if(!page||page.fixture_sha256!==run.spec.app_hash||page.task.length!==run.spec.steps.length||page.task.some((t,n)=>t.press!==run.spec.steps[n].key||run.spec.steps[n].key==='type'))throw Error('product/R2 fixture and step mapping');
 return {binding:bindingFromGate(gate,policy),consumer:{run_id:String(run.gh_run_id),attempt:1}};
}
