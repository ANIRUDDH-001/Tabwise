import test from 'node:test';
import assert from 'node:assert/strict';
import {captureJourney} from '../src/r2/capture.mjs';
import {captureObservationSources} from '../src/r2/capture-export.mjs';
import {sha256} from '../packages/contracts/index.mjs';
async function produced(){
 let t=1;const events=[],phrases=[];
 const c=await captureJourney({fixture_id:'p1',actions:[{step:'a1',press:'Tab'}],observationMs:10,pollMs:5,timeoutMs:100,clock:{now:()=>t,wait:async ms=>{t+=ms;}},speech:{read:async()=>({source:'nvda',session:'speech',connected:true,complete:true,phrases:[...phrases]})},page:{read:async()=>({session:'page',complete:true,clock:'page-monotonic-ms',t,active:'go',state:{},events:structuredClone(events)})},execute:async()=>{events.push({seq:1,t,type:'keydown',key:'Tab',shift:false,target:'go'},{seq:2,t,type:'focusin',target:'go'},{seq:3,t,type:'app',target:'go',detail:{saved:true}});phrases.push('Go button');}});
 assert.equal(c.completed,true);
 const bytes=Buffer.from(JSON.stringify(c));
 const files={'p1/capture.json':bytes,'p1/manifest.json':Buffer.from(JSON.stringify({files:[{path:'capture.json',sha256:sha256(bytes),bytes:bytes.length}],step_map:{actions:[{action:'a1',task:'go',press:'Tab'}]}}))};
 return {files,expected:{page_id:'p1',session:'page',spec:{steps:[{step:1,key:'Tab'}]}}};
}
test('real capture serialization projects exact source pointers and preserves both clocks',async()=>{
 const f=await produced(),before=Buffer.from(f.files['p1/capture.json']),rows=captureObservationSources(f);
 assert.deepEqual(rows.map(x=>x.row.lane),['keys','focus','app_events','speech']);
 for(const x of rows){let raw=JSON.parse(before);for(const key of x.pointer.pointer.slice(1).split('/'))raw=raw[key];assert.equal(x.row.event.seq,raw.seq);assert.equal(x.row.event.t,raw.t??raw.received.t);}
 assert.equal(rows[3].row.event.text,'Go button');assert.deepEqual(f.files['p1/capture.json'],before);
});
for(const [name,mutate] of [['synthetic',c=>c.source='fake-nvda'],['incomplete',c=>c.completed=false],['missing ack',c=>c.records[0].ack_seq=99],['unbound speech',c=>c.records[0].raw_seq=[]]])test(name+' is refused after reserialization',async()=>{const f=await produced(),c=JSON.parse(f.files['p1/capture.json']);mutate(c);const b=Buffer.from(JSON.stringify(c));f.files['p1/capture.json']=b;const m=JSON.parse(f.files['p1/manifest.json']);m.files[0]={path:'capture.json',sha256:sha256(b),bytes:b.length};f.files['p1/manifest.json']=Buffer.from(JSON.stringify(m));assert.throws(()=>captureObservationSources(f));});
import {observationFixture} from '../web/test/helpers/r2-bridge-fixture.mjs';
import {buildR2ProductExport} from '../src/r2/product-export.mjs';
import {inspectR2ProductExport,openQualifiedR2ProductEvidence} from '../src/r2/product-bridge.mjs';
test('captureJourney bytes reach exporter and independent bridge without native promotion',async()=>{
 const producedInput=await produced(),f=observationFixture();delete f.files['r2-export.json'];delete f.files['observations.jsonl'];
 f.files['p1/capture.json']=producedInput.files['p1/capture.json'];
 const p=JSON.parse(f.files['p1/manifest.json']);p.files=[{path:'capture.json',sha256:sha256(f.files['p1/capture.json']),bytes:f.files['p1/capture.json'].length}];
 f.files['p1/manifest.json']=Buffer.from(JSON.stringify(p));f.files['p1/manifest.sha256']=Buffer.from(sha256(f.files['p1/manifest.json'])+'  manifest.json\n');
 const r=JSON.parse(f.files['run-manifest.json']);r.pages[0].manifest_sha256=sha256(f.files['p1/manifest.json']);f.files['run-manifest.json']=Buffer.from(JSON.stringify(r));f.files['run-manifest.sha256']=Buffer.from(sha256(f.files['run-manifest.json'])+'  run-manifest.json\n');
 f.expected.page_manifest_sha256=sha256(f.files['p1/manifest.json']);f.expected.run_manifest_sha256=sha256(f.files['run-manifest.json']);
 // The surrounding run identity is a generated fixture, never native attestation.
 const result=buildR2ProductExport({files:f.files,expected:f.expected,stage_timings:f.exp.stage_timings});
 const input={files:result.files,expected:f.expected},inspected=inspectR2ProductExport(input);
 assert.equal(inspected.ok,true,inspected.errors.join(';'));assert.equal(inspected.source_verified,false);
 assert.equal(inspected.preview.evidence.evidence_status,'incomplete');assert.equal(inspected.preview.evidence.lanes.speech[0].text,'Go button');
 assert.throws(()=>openQualifiedR2ProductEvidence(input),/qualification disabled/);
 const exp=JSON.parse(result.files['r2-export.json']);exp.observations.pop();result.files['r2-export.json']=Buffer.from(JSON.stringify(exp));
 assert.match(inspectR2ProductExport(input).errors.join(';'),/coverage/);
});
