import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ingestArchive} from '../lib/server/artifact-ingest.mjs';
import {ingestDiagnosticArchive} from '../lib/server/diagnostic-ingest.mjs';
import {fixtures} from '../../packages/contracts/fixtures.mjs';
import {sha256} from '../../packages/contracts/index.mjs';
import {reconcileRun} from '../lib/server/reconcile.mjs';
import * as storage from '../lib/server/artifact-store.mjs';
function zip(files){const parts=[],central=[];let offset=0;for(const [name,data] of Object.entries(files)){const label=Buffer.from(name),local=Buffer.alloc(30),entry=Buffer.alloc(46);local.writeUInt32LE(0x04034b50);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(label.length,26);entry.writeUInt32LE(0x02014b50);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(label.length,28);entry.writeUInt32LE(offset,42);parts.push(local,label,data);central.push(entry,label);offset+=local.length+label.length+data.length;}const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...parts,directory,end]);}
function input(){const manifest=structuredClone(fixtures['artifact-manifest'].valid),evidence={...fixtures['evidence-bundle'].valid,provenance:'observed-nvda',evidence_status:'complete'};const bytes=Buffer.from(JSON.stringify(evidence));manifest.evidence_status='complete';manifest.evidence_sha256=sha256(bytes);manifest.files=[{path:'evidence.json',sha256:sha256(bytes),bytes:bytes.length,kind:'evidence'}];return {archive:zip({'manifest.json':Buffer.from(JSON.stringify(manifest)),'evidence.json':bytes}),remoteRun:{id:1,run_attempt:1,path:manifest.runner.workflow,event:manifest.runner.event,head_branch:'main',head_sha:manifest.runner.head_sha,actor:{login:manifest.runner.actor},display_title:`tabwise ${manifest.run_id}`},expected:{run_id:manifest.run_id,sha:manifest.runner.head_sha,actor:manifest.runner.actor,spec_sha256:manifest.spec_sha256},workerReview:'PASS'};}
for(const [kind,ingest] of [['complete',ingestArchive],['diagnostic',ingestDiagnosticArchive]]){
 test(`N5 ${kind}: second store failure cleans both known and uncertain writes, without recording artifacts`,async()=>{
  const args=input(),cleanup=[],evidence=[];let writes=0,records=0;
  await assert.rejects(()=>ingest({...args,store:async()=>{if(++writes===2)throw Error('store unavailable');},record:async()=>records++,cleanup:async(prefix,paths)=>cleanup.push({prefix,paths}),recordCleanup:async e=>evidence.push(e)}),error=>{assert.equal(error.artifact_cleanup_pending,false);return /store unavailable/.test(error.message);});
  assert.equal(records,0);assert.equal(cleanup.length,1);assert.equal(cleanup[0].paths.length,2);assert.equal(cleanup[0].paths.every(path=>path.startsWith(cleanup[0].prefix+'/')),true);assert.equal(evidence[0].artifact_cleanup_pending,false);
 });
 test(`N5 ${kind}: cleanup failure retains original error plus explicit pending evidence`,async()=>{
  const evidence=[];let writes=0;
  await assert.rejects(()=>ingest({...input(),store:async()=>{if(++writes===2)throw Error('store failed');},record:async()=>{},cleanup:async()=>{throw Error('cleanup failed');},recordCleanup:async e=>evidence.push(e)}),error=>{assert.equal(error.artifact_cleanup_pending,true);assert.equal(error.cleanup_evidence_recorded,true);return /store failed/.test(error.message);});
  assert.equal(evidence.length,1);assert.equal(evidence[0].artifact_cleanup_pending,true);assert.equal(evidence[0].paths.length,2);
 });
}
test('N5 reconciler retains cleanup-pending evidence without promoting a failed ingest',async()=>{
 const error=Object.assign(new Error('store'),{artifact_cleanup_pending:true});
 const api={claim:async()=>true,status:async()=>({status:'completed',conclusion:'success',rate_remaining:5000}),transition:async()=>{},ingest:async()=>{throw error;}};
 const result=await reconcileRun({id:'a',status:'running',gh_run_id:'1',deadline_at:'2099-01-01'},api);
 assert.equal(result.status,'failed');assert.equal(result.evidence_status,'incomplete');assert.equal(result.artifact_cleanup_pending,true);
});
test('N5 ambiguous metadata settlement resets incomplete run evidence as well as removing blobs/metadata',async()=>{
 const run={id:'owned-run',evidence_status:'complete'},removed=[],metadata=[],audits=[];
 const db={storage:{from:()=>({remove:async paths=>{removed.push(...paths);return {error:null};}})},from:table=>{
  if(table==='artifacts')return {delete:()=>({eq:(field,id)=>({in:async(field,paths)=>{assert.equal(id,run.id);metadata.push(...paths);return {error:null};}})})};
  if(table==='runs')return {update:value=>({eq:(field,id)=>({neq:async(field,value2)=>{assert.equal(id,run.id);assert.equal(value2,'completed');Object.assign(run,value);return {error:null};}})})};
  return {insert:async evidence=>{audits.push(evidence);return {error:null};}};
 }};
 const compensation=storage.createArtifactCompensation(db,run.id);
 await compensation.cleanup(run.id,[`${run.id}/manifest.json`,`${run.id}/evidence.json`]);
 assert.equal(run.evidence_status,'incomplete');assert.equal(removed.length,2);assert.deepEqual(metadata,['manifest.json','evidence.json']);
 await compensation.recordCleanup({prefix:run.id,paths:removed,artifact_cleanup_pending:false});assert.equal(audits[0].subject,run.id);
});
