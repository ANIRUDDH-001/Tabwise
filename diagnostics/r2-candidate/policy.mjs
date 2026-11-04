// Separate nonproduction candidate authorization; no runtime imports or production qualification.
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {assertContract,sha256} from '../../packages/contracts/index.mjs';
import {stable,same,exact} from '../../packages/contracts/r2-product.mjs';
import {R2_FILES} from '../../scripts/tabwise/r2-policy.mjs';
import {QUALIFICATION_FILES,qualificationDigest} from '../../scripts/tabwise/qualification-policy.mjs';
import {validateBinding} from '../../scripts/tabwise/r2-admission.mjs';
import {parseUniqueJson} from '../../src/r2/strict-json.mjs';
import {planR2EvidenceCaps} from '../../scripts/tabwise/r2-evidence.mjs';
import {candidateFixture,OWNER,PATCH_SHA,REPAIRED_SHA} from './repair.mjs';
export const REF='refs/heads/feat/tabwise-r2-r7-product-completion';
export const WORKFLOW='.github/workflows/tabwise-r2-native-diagnostic.yml';
export const CLASSIFICATION='NONPRODUCTION_UNQUALIFIED';
export const FIXTURE='fixtures/fernway/index.html';
export const FIXTURE_SHA='5ad4631558cdcc557770ae864957ffc167546cd0af58bd11258808e1c0e523be';
export const ACTIONS=Object.freeze(['Tab','Enter','Tab','Tab','Enter']);
// Poll snapshots every100ms; recorder events and NVDA speech remain continuous.
// Preserve action/ack/observation windows and the existing12MB evidence ceiling.
const TIMING=Object.freeze({ackMs:1000,observationMs:1500,pollMs:100,timeoutMs:8000});
export const SOURCE_FILES=Object.freeze([...new Set([...R2_FILES,...QUALIFICATION_FILES,WORKFLOW,FIXTURE,'diagnostics/r2-native/verify.mjs','diagnostics/r2-native/policy.mjs',
 'web/lib/server/candidate-run.mjs','web/lib/server/candidate-run-live.ts','web/app/api/candidate-runs/route.ts','web/app/api/candidate-runs/[id]/route.ts','web/test/candidate-run.test.mjs','web/test/candidate-run-database.test.mjs','supabase/migrations/20261104170315_candidate_native_runs.sql','supabase/tests/candidate_native_runs.sql',
 'web/lib/server/candidate-evidence.mjs','web/lib/server/candidate-evidence-live.ts','web/app/api/candidate-runs/[id]/evidence/route.ts','web/test/candidate-evidence.test.mjs','web/test/candidate-run.browser.mjs','web/components/CandidateRun.tsx','web/components/PrepareCandidate.tsx','web/components/SavedJourneyVersion.tsx','web/components/OwnedWorkspace.tsx','web/lib/site-navigation.mjs','web/app/api/workspace/route.ts','web/app/candidate-runs/[id]/page.tsx','web/app/candidate-runs/new/page.tsx','supabase/migrations/20261104172612_candidate_evidence_readback.sql',
 'web/lib/server/candidate-repair.mjs','web/lib/server/candidate-repair-live.ts','web/app/api/candidate-runs/[id]/repair/route.ts','web/components/CandidateRepair.tsx','web/test/candidate-repair-database.test.mjs','supabase/migrations/20261104185602_candidate_reviewed_repair.sql',
 'web/lib/server/candidate-comparison.mjs','web/lib/server/candidate-comparison-live.ts','web/app/api/candidate-runs/[id]/comparison/route.ts','web/components/CandidateComparison.tsx','web/test/candidate-comparison.test.mjs','supabase/migrations/20261104190839_candidate_repair_comparison.sql',
 'web/lib/reason-copy.mjs','web/test/repair-radio-identity.test.mjs','web/test/repair-radio-recorder.browser.mjs',
 'web/test/candidate-configuration.test.mjs',
 'web/test/candidate-repair-recovery.test.mjs','supabase/migrations/20261104193248_candidate_repair_source_recovery.sql',
 'web/lib/server/native-request.mjs','web/lib/server/verification-directory.mjs','web/test/candidate-packaged-imports.test.mjs',
 'diagnostics/r2-candidate/web-repair-source.json',
 'web/lib/server/candidate-comparison-read.mjs','web/test/candidate-comparison-read.test.mjs',
 'diagnostics/r2-candidate/repair.mjs','diagnostics/r2-candidate/repair.test.mjs','diagnostics/r2-candidate/focus-restoration.patch','diagnostics/r2-candidate/focus-restoration-review.json',
 'diagnostics/r2-candidate/policy.mjs','diagnostics/r2-candidate/policy.test.mjs','diagnostics/r2-candidate/run.mjs','diagnostics/r2-candidate/runner.test.mjs','diagnostics/r2-candidate/verify.mjs','diagnostics/r2-candidate/verify.test.mjs','diagnostics/r2-candidate/store.mjs','diagnostics/r2-candidate/store.test.mjs'])].sort());
const root=resolve(import.meta.dirname,'../..'),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const fail=why=>{throw Error('candidate refused: '+why);};
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
export function sourceDigest(sourceRoot=root){return sha256(SOURCE_FILES.map(path=>path+'\0'+sha256(readFileSync(join(sourceRoot,path),'utf8').replaceAll('\r\n','\n'))+'\n').join(''));}
const bodyKeys=['schema','classification','repository','workflow','ref','actor','revision','source_scope_sha256','runtime_scope_sha256','user_id','product_run_id','journey_version_id','spec_sha256','fixture_sha256','journey_id','variant','actions','execution_authorized','production_qualified'];
function checked(request){
 exact(request,[...bodyKeys,'request_sha256']);
 if(request.schema!=='tabwise-candidate-native-request/1'||request.classification!==CLASSIFICATION||request.repository!=='ANIRUDDH-001/Tabwise'||request.workflow!==WORKFLOW||request.ref!==REF||request.actor!=='ANIRUDDH-001'||!/^[a-f0-9]{40}$/.test(request.revision??'')||!['source_scope_sha256','runtime_scope_sha256','spec_sha256'].every(k=>hash(request[k]))||!['user_id','product_run_id','journey_version_id'].every(k=>uuid(request[k]))||request.fixture_sha256!==(request.variant==='patched'?REPAIRED_SHA:FIXTURE_SHA)||request.journey_id!=='fernway-seat'||!['broken','patched'].includes(request.variant)||request.variant==='patched'&&request.user_id!==OWNER||!same(request.actions,ACTIONS)||request.execution_authorized!==false||request.production_qualified!==false||request.request_sha256!==sha256(stable(Object.fromEntries(bodyKeys.map(k=>[k,request[k]])))))fail('request identity/source/scope');
 return request;
}
export function prepareCandidateRequest({userId,run,specBytes,fixture,revision,sourceDigest:scope,sourceRoot=root}){
 planR2EvidenceCaps({actions:ACTIONS.length,...TIMING});
 assertContract('run-spec',run?.spec);
 if(!uuid(userId)||run.user_id!==userId||run.id!==run.spec.run_id||!uuid(run.journey_version_id)||run.status!=='admitted')fail('owned admitted immutable version required');
 if(!(specBytes instanceof Uint8Array)||specBytes.length>60000||!same(parseUniqueJson(new TextDecoder('utf-8',{fatal:true}).decode(specBytes)),run.spec))fail('exact saved spec required');
 const expectedFixture=candidateFixture(run.spec.variant,sourceRoot);
 if(!(fixture instanceof Uint8Array)||fixture.length>100000||sha256(Buffer.from(fixture).toString('utf8').replaceAll('\r\n','\n'))!==sha256(expectedFixture)||run.spec.app_hash!==sha256(expectedFixture)||run.spec.variant==='patched'&&(userId!==OWNER||run.spec.patch_ref!==PATCH_SHA))fail('owned fixture required');
 if(run.spec.journey_id!=='fernway-seat'||!['broken','patched'].includes(run.spec.variant)||!same(run.spec.steps.map(s=>s.key),ACTIONS)||run.spec.steps.some((s,n)=>s.step!==n+1||s.text!==null))fail('fixed candidate journey required');
 const body={schema:'tabwise-candidate-native-request/1',classification:CLASSIFICATION,repository:'ANIRUDDH-001/Tabwise',workflow:WORKFLOW,ref:REF,actor:'ANIRUDDH-001',revision,source_scope_sha256:scope,runtime_scope_sha256:qualificationDigest(sourceRoot),user_id:userId,product_run_id:run.id,journey_version_id:run.journey_version_id,spec_sha256:sha256(specBytes),fixture_sha256:sha256(expectedFixture),journey_id:run.spec.journey_id,variant:run.spec.variant,actions:[...ACTIONS],execution_authorized:false,production_qualified:false};
 return Object.freeze(checked({...body,request_sha256:sha256(stable(body))}));
}
export function candidatePlan(request){checked(request);return {schema:'tabwise-r2-plan/1',split:'development',spec:{...TIMING},handleTimeoutMs:27000,focusWaitMs:1000,pages:[{id:'candidate-seat',fixture:'fernway/index.html',fixture_sha256:request.fixture_sha256,query:'?flow=seat&variant=broken',task:ACTIONS.map((press,n)=>({step:'step-'+(n+1),press}))}]};}
export function fixtureForCandidate(request,sourceRoot=root){checked(request);return candidateFixture(request.variant,sourceRoot);}
export function candidatePacket({request,githubRunId,issuedAt,expiresAt}){
 const r=checked(request);
 if(!/^[1-9][0-9]{0,19}$/.test(githubRunId??'')||!iso(issuedAt)||!iso(expiresAt)||Date.parse(expiresAt)<=Date.parse(issuedAt)||Date.parse(expiresAt)-Date.parse(issuedAt)>3600000)fail('bounded run authorization required');
 return {schema:'tabwise-candidate-execution-approval/1',classification:CLASSIFICATION,repository:r.repository,workflow:r.workflow,ref:r.ref,actor:r.actor,revision:r.revision,source_scope_sha256:r.source_scope_sha256,request_sha256:r.request_sha256,product_run_id:r.product_run_id,user_id:r.user_id,journey_version_id:r.journey_version_id,spec_sha256:r.spec_sha256,fixture_sha256:r.fixture_sha256,plan_sha256:sha256(stable(candidatePlan(r))),github_run_id:githubRunId,github_run_attempt:2,actions:[...ACTIONS],max_ms:180000,issued_at:issuedAt,expires_at:expiresAt,production_qualified:false,decision:'AUTHORIZE NONPRODUCTION CANDIDATE EXECUTION ONLY'};
}
export function checkCandidateApproval({request,approval,env,head,sourceDigest:scope,platform,execArgv,now=Date.now()}){
 const errors=[];
 try{
  checked(request);const p=typeof approval==='string'?parseUniqueJson(approval):approval;
  const expected=candidatePacket({request,githubRunId:env.GITHUB_RUN_ID,issuedAt:p?.issued_at,expiresAt:p?.expires_at});
  if(!same(p,expected))errors.push('exact candidate authorization mismatch');
  if(now<Date.parse(p.issued_at)||now>=Date.parse(p.expires_at))errors.push('candidate authorization expired or premature');
  if(platform!=='win32'||env.GITHUB_ACTIONS!=='true'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.RUNNER_OS!=='Windows'||!env.RUNNER_TEMP)errors.push('isolated hosted Windows required');
  if(head!==request.revision||env.GITHUB_SHA!==head||env.GITHUB_WORKFLOW_SHA!==head||scope!==request.source_scope_sha256)errors.push('candidate source mismatch');
  if(env.GITHUB_REPOSITORY!==request.repository||env.GITHUB_REF!==REF||env.GITHUB_WORKFLOW_REF!==request.repository+'/'+WORKFLOW+'@'+REF||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_RUN_ATTEMPT!=='2'||env.GITHUB_ACTOR!==request.actor||env.GITHUB_TRIGGERING_ACTOR!==request.actor)errors.push('candidate execution identity mismatch');
  if(!Array.isArray(execArgv)||execArgv.length||Object.entries(env).some(([k,v])=>v&&(/^(NODE_OPTIONS|NODE_PATH|R1T_|ACTIONS_ID_TOKEN_REQUEST_)/i.test(k)||/^(MODEL_API_KEY|SUPABASE_SERVICE_ROLE_KEY|TABWISE_R2_RECEIPT_PRIVATE_KEY)$/i.test(k))))errors.push('candidate hooks or privileged credentials forbidden');
 }catch{errors.push('malformed candidate request or approval');}
 return errors;
}
export function candidateBinding(request,approval){
 const r=checked(request),p=candidatePacket({request:r,githubRunId:approval.github_run_id,issuedAt:approval.issued_at,expiresAt:approval.expires_at});
 if(!same(p,approval))fail('exact candidate packet required');
 return validateBinding({purpose:'candidate-execution',repository:r.repository,workflow:WORKFLOW,revision:r.revision,actor:r.actor,owner_approval_ref:'CANDIDATE-'+r.request_sha256,review_ref:'NONPRODUCTION:'+sha256(stable(p)),reviewed_files:SOURCE_FILES,reviewed_sha256:r.source_scope_sha256,qualification_sha256:r.runtime_scope_sha256,plan_sha256:p.plan_sha256,fixtures:[{id:'candidate-seat',sha256:r.fixture_sha256}],permitted_attempt:2,expires_at:p.expires_at});
}
export function assertProductionBlocked(sourceRoot=root){
 for(const name of ['r2-status.json','qualification-status.json','r2-product-policy.json','r2-admission-policy.json','r2-admission-server-policy.json','native-integration-policy.json']){const p=JSON.parse(readFileSync(join(sourceRoot,'scripts/tabwise',name),'utf8'));if(p.enabled!==false||'verdict' in p&&p.verdict!=='BLOCK')fail('production policy must remain disabled');}
 if(sha256(readFileSync(join(sourceRoot,FIXTURE),'utf8').replaceAll('\r\n','\n'))!==FIXTURE_SHA)fail('candidate fixture changed');
}
export function readCandidateEnvelope(text,{head,scope,sourceRoot=root}){
 if(typeof text!=='string'||Buffer.byteLength(text)>60000)fail('bounded saved candidate delivery required');
 const envelope=parseUniqueJson(text);exact(envelope,['request','spec_text']);checked(envelope.request);
 if(typeof envelope.spec_text!=='string')fail('saved spec bytes required');
 const request=envelope.request,spec=parseUniqueJson(envelope.spec_text),fixture=candidateFixture(request.variant,sourceRoot);
 const actual=prepareCandidateRequest({userId:request.user_id,run:{id:request.product_run_id,user_id:request.user_id,journey_version_id:request.journey_version_id,status:'admitted',spec},specBytes:Buffer.from(envelope.spec_text),fixture,revision:head,sourceDigest:scope,sourceRoot});
 if(!same(actual,request))fail('saved request/source delivery mismatch');
 return {request,spec,spec_text:envelope.spec_text,fixture,plan:candidatePlan(request)};
}
