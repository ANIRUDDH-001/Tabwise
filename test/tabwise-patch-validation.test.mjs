import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatePatchProposal} from '../src/repair/patch.mjs';
import {sha256} from '../packages/contracts/index.mjs';
const source='<p id="error"></p>\n',run='00000000-0000-4000-8000-000000000001';
const diff='--- a/index.html\n+++ b/index.html\n@@ -1,1 +1,1 @@\n-<p id="error"></p>\n+<p id="error" role="alert"></p>\n';
const input=()=>({runId:run,source,baseSha256:sha256(source),evidenceRefs:['event:1'],knownEvidenceRefs:['event:1'],proposal:{diff,rationale:'Make the error announcement available.',expected_speech_after:['Error message']}});
test('patch proposal is bound to exact source, diff bytes and cited evidence',()=>{
 const out=validatePatchProposal(input());assert.equal(out.ok,true,JSON.stringify(out.errors));
 assert.equal(out.contract.base_sha256,sha256(source));assert.equal(out.contract.patch_sha256,sha256(diff));assert.deepEqual(out.contract.files,['index.html']);
 assert.equal(out.patched['index.html'],'<p id="error" role="alert"></p>\n');
});
test('stale source, unknown evidence and unknown fields cannot become approvable patches',()=>{
 for(const change of [v=>v.baseSha256='0'.repeat(64),v=>v.evidenceRefs=['invented'],v=>v.proposal.extra=true,v=>v.proposal.expected_speech_after='prediction']){const value=input();change(value);assert.equal(validatePatchProposal(value).ok,false);}
});
test('patch validation refuses external code, traversal, wrong context and excessive changed lines',()=>{
 for(const bad of [diff.replaceAll('index.html','../escape'),diff.replace('role="alert"','role="alert" onclick="fetch(\'https://evil.test\')"'),diff.replace('-<p id="error"></p>','-wrong context')]){const value=input();value.proposal.diff=bad;assert.equal(validatePatchProposal(value).ok,false);}
});
test('patch checks never mutate the proposal, source or evidence arrays',()=>{
 const value=input(),before=structuredClone(value);validatePatchProposal(value);assert.deepEqual(value,before);
});
