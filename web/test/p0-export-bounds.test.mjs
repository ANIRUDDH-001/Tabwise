import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureObservationSources} from '../../src/r2/capture-export.mjs';
import {sha256} from '../../packages/contracts/index.mjs';
function fixture(event){const c={schema:'r2-capture/1',fixture_id:'p1',completed:true,outcome:'COMPLETE',source:'nvda',reasons:[],raw:[],records:[{step:'a1',press:'Enter',capture_status:'observed-silence',reasons:[],ack_seq:1,raw_seq:[],page:{events:[{seq:1,t:1,type:'keydown',target:'button#1',...event}],after:{}}}]};const b=Buffer.from(JSON.stringify(c));return {files:{'p1/capture.json':b,'p1/manifest.json':Buffer.from(JSON.stringify({files:[{path:'capture.json',sha256:sha256(b),bytes:b.length}],step_map:{actions:[{action:'a1',task:'go',press:'Enter'}]}}))},expected:{page_id:'p1',session:'s',spec:{steps:[{step:1,key:'Enter'}]}}};}
test('native export refuses over-bound targets without truncation',()=>{assert.throws(()=>captureObservationSources(fixture({target:'x'.repeat(201)})),/target.*200/);assert.equal(captureObservationSources(fixture({target:'x'.repeat(200)})).length,1);});
test('native export refuses rich identity text over 16000 characters',()=>{assert.throws(()=>captureObservationSources(fixture({identity_version:2,active_identity:{name:'x'.repeat(16001)}})),/text.*16000/);});
