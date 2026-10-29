import {assertContract,sha256,verifyManifest} from '../../../packages/contracts/index.mjs';

// Read only already-ingested, owner-authorized records. No worker reconciliation or external call.
export async function readRunEvidence({run,metadata,download}){
 if(!Array.isArray(metadata)||metadata.length>200)throw Error('bounded artifact metadata required');
 const complete=run.status==='completed'&&run.evidence_status==='complete';
 const attempts=[...new Set(metadata.map(f=>/^diagnostics\/([1-9][0-9]*)\//.exec(f.path)?.[1]).filter(Boolean))].sort((a,b)=>Number(b)-Number(a));
 const prefix=complete?'':attempts.length?`diagnostics/${attempts[0]}/`:null;
 if(prefix===null||!metadata.some(f=>f.kind==='evidence'&&f.path.startsWith(prefix)&&!(!prefix&&f.path.startsWith('diagnostics/'))))return null;
 const bytes=await download(`${run.id}/${prefix}manifest.json`);if(!bytes||bytes.length>65536)throw Error('manifest unavailable');
 const manifest=assertContract('artifact-manifest',JSON.parse(Buffer.from(bytes).toString('utf8')));
 if(manifest.run_id!==run.id||manifest.spec_sha256!==run.spec_sha256||manifest.runner.github_run_id!==String(run.gh_run_id)||manifest.runner.head_sha!==run.gh_head_sha||prefix&&prefix!==`diagnostics/${manifest.runner.github_run_attempt}/`)throw Error('stored artifact identity mismatch');
 const files={},anchored=metadata.filter(f=>prefix?f.path.startsWith(prefix):!f.path.startsWith('diagnostics/'));
 if(anchored.length!==manifest.files.length||manifest.files.filter(f=>f.kind==='evidence').length!==1)throw Error('artifact metadata coverage mismatch');
 let total=0;
 for(const file of manifest.files){
  const rows=anchored.filter(row=>row.path===prefix+file.path);if(rows.length!==1||rows[0].sha256!==file.sha256||rows[0].bytes!==file.bytes||rows[0].kind!==file.kind)throw Error('stored artifact hash anchor mismatch');
  total+=file.bytes;if(total>4000000)throw Error('artifact byte cap');
  const bytes=await download(`${run.id}/${prefix}${file.path}`);if(!bytes||bytes.length!==file.bytes||sha256(bytes)!==file.sha256)throw Error('stored artifact bytes mismatch');files[file.path]=bytes;
 }
 if(!verifyManifest(manifest,files).ok)throw Error('stored manifest integrity failed');
 const entry=manifest.files.find(f=>f.kind==='evidence'),evidence=assertContract('evidence-bundle',JSON.parse(Buffer.from(files[entry.path]).toString('utf8')));
 if(evidence.run_id!==run.id||evidence.provenance!=='observed-nvda'||sha256(files[entry.path])!==manifest.evidence_sha256)throw Error('stored evidence provenance mismatch');
 if(complete&&(manifest.evidence_status!=='complete'||evidence.evidence_status!=='complete'))throw Error('incomplete stored evidence');
 const refs=new Set();for(const event of Object.values(evidence.lanes).flat()){
  if(refs.has(event.evidence_ref))throw Error('duplicate evidence reference');refs.add(event.evidence_ref);
  if(event.artifact_path&&!manifest.files.some(file=>file.path===event.artifact_path))throw Error('unlisted evidence asset');
 }
 return {complete,classification:complete?'COMPLETE_OBSERVATION':'INCONCLUSIVE',prefix,evidence,runner:manifest.runner,manifest_sha256:sha256(bytes),artifacts:manifest.files,files};
}

export function screenshotBytes(result,path){
 const row=result.artifacts.find(row=>row.path===path&&row.kind==='screenshot');
 if(!row||!result.evidence.lanes.screenshots.some(event=>event.artifact_path===path))throw Error('screenshot not referenced');
 const bytes=Buffer.from(result.files[path]);
 if(bytes.subarray(0,4).toString()!=='RIFF'||bytes.subarray(8,12).toString()!=='WEBP')throw Error('unsupported screenshot encoding');
 return bytes;
}
