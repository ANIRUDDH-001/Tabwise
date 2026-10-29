import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ingestArchive} from '../lib/server/artifact-ingest.mjs';
import {fixtures} from '../../packages/contracts/fixtures.mjs';
import {sha256} from '../../packages/contracts/index.mjs';
function storedZip(files){const parts=[],central=[];let offset=0;for(const [name,data] of Object.entries(files)){const label=Buffer.from(name),local=Buffer.alloc(30),entry=Buffer.alloc(46);local.writeUInt32LE(0x04034b50);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(label.length,26);entry.writeUInt32LE(0x02014b50);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(label.length,28);entry.writeUInt32LE(offset,42);parts.push(local,label,data);central.push(entry,label);offset+=local.length+label.length+data.length;}const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...parts,directory,end]);}
test('qualified ingest preserves the authenticated original manifest alongside file bytes',async()=>{
 const evidence={...fixtures['evidence-bundle'].valid,provenance:'observed-nvda',evidence_status:'complete'};
 const bytes=Buffer.from(JSON.stringify(evidence)),manifest=structuredClone(fixtures['artifact-manifest'].valid);
 manifest.files=[{path:'evidence.json',sha256:sha256(bytes),bytes:bytes.length,kind:'evidence'}];manifest.evidence_status='complete';manifest.evidence_sha256=sha256(bytes);
 const manifestBytes=Buffer.from(JSON.stringify(manifest)),stored=[];
 const remote={id:1,run_attempt:1,path:'.github/workflows/tabwise-run.yml',event:'workflow_dispatch',head_branch:'main',head_sha:manifest.runner.head_sha,actor:{login:manifest.runner.actor},display_title:`tabwise ${manifest.run_id}`};
 await ingestArchive({archive:storedZip({'manifest.json':manifestBytes,'evidence.json':bytes}),remoteRun:remote,expected:{run_id:manifest.run_id,actor:manifest.runner.actor,sha:manifest.runner.head_sha,spec_sha256:manifest.spec_sha256},workerReview:'PASS',store:async(path,data)=>stored.push({path,data}),record:async()=>{}});
 const saved=stored.find(s=>s.path.endsWith('/manifest.json'));assert.ok(saved);assert.ok(saved.data.equals(manifestBytes));
});
