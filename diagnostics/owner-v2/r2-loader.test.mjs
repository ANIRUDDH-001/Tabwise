import {test} from 'node:test';import assert from 'node:assert/strict';
import {loadR2Runtime} from '../../scripts/tabwise/r2-loader.mjs';
test('real R2 import is authentic, unarmed and one-shot even under concurrent calls',async()=>{
 const first=loadR2Runtime(),second=loadR2Runtime();await assert.rejects(second,/one-shot/);const runtime=await first;
 runtime.assertAuthentic();assert.equal(runtime.guard.status().sends,0);assert.equal(runtime.observedProcess(),null);
 await assert.rejects(loadR2Runtime(),/one-shot/);await assert.rejects(runtime.relayOwnerPid(),/owned/);
});
