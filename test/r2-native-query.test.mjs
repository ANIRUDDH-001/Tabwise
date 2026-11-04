// Offline raw evidence integrity only: no native execution or complete capture claim.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createR2EvidenceWriter,verifyR2PageEvidence} from '../scripts/tabwise/r2-evidence.mjs';
import {sha256} from '../packages/contracts/index.mjs';
const fixture=Buffer.from('<!doctype html><title>Owned query</title><button>Go</button>');
for(const flow of ['passenger','seat','search'])for(const variant of ['healthy','broken'])test('sealed evidence independently reconstructs approved '+flow+'/'+variant+' identity',async()=>{
 const parent=mkdtempSync(join(tmpdir(),'tw-native-query-')),dir=join(parent,'page');
 const approved={query:`?flow=${flow}&variant=${variant}`,fixture_sha256:sha256(fixture),task:[{step:'go',press:'Tab'}]};
 try{
  const writer=createR2EvidenceWriter({enabled:true,dir,fixture,approved,page:{fixture_id:'product',session:'offline-query',port:4100},nonce:'01234567',spec:{actions:1,ackMs:1000,timeoutMs:100,observationMs:10,pollMs:10}});
  const sealed=await writer.seal();assert.equal(sealed.class,'incomplete','missing native capture stays incomplete');
  const verified=await verifyR2PageEvidence(dir,{fixture,approved});assert.equal(verified.ok,true,verified.errors.join('; '));assert.equal(verified.class,'incomplete');
  const substituted=await verifyR2PageEvidence(dir,{fixture,approved:{...approved,query:`?flow=${flow}&variant=${variant==='healthy'?'broken':'healthy'}`}});assert.equal(substituted.ok,false);
  const m=JSON.parse(readFileSync(join(dir,'manifest.json')));m.page.url+='&unexpected=1';const bytes=Buffer.from(JSON.stringify(m));writeFileSync(join(dir,'manifest.json'),bytes);writeFileSync(join(dir,'manifest.sha256'),sha256(bytes)+'  manifest.json\n');
  assert.equal((await verifyR2PageEvidence(dir,{fixture,approved})).ok,false,'rehashed unsupported query stays refused');
 }finally{rmSync(parent,{recursive:true,force:true});}
});
