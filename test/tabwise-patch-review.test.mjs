import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as review from '../src/repair/review.mjs';
import {validatePatchProposal} from '../src/repair/patch.mjs';
import {fixtures} from '../packages/contracts/fixtures.mjs';
import {sha256} from '../packages/contracts/index.mjs';
function sample(){
 const source='<p>Seat</p>\n',run={id:fixtures['run-spec'].valid.run_id,user_id:'owner',status:'completed',evidence_status:'complete',spec:{app_hash:sha256(source)}};
 const proposal={diff:'--- a/index.html\n+++ b/index.html\n@@ -1,1 +1,1 @@\n-<p>Seat</p>\n+<p role="status">Seat</p>\n',rationale:'Synthetic',expected_speech_after:[]};
 const checked=validatePatchProposal({runId:run.id,source,baseSha256:run.spec.app_hash,evidenceRefs:['key:1'],knownEvidenceRefs:['key:1'],proposal});
 return {userId:'owner',run,patch:{id:'patch',run_id:run.id,status:'proposed',diff:proposal.diff,validator:{ok:true,contract:checked.contract}},source,currentBaseSha256:run.spec.app_hash,knownEvidenceRefs:['key:1'],decision:{decision:'approved',patch_sha256:sha256(proposal.diff)}};
}
test('patch approval requires exact source, diff, run ownership, evidence and explicit digest-bound decision',()=>{
 const args=sample(),result=review.preparePatchReview(args);assert.equal(result.ok,true);assert.equal(result.decision,'approved');
 for(const change of [a=>a.userId='other',a=>a.run.evidence_status='incomplete',a=>a.currentBaseSha256='0'.repeat(64),a=>a.source='stale',a=>a.patch.diff+='extra',a=>a.decision.patch_sha256='0'.repeat(64),a=>a.decision.extra=true,a=>a.patch.validator.contract.evidence_refs=['invented']]){
  const bad=sample();change(bad);assert.equal(review.preparePatchReview(bad).ok,false);
 }
});
test('reviewing a patch records a decision only, never dispatch or a verified repair',()=>{
 const args=sample();args.decision.decision='rejected';const result=review.preparePatchReview(args);assert.equal(result.ok,true);assert.equal(result.decision,'rejected');assert.equal(result.dispatch,false);assert.equal(result.verdict,null);
 assert.equal(review.preparePatchReview({...args,decision:{...args.decision,decision:'verify'}}).ok,false);
});
