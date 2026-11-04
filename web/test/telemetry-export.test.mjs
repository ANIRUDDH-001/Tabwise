import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureJourney} from '../../src/r2/capture.mjs';
import {captureObservationSources} from '../../src/r2/capture-export.mjs';
import {sha256} from '../../packages/contracts/index.mjs';
test('sealed v2 capture projection retains source, radio identity and later terminal focus without rewriting raw bytes',async()=>{
 let t=1;const events=[],identity={available:true,tag:'input',input_type:'radio',id:null,node_key:'input#1',is_body:false,connected:true};
 const c=await captureJourney({fixture_id:'p1',actions:[{step:'a1',press:'Enter'}],observationMs:10,pollMs:5,timeoutMs:100,clock:{now:()=>t,wait:async ms=>{t+=ms;}},speech:{read:async()=>({source:'nvda',session:'synthetic-speech',connected:true,complete:true,phrases:[]})},page:{read:async()=>({identity_version:2,active_identity:identity,session:'page',complete:true,clock:'page-monotonic-ms',t,active:'input#1',state:{},events:structuredClone(events)})},execute:async()=>{events.push({seq:1,t,type:'keydown',key:'Enter',shift:false,target:'input#1',active:'input#1',identity_version:2,source:'runner-page-recorder',target_identity:identity,active_identity:identity});}});
 assert.equal(c.completed,true);const bytes=Buffer.from(JSON.stringify(c)),files={'p1/capture.json':bytes,'p1/manifest.json':Buffer.from(JSON.stringify({files:[{path:'capture.json',sha256:sha256(bytes),bytes:bytes.length}],step_map:{actions:[{action:'a1',task:'radio',press:'Enter'}]}}))};
 const rows=captureObservationSources({files,expected:{page_id:'p1',session:'page',spec:{steps:[{step:1,key:'Enter'}]}}});const text=JSON.parse(rows[0].row.event.text);
 assert.equal(text.active_identity.input_type,'radio');assert.equal(text.active_identity.is_body,false);assert.equal(text.source,'runner-page-recorder');assert.deepEqual(text.terminal_focus,c.records[0].page.after);assert.equal(text.terminal_focus_source,'/records/0/page/after');assert.deepEqual(files['p1/capture.json'],bytes);
});
