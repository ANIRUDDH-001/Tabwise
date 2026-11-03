import test from 'node:test';
import assert from 'node:assert/strict';
import {buildR2ProductExport} from '../src/r2/product-export.mjs';
import {observationFixture} from '../web/test/helpers/r2-bridge-fixture.mjs';
import {sha256} from '../packages/contracts/index.mjs';
const json=x=>Buffer.from(JSON.stringify(x));
function fixture(){
 const f=observationFixture();delete f.files['r2-export.json'];
 const p=JSON.parse(f.files['p1/manifest.json']);
 f.files['p1/observations.jsonl']=f.files['observations.jsonl'];delete f.files['observations.jsonl'];
 p.files.push({path:'observations.jsonl',sha256:sha256(f.files['p1/observations.jsonl']),bytes:f.files['p1/observations.jsonl'].length});
 f.files['p1/manifest.json']=json(p);f.files['p1/manifest.sha256']=Buffer.from(sha256(f.files['p1/manifest.json'])+'  manifest.json\n');
 const r=JSON.parse(f.files['run-manifest.json']);r.pages[0].manifest_sha256=sha256(f.files['p1/manifest.json']);
 f.files['run-manifest.json']=json(r);f.files['run-manifest.sha256']=Buffer.from(sha256(f.files['run-manifest.json'])+'  run-manifest.json\n');
 f.expected.page_manifest_sha256=sha256(f.files['p1/manifest.json']);f.expected.run_manifest_sha256=sha256(f.files['run-manifest.json']);return f;
}
const build=f=>buildR2ProductExport({files:f.files,expected:f.expected,stage_timings:f.exp.stage_timings});
test('export preserves bytes, observations and line references without native promotion',()=>{const f=fixture(),before=structuredClone(f.files),r=build(f);assert.equal(r.source_verified,false);assert.deepEqual(r.export.observations,[1,2,3].map(line=>({path:'p1/observations.jsonl',line})));for(const p of Object.keys(before))assert.deepEqual(r.files[p],Buffer.from(before[p]));assert.equal(f.files['r2-export.json'],undefined);});
for(const [name,mutate] of [
 ['omitted telemetry',f=>{f.files['p1/observations.jsonl']=Buffer.from('');}],
 ['digest drift',f=>{f.files['fixture.html']=Buffer.from('drift');}],
 ['mismatched spec',f=>{f.expected.spec.run_id='00000000-0000-4000-8000-000000000002';}],
 ['orphaned source',f=>{f.files['orphan.jsonl']=f.files['p1/observations.jsonl'];}],
 ['interrupted capture',f=>{f.files['p1/capture.json']=json({completed:false});}],
 ['forged NVDA source',f=>{f.files['p1/capture.json']=json({...JSON.parse(f.files['p1/capture.json']),source:'synthetic'});}],
 ['malformed source',f=>{f.files['p1/observations.jsonl']=Buffer.from('{');}],
 ['duplicate sequence',f=>{const rows=f.files['p1/observations.jsonl'].toString().trim().split('\n').map(JSON.parse);rows[2].event.seq=1;f.files['p1/observations.jsonl']=Buffer.from(rows.map(JSON.stringify).join('\n')+'\n');}],
 ['stale sequence',f=>{const rows=f.files['p1/observations.jsonl'].toString().trim().split('\n').map(JSON.parse);rows[2].event.t=1;f.files['p1/observations.jsonl']=Buffer.from(rows.map(JSON.stringify).join('\n')+'\n');}],
])test(name,()=>{const f=fixture();mutate(f);assert.throws(()=>build(f));});
