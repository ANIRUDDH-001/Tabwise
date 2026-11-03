import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sha256} from '../packages/contracts/index.mjs';
import {applyApprovedRepair} from '../src/repair/application.mjs';
import {validatePatchProposal} from '../src/repair/patch.mjs';
function context(){const source='<p>Seat</p>\n',run={id:'00000000-0000-4000-8000-000000000001',user_id:'owner',status:'completed',evidence_status:'complete',spec:{app_hash:sha256(source)}};const proposal={diff:'--- a/index.html\n+++ b/index.html\n@@ -1,1 +1,1 @@\n-<p>Seat</p>\n+<p role="status">Seat</p>\n',rationale:'test',expected_speech_after:[]};const {contract}=validatePatchProposal({runId:run.id,source,baseSha256:sha256(source),evidenceRefs:['key:1'],knownEvidenceRefs:['key:1'],proposal});return {source,run,userId:'owner',currentBaseSha256:'0'.repeat(64),knownEvidenceRefs:['key:1'],patch:{id:'patch',run_id:run.id,status:'approved',reviewed_by:'owner',diff:proposal.diff,validator:{ok:true,contract}}};}
test('new materialization refuses stale current hash before invoking persistence',async()=>{const c=context();let calls=0;await assert.rejects(()=>applyApprovedRepair({context:c,patchSha256:c.patch.validator.contract.patch_sha256,rpc:async()=>{calls++;return {data:{application_id:'unsafe'}};}}),/stale/);assert.equal(calls,0);});
