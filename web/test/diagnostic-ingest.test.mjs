import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as ingest from '../lib/server/diagnostic-ingest.mjs';
import {reconcileRun} from '../lib/server/reconcile.mjs';
import {fixtures} from '../../packages/contracts/fixtures.mjs';
import {sha256} from '../../packages/contracts/index.mjs';
function zip(files){const parts=[],central=[];let offset=0;for(const [name,data] of Object.entries(files)){const label=Buffer.from(name),local=Buffer.alloc(30),entry=Buffer.alloc(46);local.writeUInt32LE(0x04034b50);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(label.length,26);entry.writeUInt32LE(0x02014b50);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(label.length,28);entry.writeUInt32LE(offset,42);parts.push(local,label,data);central.push(entry,label);offset+=local.length+label.length+data.length;}const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...parts,directory,end]);}
function sample(){const manifest=structuredClone(fixtures['artifact-manifest'].valid),evidence=structuredClone(fixtures['evidence-bundle'].valid);evidence.provenance='observed-nvda';const bytes=Buffer.from(JSON.stringify(evidence));manifest.files=[{path:'evidence.json',sha256:sha256(bytes),bytes:bytes.length,kind:'evidence'}];manifest.evidence_sha256=sha256(bytes);const remoteRun={id:1,run_attempt:1,path:manifest.runner.workflow,event:manifest.runner.event,head_branch:'main',head_sha:manifest.runner.head_sha,actor:{login:manifest.runner.actor},display_title:`tabwise ${manifest.run_id}`};return {manifest,evidence,bytes,remoteRun,expected:{sha:remoteRun.head_sha,actor:remoteRun.actor.login,run_id:manifest.run_id,spec_sha256:manifest.spec_sha256}};}
test('authenticated partial evidence is retained under a diagnostic-only path and cannot become a score',async()=>{
 const s=sample(),manifestBytes=Buffer.from(JSON.stringify(s.manifest)),stores=[];
 const result=await ingest.ingestDiagnosticArchive({...s,archive:zip({'manifest.json':manifestBytes,'evidence.json':s.bytes}),workerReview:'PASS',store:async(path,data)=>stores.push({path,data}),record:async manifest=>assert.equal(manifest.evidence_status,'incomplete')});
 assert.equal(result.complete,false);assert.equal(result.classification,'INCONCLUSIVE');assert.equal(result.diagnostic_only,true);
 assert.equal(stores.length,2);assert.equal(stores[0].path,`${s.expected.run_id}/diagnostics/1/manifest.json`);assert.ok(stores[0].data.equals(manifestBytes));
 let writes=0;await assert.rejects(()=>ingest.ingestDiagnosticArchive({...s,remoteRun:{...s.remoteRun,run_attempt:2},archive:zip({'manifest.json':manifestBytes,'evidence.json':s.bytes}),workerReview:'PASS',store:async()=>writes++,record:async()=>{}}));assert.equal(writes,0);
});
test('failed workers retain bounded diagnostic evidence while remaining failed and incomplete',async()=>{
 const calls=[];const api={claim:async()=>true,status:async()=>({status:'completed',conclusion:'failure',rate_remaining:5000}),transition:async(...args)=>calls.push(['transition',...args]),ingestPartial:async()=>{calls.push(['partial']);return {diagnostic_only:true};}};
 const result=await reconcileRun({id:'a',status:'running',gh_run_id:'1',deadline_at:'2099-01-01',evidence_status:'incomplete'},api);
 assert.equal(result.status,'failed');assert.equal(result.evidence_status,'incomplete');assert.equal(result.diagnostic_evidence_available,true);assert.equal(calls[0][0],'partial');assert.equal(calls.some(call=>call.includes('completed')),false);
});
test('diagnostic ingest failure cannot hide the original worker failure or promote evidence',async()=>{
 const api={claim:async()=>true,status:async()=>({status:'completed',conclusion:'failure',rate_remaining:5000}),transition:async()=>{},ingestPartial:async()=>{throw Error('tampered');}};
 const result=await reconcileRun({id:'a',status:'running',gh_run_id:'1',deadline_at:'2099-01-01'},api);assert.equal(result.status,'failed');assert.equal(result.reason,'worker_failed');assert.equal(result.diagnostic_evidence_available,false);assert.equal(result.evidence_status,'incomplete');
});
