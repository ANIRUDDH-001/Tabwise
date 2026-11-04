import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sha256} from '../../packages/contracts/index.mjs';
const root=new URL('../../fixtures/fernway/',import.meta.url);
for(const path of ['','instrumented-v2/'])test('Fernway '+(path||'historical')+' manifest binds normalized source independently',()=>{
 const manifest=JSON.parse(readFileSync(new URL(path+'manifest.json',root))),bytes=Buffer.from(readFileSync(new URL(path+'index.html',root),'utf8').replaceAll('\r\n','\n'));
 assert.equal(sha256(bytes),manifest.base_sha256);assert.equal(manifest.files[0].sha256,sha256(bytes));assert.equal(manifest.files[0].bytes,bytes.length);
 if(!path)assert.equal(manifest.base_sha256,'5ad4631558cdcc557770ae864957ffc167546cd0af58bd11258808e1c0e523be');
 else{assert.equal(manifest.historical_source_sha256,'5ad4631558cdcc557770ae864957ffc167546cd0af58bd11258808e1c0e523be');assert.notEqual(manifest.base_sha256,manifest.historical_source_sha256);}
});
