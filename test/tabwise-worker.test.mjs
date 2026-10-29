import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyPatch,allowLoopback,runOfflineWorker,liveGate,createOfflineTransport} from '../scripts/tabwise/worker.mjs';
import {encodeSpec,verifyManifest,sha256} from '../packages/contracts/index.mjs';
import {fixtures} from '../packages/contracts/fixtures.mjs';
test('strict patch application binds exact context, bounded changes and owned files',()=>{
 const base='<p id="error"></p>\n';const diff='--- a/index.html\n+++ b/index.html\n@@ -1,1 +1,1 @@\n-<p id="error"></p>\n+<p id="error" role="alert"></p>\n';
 assert.equal(applyPatch({'index.html':base},diff)['index.html'],'<p id="error" role="alert"></p>\n');
 assert.throws(()=>applyPatch({'index.html':'changed\n'},diff),/context/);
 assert.throws(()=>applyPatch({'index.html':base},diff.replaceAll('index.html','../escape')),/allowlist/);
 assert.throws(()=>applyPatch({'index.html':base},diff.replace('role="alert"','role="alert" onclick="fetch(\'https://evil.test\')"')),/external|network/);
});
test('loopback is strict: one selected port, no credentials, redirects or remote protocols',()=>{
 assert.equal(allowLoopback('http://127.0.0.1:4321/?flow=seat',4321),true);
 for(const url of ['https://127.0.0.1:4321','http://localhost:4321','http://127.0.0.1:4322','http://127.0.0.1.evil:4321','file:///x','http://user@127.0.0.1:4321'])assert.equal(allowLoopback(url,4321),false,url);
});
test('tampered specs refuse before any provider/executor call',async()=>{
 let sends=0;const spec=encodeSpec(fixtures['run-spec'].valid);
 await assert.rejects(()=>runOfflineWorker({...spec,spec_sha256:'0'.repeat(64)},{execute:()=>sends++}),/hash/);
 assert.equal(sends,0);
});
test('offline worker preserves R2 provider limitations in a bounded hash-valid artifact',async()=>{
 const providers=createOfflineTransport();
 const out=await runOfflineWorker(encodeSpec(fixtures['run-spec'].valid),providers);
 assert.equal(out.capture.guarded_execution_verified,false);
 assert.equal(out.manifest.evidence_status,'incomplete');
 assert.equal(out.capture.source,'fake-nvda');
 assert.equal(verifyManifest(out.manifest,out.files).ok,true);
 assert.equal(out.files['capture.json'].length<=512000,true);
});
test('live gate refuses developer machines and independently unreviewed binding',()=>{
 assert.throws(()=>liveGate({},'a'.repeat(40)),/GitHub-hosted|BLOCK/);
 assert.throws(()=>liveGate({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows'},'a'.repeat(40)),/BLOCK|workflow/);
});
test('new worker workflow is read-only, secret-free, pinned and has no R1 edits',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/tabwise-run.yml',import.meta.url),'utf8');
 assert.match(workflow,/contents: read/);assert.doesNotMatch(workflow,/secrets\.|id-token:|pull_request_target/);
 for(const match of workflow.matchAll(/uses: ([^\s]+)/g))assert.match(match[1],/@[a-f0-9]{40}$/);
 assert.match(workflow,/windows-2025/);assert.match(workflow,/retention-days: 1/);
});
