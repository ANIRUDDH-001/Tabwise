import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {R2_FILES} from '../../scripts/tabwise/r2-policy.mjs';
test('hosted source inventory carries the entire enforced native and repair integrity scope',()=>{
 const files=JSON.parse(readFileSync(new URL('../r2-trace-files.json',import.meta.url),'utf8'));
 const missing=R2_FILES.filter(p=>!files.includes(p));
 assert.deepEqual(missing,[], 'a deployment must be able to recheck every reviewed file');
 assert.equal(new Set(files).size,files.length);
});
