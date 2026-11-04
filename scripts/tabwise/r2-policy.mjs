// R2-L2 S4: R2 approval policy. Mirrors checkQualificationApproval with R2 names, the run-plan hash and an explicit
// refusal of retired decisions. Pure decision over caller-supplied env/head/status/plan; it loads no runtime.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ciGuardErrors,workflowGuardErrors} from '../../src/speech/runguard.mjs';
import {qualificationDigest} from './qualification-policy.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export const R2_STATUS_SCHEMA='tabwise-r2-status/1';
export const R2_WORKFLOW='.github/workflows/tabwise-r2.yml';
// D-72, D-73 and D-74 are retired (R2-L2 design §9) and can never authorize R2.
export const RETIRED_APPROVALS=Object.freeze(['D-72','D-73','D-74']);
// R2 source scope at R2-L2 S5b/S6 (entry, run helpers, authentic session added); the status file is excluded.
// S7 (owner decision R-S7-1): the hosted workflow is reviewed scope too, so a workflow edit invalidates reviewed_sha256.
// O-11 (D-89): arm-input custody (src/r2/arm-inputs.mjs) derives model inputs from sealed runs, so it is reviewed scope too.
// C2: include the producer input policy, guarded executor and their shared press palette in enforced integrity.
export const R2_FILES=Object.freeze([
 'diagnostics/r2-native/startup-cleanup.mjs','diagnostics/r2-native/startup-diagnostics.mjs',
 'scripts/tabwise/r2-listeners.mjs','scripts/tabwise/r2-quiescence.mjs','scripts/tabwise/r2-loader.mjs','scripts/tabwise/r2-vendor-loader.mjs','scripts/tabwise/r2-nvda-lifecycle.mjs','scripts/tabwise/r2-runtime-integrity.mjs','scripts/tabwise/r2-runtime-pins.json','diagnostics/owner-v2/resolver.mjs','diagnostics/owner-v2/identity.ps1',
 'src/r2/runtime-metadata.mjs', 'src/r2/strict-json.mjs', 'src/r2/approval-constants.mjs', 'src/r2/node-review.mjs',
 '.github/workflows/tabwise-r2.yml', 'packages/contracts/index.mjs', 'packages/contracts/limits.mjs',
 'packages/contracts/palette.mjs', 'packages/contracts/r2-product.mjs', 'packages/contracts/schemas.mjs',
 'scripts/tabwise-r2.mjs', 'scripts/tabwise/executor.mjs', 'scripts/tabwise/input-policy.mjs',
 'scripts/tabwise/r2-admission-policy.json', 'scripts/tabwise/r2-admission-server-policy.json', 'scripts/tabwise/r2-admission-transport.mjs',
 'scripts/tabwise/r2-admission.mjs', 'scripts/tabwise/r2-compose.mjs', 'scripts/tabwise/r2-evidence.mjs',
 'scripts/tabwise/r2-lifecycle.mjs', 'scripts/tabwise/r2-policy.mjs', 'scripts/tabwise/r2-proctree.mjs',
 'scripts/tabwise/r2-product-policy.json', 'scripts/tabwise/r2-run.mjs', 'scripts/tabwise/r2-session.mjs',
 'scripts/tabwise/repair-session.mjs', 'src/repair/rerun.mjs', 'src/repair/verify-application.mjs', 'src/repair/apply.mjs',
 'src/budget/prices.mjs', 'src/r2/arm-inputs.mjs', 'src/r2/binding.mjs',
 'src/r2/capture-export.mjs', 'src/r2/capture.mjs', 'src/r2/contract.mjs', 'src/r2/page-journal.mjs',
 'src/r2/page-provider.mjs', 'src/r2/page-recorder.mjs', 'src/r2/page-source.mjs',
 'src/r2/preparation.mjs', 'src/r2/product-bridge.mjs', 'src/r2/send-receipt.mjs',
 'src/r2/speech-payload.mjs', 'supabase/proposals/r2-w5-admission.sql', 'web/app/api/r2/admission/route.ts',
 'web/app/api/runs/[id]/evidence/route.ts', 'web/lib/server/artifact-ingest.mjs', 'web/lib/server/artifact-store.mjs',
 'web/lib/server/artifact-zip.mjs', 'web/lib/server/core.mjs', 'web/lib/server/r2-admission-live.ts',
 'web/lib/server/r2-admission.mjs', 'web/lib/server/r2-caller.mjs', 'web/lib/server/r2-evidence-bridge.mjs',
 'web/lib/server/native-plan-admission.mjs', 'web/lib/server/native-integration-live.ts', 'web/app/api/r2/product-admission/route.ts', 'scripts/tabwise/product-workflow-boundary.mjs',
 'src/r2/native-plan.mjs', 'src/r2/product-worker.mjs', 'src/r2/product-delivery.mjs', 'src/r2/product-dispatch.mjs',
 'src/r2/product-producer.mjs', 'src/r2/product-coordinator.mjs',
 'src/r2/product-origin.mjs', 'src/r2/workflow-delivery.mjs', 'src/r2/product-export.mjs', 'src/r2/product-workflow-export.mjs', 'scripts/tabwise/product-windows-boundary.mjs',
 'web/lib/server/r2-product-context.mjs', 'web/lib/server/stored-evidence.mjs', 'web/lib/server/supabase.ts',
 'web/lib/server/repair-verdict.mjs', 'web/app/api/verifications/[id]/route.ts', 'supabase/migrations/20261103020000_repair_verdict.sql',
 'scripts/tabwise/verdict.mjs',
 'web/app/api/runs/[id]/repair-input/route.ts',
 'web/components/VerificationPanel.tsx',
 'src/repair/oracle.mjs', 'web/app/api/patches/[id]/oracle/route.ts', 'web/app/api/patches/[id]/route.ts', 'web/lib/server/patch-review.ts', 'web/components/PatchReview.tsx', 'web/components/RepairOracleReview.tsx', 'web/lib/oracle-state.mjs', 'supabase/migrations/20261103030000_repair_oracle_admission.sql',
 'web/package-lock.json', 'web/package.json',
].sort());
const STATUS_KEYS=new Set(['schema','enabled','verdict','reviewer','review_ref','owner_approval_ref','actor','reviewed_files','reviewed_sha256','qualification_sha256','plan_sha256','reason']);
const SHA256=/^[a-f0-9]{64}$/;
const text=(buf)=>buf.toString('utf8').replace(/\r\n/g,'\n');
// Same text-only scope rule as qualificationDigest: CRLF normalized, every other byte preserved.
export function r2Digest(root=ROOT){const hash=createHash('sha256');for(const file of R2_FILES){const body=readFileSync(resolve(root,file),'utf8').replace(/\r\n/g,'\n');hash.update(`${file}\0${createHash('sha256').update(body).digest('hex')}\n`);}return hash.digest('hex');}
// Run-plan identity: sha256 of the plan file's text with CRLF normalized, like fixture page hashes.
export function r2PlanDigest(plan){
 if(!(typeof plan==='string'||Buffer.isBuffer(plan))||!plan.length)throw Error('run plan must be non-empty text or bytes');
 return createHash('sha256').update(text(Buffer.isBuffer(plan)?plan:Buffer.from(plan,'utf8'))).digest('hex');
}
export function readR2Status(root=ROOT){try{return JSON.parse(readFileSync(resolve(root,'scripts/tabwise/r2-status.json'),'utf8'));}catch{return null;}}
export function checkR2Approval({env,head,status,plan,root=ROOT,platform=process.platform}){
 const errors=[];
 if(!env||typeof env!=='object')return {ok:false,errors:['environment missing']};
 errors.push(...ciGuardErrors(env),...workflowGuardErrors(env,head,{repository:'ANIRUDDH-001/Tabwise',ref:'refs/heads/main',workflow:R2_WORKFLOW}));
 if(platform!=='win32')errors.push('Windows process required');
 // Own data properties of a plain object only: an inherited or prototype-supplied field never authorizes.
 if(!status||typeof status!=='object'||Array.isArray(status)||Object.getPrototypeOf(status)!==Object.prototype)return {ok:false,errors:[...errors,'R2 status is not a plain object']};
 for(const key of Object.keys(status))if(!STATUS_KEYS.has(key))errors.push(`unexpected R2 status field ${key}`);
 if(status.schema!==R2_STATUS_SCHEMA)errors.push('R2 status schema mismatch');
 if(status.enabled!==true||status.verdict!=='PASS')errors.push('R2 is BLOCK/disabled');
 for(const field of ['reviewer','review_ref','owner_approval_ref','actor'])if(typeof status[field]!=='string'||!status[field].trim())errors.push(`missing ${field}`);
 if(typeof status.reviewer==='string'&&status.reviewer===status.actor)errors.push('reviewer must be independent of the dispatching actor');
 if(env.TABWISE_R2_ENABLED!=='true')errors.push('manual R2 opt-in absent');
 if(!/^[a-f0-9]{40}$/.test(head??'')||env.TABWISE_R2_APPROVED_REVISION!==head)errors.push('external owner-approved revision mismatch');
 if(!/^D-[0-9]+$/.test(env.TABWISE_R2_OWNER_APPROVAL??'')||env.TABWISE_R2_OWNER_APPROVAL!==status.owner_approval_ref)errors.push('explicit owner decision mismatch');
 if(RETIRED_APPROVALS.includes(status.owner_approval_ref)||RETIRED_APPROVALS.includes(env.TABWISE_R2_OWNER_APPROVAL))errors.push('owner decision is retired (D-72, D-73 and D-74 cannot authorize R2)');
 if(typeof env.GITHUB_ACTOR!=='string'||env.GITHUB_ACTOR!==status.actor)errors.push('approved owner actor mismatch');
 if(!/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID??'')||env.GITHUB_RUN_ATTEMPT!=='1'||!env.RUNNER_TEMP)errors.push('single initial hosted attempt identity required');
 if(JSON.stringify(status.reviewed_files)!==JSON.stringify(R2_FILES))errors.push('R2 reviewed scope mismatch');
 if(!SHA256.test(status.reviewed_sha256??''))errors.push('R2 reviewed digest missing');
 else try{if(status.reviewed_sha256!==r2Digest(root))errors.push('R2 content changed');}catch{errors.push('R2 content unavailable');}
 if(!SHA256.test(status.qualification_sha256??''))errors.push('qualification digest missing');
 else try{if(status.qualification_sha256!==qualificationDigest(root))errors.push('qualification content changed');}catch{errors.push('qualification content unavailable');}
 let planSha=null;try{planSha=r2PlanDigest(plan);}catch{errors.push('run plan unavailable');}
 if(!SHA256.test(status.plan_sha256??'')||planSha!==status.plan_sha256||env.TABWISE_R2_PLAN_SHA256!==status.plan_sha256)errors.push('run plan identity mismatch');
 return {ok:errors.length===0,errors};
}
