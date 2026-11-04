import {test} from 'node:test';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {readFileSync} from 'node:fs';
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
});
test('candidate worker accepts W5 IPC before protected loading and reuses existing custody',()=>{
 const code=readFileSync(new URL('./run.mjs',import.meta.url),'utf8');
 assert.ok(code.indexOf('await requestPageAdmission(')>=0);assert.ok(code.indexOf("import('../../scripts/tabwise/r2-loader.mjs')")>code.indexOf('await requestPageAdmission('));
 assert.match(code,/runR2Pages\(\{/);assert.match(code,/processBaseline\(tools\)/);assert.match(code,/r2RunSealable\(outcome\)/);assert.doesNotMatch(code,/\.kill\(/);
});
