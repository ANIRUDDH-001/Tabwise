// Read-only actual Windows observation on this Node process; no NVDA or desktop input.
import {test} from 'node:test';import assert from 'node:assert/strict';
import * as lifecycle from '../../scripts/tabwise/r2-nvda-lifecycle.mjs';import {sha256} from '../../packages/contracts/index.mjs';
test('actual Windows metadata query binds this process and binary bytes without starting NVDA',{skip:process.platform!=='win32'},async()=>{
 const {readFileSync}=await import('node:fs');const expected=await lifecycle.processIdentity(process.pid,{deadline:performance.now()+5000});
 const result=await lifecycle.processRuntimeMetadata(expected,{deadline:performance.now()+5000});
 assert.equal(result.pid,process.pid);assert.equal(result.product_version,process.versions.node);assert.equal(result.executable_sha256,sha256(readFileSync(process.execPath)));
});
