import {readRunEvidence} from './stored-evidence.mjs';
import {consumePatchedSource} from '../../../src/repair/rerun.mjs';
import {parseUniqueJson} from '../../../src/r2/strict-json.mjs';
import {sha256} from '../../../packages/contracts/index.mjs';
// Always reconstruct stored evidence through the production native attestation reader.
// Callers cannot inject a qualified flag, an oracle result, or an alternate evidence verifier.
export async function recomputeStoredRepair({userId,run,bundle,finding,oracle,baselineMetadata,rerunMetadata,download}){
 const b=structuredClone(bundle),r=structuredClone(run),f=structuredClone(finding);
 if(!userId||r?.user_id!==userId||b.baseline?.user_id!==userId||r.id!==r.spec?.run_id||r.kind!=='verify'||r.status!=='completed'||r.evidence_status!=='complete'||f?.id!==b.patch?.finding_id||f.run_id!==b.baseline?.id)throw Error('owned completed repair/finding required');
 if(!oracle||oracle.user_id!==userId||oracle.reviewed_by!==userId||oracle.patch_id!==b.patch.id||oracle.baseline_run_id!==b.baseline.id||oracle.base_sha256!==b.application.base_sha256||oracle.step!==f.step||!['validation','status','focus'].includes(oracle.kind)||typeof oracle.review_ref!=='string'||!oracle.review_ref.trim())throw Error('independently registered owner oracle required');
 consumePatchedSource({...b,spec:r.spec,baseSource:b.application?.base_source});
 const baseline=await readRunEvidence({run:b.baseline,metadata:baselineMetadata,download:path=>download(b.baseline.id,path)});
 const rerun=await readRunEvidence({run:r,metadata:rerunMetadata,download:path=>download(r.id,path)});
 for(const e of [baseline,rerun])if(!e.complete||e.runner?.workflow!=='.github/workflows/tabwise-r2.yml')throw Error('qualified sealed native repair evidence required');
 if(oracle.kind==='focus'&&r.spec.journey_id!=='fernway-seat')throw Error('focus oracle supports only the source-bound Fernway seat journey');
 const capture=e=>{const exp=parseUniqueJson(Buffer.from(e.files['r2-export.json']).toString('utf8'));return parseUniqueJson(Buffer.from(e.files[exp.identity.page_id+'/capture.json']).toString('utf8'));};
 const result=assessNativeRepair({baselineCapture:capture(baseline),rerunCapture:capture(rerun),baselineEvidence:baseline.evidence,rerunEvidence:rerun.evidence,steps:r.spec.steps,oracle});
 return {oracle:structuredClone(oracle),schema:'tabwise-r3-verdict/1',run_id:r.id,baseline_run_id:b.baseline.id,application_id:b.application.id,patch_id:b.patch.id,finding_id:f.id,source_sha256:b.application.source_sha256,patch_sha256:b.application.patch_sha256,baseline_evidence_sha256:sha256(baseline.files['evidence.json']),rerun_evidence_sha256:sha256(rerun.files['evidence.json']),baseline_manifest_sha256:baseline.manifest_sha256,rerun_manifest_sha256:rerun.manifest_sha256,...result,evidence_class:'MACHINE',independence:'L3'};
}

// Pure narrow oracle; callers must establish native authenticity before using its result.
// It reads recorder-owned state, never page-authored event names or model predictions.
export function assessNativeRepair({baselineCapture,rerunCapture,baselineEvidence,rerunEvidence,steps,oracle}){
 const inconclusive=reason=>({verdict:'INCONCLUSIVE',checks:{symptom_gone:null,other_steps_preserved:null,evidence_complete:false},reason});
 if(oracle?.kind!=='focus')return inconclusive('Trusted native trigger observations for this symptom are not implemented.');
 for(const c of [baselineCapture,rerunCapture])if(c?.source!=='nvda'||c.completed!==true||c.outcome!=='COMPLETE'||c.reasons?.length||!Array.isArray(c.records)||c.records.length!==steps.length||c.records.some((r,n)=>r.step!==`a${n+1}`||r.press!==steps[n].key||r.reasons?.length||!['speech','observed-silence'].includes(r.capture_status)))return inconclusive('Complete action-bound native capture is required.');
 const index=steps.findIndex(s=>s.step===oracle.step);if(index<0)return inconclusive('Oracle step absent.');
 for(const c of [baselineCapture,rerunCapture]){
  const p=c.records[index].page;
  if(!Array.isArray(p?.before?.state?.dialogs)||p.before.state.dialogs.length!==1||!/^dialog#[1-9][0-9]*$/.test(p.before.state.dialogs[0])||!Array.isArray(p?.after?.state?.dialogs)||p.after.state.dialogs.length!==0||typeof p.after.active!=='string'||!p.after.active)return inconclusive('Recorder did not establish a dialog closing and its final focus.');
 }
 const restored=c=>/^choose-seat(?:#[1-9][0-9]*)?$/.test(c.records[index].page.after.active);
 if(restored(baselineCapture))return inconclusive('Baseline already has restored focus.');
 const normalize=s=>s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,'').replace(/\s+/g,' ').trim();
 const speech=(e,step)=>e.lanes.speech.filter(x=>x.step===step).map(x=>normalize(x.text));
 let preserved=true;
 for(const s of steps.filter(s=>s.step!==oracle.step)){
  const before=speech(baselineEvidence,s.step),after=speech(rerunEvidence,s.step);let n=0;
  for(const text of after)if(n<before.length&&text===before[n])n++;
  if(n!==before.length)preserved=false;
 }
 const gone=restored(rerunCapture);
 return {verdict:!preserved?'REGRESSED':gone?'FIXED':'NOT_FIXED',checks:{symptom_gone:gone,other_steps_preserved:preserved,evidence_complete:true},reason:!preserved?'Unaffected speech was lost.':gone?'Recorder observed dialog closure with restored focus and preserved unaffected speech.':'Recorder observed dialog closure without restored focus.'};
}
