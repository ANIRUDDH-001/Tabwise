import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {sha256} from '../../../packages/contracts/index.mjs';
import {stable,same} from '../../../packages/contracts/r2-product.mjs';
import {parseUniqueJson} from '../../../src/r2/strict-json.mjs';
import {captureObservationSources} from '../../../src/r2/capture-export.mjs';
import {candidatePlan} from '../../../diagnostics/r2-candidate/policy.mjs';
import {BASE_SHA,PATCH_SHA,REPAIRED_SHA,OWNER,repairContext,materializeReviewedCandidate} from '../../../diagnostics/r2-candidate/repair.mjs';
import {parseR2Plan,r2VerifyRun} from '../../../scripts/tabwise/r2-run.mjs';
import {readArtifactZip} from './artifact-zip.mjs';
import {decodeCandidateArchive,candidateReplayAccepted} from './candidate-evidence.mjs';
import {withVerificationDirectory} from './verification-directory.mjs';
import {assessNativeRepair} from './repair-verdict.mjs';
const need=(ok,reason)=>{if(!ok)throw Error('candidate comparison refused: '+reason);};
async function original(row,download,fixture){
 const prefix='candidate/'+row.product_run_id+'/'+row.readback_sha256;
 const evidenceBytes=await download(prefix+'/evidence.json');
 need(sha256(evidenceBytes)===row.readback_sha256&&Buffer.from(evidenceBytes).toString('utf8')===stable(row.readback),'immutable private evidence readback');
 const e=row.readback;
 need(e.classification==='NONPRODUCTION_UNQUALIFIED'&&e.production_qualified===false&&e.native_interaction_pass===true&&e.product_run_id===row.product_run_id&&e.request_sha256===row.request.request_sha256&&e.github_run_id===row.github_run_id&&e.revision===row.request.revision,'stored candidate identity');
 const [native,independent]=await Promise.all(['native','readback'].map(async kind=>decodeCandidateArchive(await download(prefix+'/'+kind+'-archive.json'),e.archives[kind])));
 const files=readArtifactZip(native),separate=parseUniqueJson(readArtifactZip(independent)['candidate-readback.json'].toString('utf8'));
 need(separate.integrity_pass===true&&separate.native_interaction_pass===true&&same(separate.request,row.request)&&same(separate.rows,e.rows),'original separate-verifier readback');
 const source=Object.fromEntries(Object.entries(files).filter(([name])=>name.startsWith('source/')).map(([name,b])=>[name.slice(7),b]));
 const plan=parseR2Plan(Buffer.from(stable(candidatePlan(row.request))));
 need(sha256(fixture)===row.spec.app_hash&&row.request.fixture_sha256===row.spec.app_hash,'exact observed fixture bytes');
 await withVerificationDirectory(async dir=>{
  for(const [name,b] of Object.entries(source)){const dest=resolve(dir,name);need(dest.startsWith(resolve(dir)+'/')||dest.startsWith(resolve(dir)+'\\'),'source scratch scope');await mkdir(dirname(dest),{recursive:true});await writeFile(dest,b,{flag:'wx'});}
  const result=await r2VerifyRun({plan,pages:plan.pages,fixtures:new Map([['candidate-seat',fixture]])},dir);need(candidateReplayAccepted(result),'complete original sealed replay');
 });
 const manifest=parseUniqueJson(source['candidate-seat/manifest.json'].toString('utf8'));
 const rows=captureObservationSources({files:source,expected:{page_id:'candidate-seat',session:manifest.page.session,spec:row.spec}});
 need(same(rows,e.rows)&&sha256(source['run-manifest.json'])===e.run_manifest_sha256,'observation and manifest correspondence');
 return {capture:parseUniqueJson(source['candidate-seat/capture.json'].toString('utf8')),evidence:{lanes:Object.fromEntries(['keys','focus','speech','app_events'].map(lane=>[lane,rows.filter(r=>r.row.lane===lane).map(r=>r.row.event)]))}};
}
export async function compareStoredCandidateRepair({userId,row,read,download,sourceRoot,sourceContext}){
 need(row?.user_id===userId&&userId===OWNER&&row.state==='EVIDENCE_READY'&&row.repair,'owned complete candidate repair required');
 const b=await read(row.repair.baseline_run_id);
 need(b?.user_id===userId&&b.state==='EVIDENCE_READY'&&!b.repair&&b.spec.variant==='broken'&&b.spec.app_hash===BASE_SHA&&row.spec.variant==='patched'&&row.spec.app_hash===REPAIRED_SHA&&row.spec.patch_ref===PATCH_SHA&&row.repair.source_sha256===REPAIRED_SHA&&row.repair.patch_sha256===PATCH_SHA&&same(b.spec.steps,row.spec.steps)&&b.journey_version_id===row.journey_version_id,'exact owned original and reviewed repaired source pair');
 const context=sourceContext??repairContext(sourceRoot),applied=materializeReviewedCandidate(context);
 need(row.repair.source===applied.source&&sha256(row.repair.diff)===PATCH_SHA&&same(row.repair.review,applied.review),'actual approved source/review correspondence');
 const [baseline,rerun]=await Promise.all([original(b,download,Buffer.from(context.base)),original(row,download,Buffer.from(applied.source))]);
 const result=assessNativeRepair({baselineCapture:baseline.capture,rerunCapture:rerun.capture,baselineEvidence:baseline.evidence,rerunEvidence:rerun.evidence,steps:row.spec.steps,oracle:{kind:'focus',step:5}});
 return {schema:'tabwise-candidate-repair-comparison/1',classification:'NONPRODUCTION_UNQUALIFIED',production_qualified:false,independent_qualification:false,evidence_class:'MACHINE',independence:'L3',product_run_id:row.product_run_id,baseline_run_id:b.product_run_id,patch_sha256:PATCH_SHA,base_sha256:BASE_SHA,source_sha256:REPAIRED_SHA,baseline_readback_sha256:b.readback_sha256,rerun_readback_sha256:row.readback_sha256,baseline_workflow_id:b.github_run_id,rerun_workflow_id:row.github_run_id,observed_terminal_focus:{baseline:baseline.capture.records[4].page.after.active,rerun:rerun.capture.records[4].page.after.active},...result};
}
