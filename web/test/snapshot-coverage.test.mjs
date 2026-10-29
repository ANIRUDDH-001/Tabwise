import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sha256} from '../../packages/contracts/index.mjs';
import {validateSnapshot} from '../lib/snapshot.mjs';
test('a repeated trusted file cannot hide forged unlisted archived bytes',()=>{
 const snapshot=JSON.parse(readFileSync(new URL('../data/r1.json',import.meta.url),'utf8'));
 snapshot.files=Array.from({length:5},()=>({...snapshot.files.find(f=>f.path==='summary.json')}));
 snapshot.raw=['forged'];snapshot.source_bytes['raw-1.json']=Buffer.from(JSON.stringify(snapshot.raw)).toString('base64');
 delete snapshot.snapshot_sha256;snapshot.snapshot_sha256=sha256(JSON.stringify(snapshot));
 assert.equal(validateSnapshot(snapshot).ok,false);
});
