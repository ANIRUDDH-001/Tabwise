import {sha256} from '../../../packages/contracts/index.mjs';
import {reviewView} from './run-review-view.mjs';
import {findingReferences} from './finding-references.mjs';

// Caller must obtain stored through readRunEvidence after authorizing the run owner.
export function buildDiagnosticReport({run,stored,findings,diagnoses,patches}){
 if(!stored||stored.evidence?.run_id!==run.id||stored.evidence.provenance!=='observed-nvda')throw Error('owned observed evidence required');
 const claims=reviewView(stored.complete?'complete':'incomplete',findings,diagnoses);
 const snapshot={schema:'tabwise-diagnostic-report/1',run_id:run.id,run_created_at:run.created_at,spec_sha256:run.spec_sha256,observation:stored.classification,complete:stored.complete,
  source:{runner:stored.runner,manifest_sha256:stored.manifest_sha256,files:stored.artifacts},evidence:stored.evidence,...claims,
  finding_references:stored.complete?findingReferences(findings):{},patch_decisions:(patches??[]).slice(0,25).map(({id,status,reviewed_at})=>({id,status,reviewed_at})),
  verification:{status:'pending',verdict:null,reason:'This diagnostic export does not establish a repaired journey. A distinct authorized real rerun and reviewed verification evidence are required.'},
 };
 return {snapshot,sha256:sha256(JSON.stringify(snapshot))};
}
