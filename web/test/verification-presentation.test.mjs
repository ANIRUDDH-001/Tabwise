import {test} from 'node:test';import assert from 'node:assert/strict';
import {pendingVerificationView} from '../lib/server/verification-presentation.mjs';
test('stored verification presents real run relationships without promoting an unreleased FIXED claim',()=>{
 const value=pendingVerificationView({id:'v',patch_id:'p',baseline_run_id:'b',verify_run_id:'a',verdict:'FIXED'},{id:'b',status:'completed'},{id:'a',status:'completed'},{id:'p',run_id:'b',status:'approved'});assert.equal(value.verdict,null);assert.equal(value.status,'pending');assert.equal(value.verify_run_id,'a');
});
test('verification presentation refuses mismatched stored source relationships',()=>{
 assert.throws(()=>pendingVerificationView({patch_id:'p',baseline_run_id:'b',verify_run_id:'a'},{id:'b'},{id:'other'},{id:'p',run_id:'b'}));
});
