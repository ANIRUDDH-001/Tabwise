import {test} from 'node:test';
import assert from 'node:assert/strict';
import {oracleState} from '../lib/oracle-state.mjs';
test('rerun eligibility requires owned readback of the exact immutable check',()=>{
 const p={patch_id:'p',run_id:'b',base_sha256:'a'.repeat(64),finding:{step:2},oracle_available:true,oracle:null};
 assert.equal(oracleState(p),'absent');assert.equal(oracleState({...p,oracle_available:false}),'unavailable');
 const o={patch_id:'p',baseline_run_id:'b',base_sha256:p.base_sha256,kind:'focus',step:2,user_id:'owner',reviewed_by:'owner',review_ref:'Owner review'};
 assert.equal(oracleState({...p,oracle:o}),'registered');
 for(const change of [o=>o.patch_id='foreign',o=>o.base_sha256='b'.repeat(64),o=>o.step=3,o=>o.reviewed_by='foreign',o=>o.review_ref='']){const bad=structuredClone(o);change(bad);assert.equal(oracleState({...p,oracle:bad}),'unavailable');}
});
