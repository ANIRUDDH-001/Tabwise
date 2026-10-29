import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {readArtifactZip} from '../lib/server/artifact-zip.mjs';
function zip(name,body,{claimed=body.length,method=8}={}){
 const label=Buffer.from(name),data=method===8?deflateRawSync(body):body;
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(method,8);local.writeUInt32LE(data.length,18);local.writeUInt32LE(claimed,22);local.writeUInt16LE(label.length,26);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(method,10);central.writeUInt32LE(data.length,20);central.writeUInt32LE(claimed,24);central.writeUInt16LE(label.length,28);
 const start=local.length+label.length+data.length,eocd=Buffer.alloc(22);eocd.writeUInt32LE(0x06054b50);eocd.writeUInt16LE(1,8);eocd.writeUInt16LE(1,10);eocd.writeUInt32LE(central.length+label.length,12);eocd.writeUInt32LE(start,16);
 return Buffer.concat([local,label,data,central,label,eocd]);
}
test('bounded ZIP accepts stored/deflated entries without filesystem extraction',()=>{
 for(const method of [0,8]){const files=readArtifactZip(zip('evidence.json',Buffer.from('{}'),{method}));assert.equal(files['evidence.json'].toString(),'{}');}
});
test('ZIP paths, truncation, unsupported methods and bombs are refused',()=>{
 for(const path of ['../escape','/absolute','a\\b','.git/config'])assert.throws(()=>readArtifactZip(zip(path,Buffer.from('{}'))));
 assert.throws(()=>readArtifactZip(Buffer.from('not a zip')));
 assert.throws(()=>readArtifactZip(zip('a.json',Buffer.from('{}'),{method:99})));
 assert.throws(()=>readArtifactZip(zip('a.json',Buffer.alloc(4000001),{claimed:1})),/size|length|large|output/i);
});
