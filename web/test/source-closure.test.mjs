import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
test('product review closure includes delivery CLI, source files, API, frozen vendor and runtime lock',()=>{
 const m=JSON.parse(execFileSync(process.execPath,['scripts/tabwise/product-source-closure.mjs'],{cwd:new URL('../../',import.meta.url),encoding:'utf8'}));
 assert.equal(m.authorizing,false);
 for(const path of ['scripts/tabwise/product-windows-boundary.mjs','src/r2/workflow-delivery.mjs','web/lib/server/native-integration.mjs','web/app/api/r2/product-binding/route.ts','vendor/guidepup-0.36.4-r1/lib/windows/NVDA/start.js','fixtures/r1/lock.json','web/package-lock.json'])assert.ok(m.files.some(f=>f.path===path),path);
 assert.equal(new Set(m.files.map(f=>f.path)).size,m.files.length);
});
