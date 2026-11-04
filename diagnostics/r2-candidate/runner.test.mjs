import {test} from 'node:test';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {readFileSync} from 'node:fs';
import {assertChildCompleted,packetWindow} from './run.mjs';

test('bootstrap uses one clock reading so a millisecond boundary cannot exceed its one-hour ceiling',()=>{
 const now=1793818185575,window=packetWindow(now);
 assert.equal(window.issuedAt,new Date(now).toISOString());
 assert.equal(Date.parse(window.expiresAt)-Date.parse(window.issuedAt),3600000);
});
test('failed worker preserves its original cause instead of masking it with a missing session path',()=>{
 assert.throws(()=>assertChildCompleted({exit_code:2,outcome:'failed'},false),/inspect original stderr/);
 assert.throws(()=>assertChildCompleted({exit_code:0,outcome:'accepted'},false),/without original session/);
 assert.doesNotThrow(()=>assertChildCompleted({exit_code:0,outcome:'accepted'},true));
});
test('candidate entry refuses missing delivery/authorization before any native session',()=>{
 const r=spawnSync(process.execPath,['diagnostics/r2-candidate/run.mjs','--check-only'],{encoding:'utf8',windowsHide:true,timeout:10000,env:{...process.env,TABWISE_CANDIDATE_REQUEST_JSON:'',TABWISE_CANDIDATE_EXECUTION_APPROVAL:''}});
 assert.equal(r.status,2);assert.match(r.stderr,/candidate refused|BLOCK/);assert.equal(r.stdout,'');
});
test('candidate workflow separates bootstrap, native authorization and independent readback without OIDC',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/tabwise-r2-native-diagnostic.yml',import.meta.url),'utf8');
 assert.match(workflow,/candidate-checks:/);assert.match(workflow,/candidate-native:/);assert.match(workflow,/candidate-verify:/);
 assert.match(workflow,/!inputs\.candidate_mode && github\.run_attempt == 2/);
 assert.match(workflow,/inputs\.candidate_mode && github\.run_attempt == 2 && vars\.TABWISE_CANDIDATE_EXECUTION_APPROVAL/);
 assert.match(workflow,/TABWISE_CANDIDATE_REQUEST_JSON: \$\{\{ inputs\.candidate_request \}\}/);
 assert.match(workflow,/permissions:\s+contents: read/);assert.doesNotMatch(workflow,/id-token:|pull-requests: write|contents: write/);
 assert.match(workflow,/set -o pipefail/);assert.doesNotMatch(workflow,/run:.*\$\{\{ inputs\.candidate_request/);
 assert.match(workflow,/path: \$\{\{ runner\.temp \}\}\/tabwise-r2-candidate\//);assert.doesNotMatch(workflow,/tabwise-r2-candidate-\*\//);
 const native=workflow.slice(workflow.indexOf('  candidate-native:'),workflow.indexOf('  candidate-verify:'));
 assert.ok(native.indexOf('run: npm ci --ignore-scripts')<native.indexOf('run: node diagnostics/r2-candidate/run.mjs --check-only'),'frozen dependency integrity requires lockfile installation before candidate preflight');
 assert.ok(native.indexOf('run: node diagnostics/r2-candidate/run.mjs --check-only')<native.indexOf('guidepup setup'),'authorization and full integrity must precede native setup');
});
test('candidate worker accepts W5 IPC before protected loading and reuses existing custody',()=>{
 const code=readFileSync(new URL('./run.mjs',import.meta.url),'utf8');
 assert.ok(code.indexOf('await requestPageAdmission(')>=0);assert.ok(code.indexOf("import('../../scripts/tabwise/r2-loader.mjs')")>code.indexOf('await requestPageAdmission('));
 assert.match(code,/runR2Pages\(\{/);assert.match(code,/processBaseline\(tools\)/);assert.match(code,/r2RunSealable\(outcome\)/);assert.doesNotMatch(code,/\.kill\(/);
});
