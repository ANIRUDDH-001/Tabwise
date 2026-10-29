import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateSnapshot} from '../lib/snapshot.mjs';
import {sha256} from '../../packages/contracts/index.mjs';
const snapshot=JSON.parse(readFileSync(new URL('../data/r1.json',import.meta.url),'utf8'));
function resign(value){delete value.snapshot_sha256;value.snapshot_sha256=sha256(JSON.stringify(value));return value;}
test('recomputed snapshot hashes cannot invent speech or replace historical R1 source',()=>{
 const altered=structuredClone(snapshot);altered.raw=['Invented speech'];assert.equal(validateSnapshot(resign(altered)).ok,false);
 const forged=structuredClone(snapshot),bytes=Buffer.from(JSON.stringify(['Invented speech']));forged.raw=['Invented speech'];forged.source_bytes['raw-1.json']=bytes.toString('base64');const file=forged.files.find(f=>f.path==='raw-1.json');file.sha256=sha256(bytes);file.bytes=bytes.length;
 assert.equal(validateSnapshot(resign(forged)).ok,false);
});
