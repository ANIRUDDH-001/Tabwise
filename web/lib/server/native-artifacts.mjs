import {sha256} from '../../../packages/contracts/index.mjs';
import {parseUniqueJson} from '../../../src/r2/strict-json.mjs';
import {matchNativeProductRun,selectNativeArtifacts} from '../../../src/r2/product-dispatch.mjs';
import {readVerifiedHostedProvenance} from '../../../src/r2/provenance.mjs';
import {openQualifiedR2ProductEvidence,readQualifiedR2ProductEvidence} from '../../../src/r2/product-bridge.mjs';
import {readArtifactZip} from './artifact-zip.mjs';
import {storeArtifactSet} from './artifact-store.mjs';
export function prepareNativeArchives({userId,row,run,remote,artifacts,evidenceArchive,attestationArchive}){
 if(!row||row.user_id!==userId||run.user_id!==userId||row.state!=='RUN_BOUND'||row.product_run_id&&row.product_run_id!==run.id||row.request.product_run_id!==run.id||run.gh_run_id!==row.github_run_id||run.gh_head_sha!==row.request.revision)throw Error('owned bound native run required');
 const bound=matchNativeProductRun(row.request,{...row.request,github_run_id:row.github_run_id},remote),selected=selectNativeArtifacts(bound,artifacts);
 const raw=readArtifactZip(evidenceArchive),signed=readArtifactZip(attestationArchive),prefix=row.github_run_id+'-1/';
 const files={};for(const [path,bytes] of Object.entries(raw)){if(path.startsWith(prefix))files[path.slice(prefix.length)]=bytes;else if(!path.startsWith('diagnostics/'))throw Error('unexpected native artifact root');}
 if(Object.keys(signed).sort().join(',')!=='bundle.sha256,run-manifest.sigstore.jsonl'||signed['bundle.sha256'].toString()!==sha256(signed['run-manifest.sigstore.jsonl'])+'  run-manifest.sigstore.jsonl\n')throw Error('separate attestation bundle required');
 if(!files['r2-export.json']||!files['native-attestation.json']||!files['run-manifest.json']||!files['run-manifest.sha256'])throw Error('complete native export and attestation required');
 const exp=parseUniqueJson(files['r2-export.json'].toString('utf8')),i=exp.identity,r=row.request;
 const pinned={repository:'ANIRUDDH-001/Tabwise',workflow:r.workflow,revision:r.revision,actor:r.actor,github_run_id:row.github_run_id,github_run_attempt:1,r2_source_sha256:r.r2_source_sha256,qualification_sha256:r.qualification_sha256,plan_sha256:r.plan_sha256,page_id:r.page_id,fixture_sha256:r.fixture_sha256,product_run_id:r.product_run_id,spec_sha256:r.spec_sha256,app_hash:r.fixture_sha256};
 if(!i||Object.entries(pinned).some(([k,v])=>i[k]!==v)||sha256(files['product-spec.json']??'')!==r.spec_sha256||sha256(files['run-manifest.json'])!==i.run_manifest_sha256)throw Error('native export persisted identity mismatch');
 const attestation=parseUniqueJson(files['native-attestation.json'].toString('utf8'));delete files['native-attestation.json'];
 return {selected,files,attestation,expected:{...i,spec:parseUniqueJson(row.spec_text)},bundle:signed['run-manifest.sigstore.jsonl'],ingest_sha256:sha256(Buffer.concat([Buffer.from(row.request_sha256),Buffer.from(evidenceArchive),Buffer.from(attestationArchive)]))};
}
// Read-only crash recovery: finish only an already complete byte-identical storage set.
// Partial or corrupt data is quarantined; this function has no write/remove capability.
export async function recoverNativeStoredSet({userId,run,manifest,files,metadata,download}){
 try{
  if(run?.user_id!==userId||!Array.isArray(metadata)||metadata.length!==manifest.files.length)return false;
  for(const f of manifest.files){const rows=metadata.filter(x=>x.path===f.path);if(rows.length!==1||['sha256','bytes','kind'].some(k=>rows[0][k]!==f[k]))return false;}
  const saved=await download(run.id+'/manifest.json');if(!saved||!Buffer.from(saved).equals(Buffer.from(JSON.stringify(manifest))))return false;
  for(const f of manifest.files){const bytes=await download(run.id+'/'+f.path);if(!bytes||bytes.length!==f.bytes||sha256(bytes)!==f.sha256||!Buffer.from(bytes).equals(files[f.path]))return false;}
  return true;
 }catch{return false;}
}
export async function ingestNativeArtifacts({configuration,load,readRemote,listArtifacts,download,verifyHosted,reserve,finish,recoverStored,store,record,cleanup,recordCleanup,userId,runId}){
 if(configuration?.enabled!==true||configuration.ingestion_enabled!==true)throw Error('native ingestion disabled');
 const {row,run}=await load(userId,runId);
 if(!row||row.user_id!==userId||run?.user_id!==userId||row.state!=='RUN_BOUND')throw Error('owned bound native run required');
 const remote=await readRemote(row.github_run_id),artifacts=await listArtifacts(row.github_run_id);
 if(remote.status!=='completed'||remote.conclusion!=='success')throw Error('completed native workflow required');
 const bound=matchNativeProductRun(row.request,{...row.request,github_run_id:row.github_run_id},remote),ids=selectNativeArtifacts(bound,artifacts);
 const a=prepareNativeArchives({userId,row,run,remote,artifacts,evidenceArchive:await download(ids.evidence_id),attestationArchive:await download(ids.attestation_id)});
 const origin=readVerifiedHostedProvenance(await verifyHosted(a));
 if(origin.subject_sha256!==a.expected.run_manifest_sha256||origin.run_id!==row.github_run_id||origin.run_attempt!==1||origin.sha!==row.request.revision||origin.workflow!==row.request.workflow||origin.repository!=='ANIRUDDH-001/Tabwise')throw Error('hosted signature association mismatch');
 // Authentic handle only; simulated verifiers and disabled native policy cannot cross this boundary.
 const native=readQualifiedR2ProductEvidence(openQualifiedR2ProductEvidence(a));
 const receipt=await reserve(userId,runId,a.ingest_sha256);if(receipt.state==='COMPLETE')return {replayed:true,native_qualified:false};
 if(receipt.fresh!==true){if(typeof recoverStored!=='function'||!await recoverStored(native))throw Error('native ingestion pending; explicit custody recovery required');await finish(userId,runId,a.ingest_sha256);return {replayed:true,recovered:true,native_qualified:false};}
 await storeArtifactSet({prefix:runId,manifestBytes:Buffer.from(JSON.stringify(native.manifest)),manifest:native.manifest,files:native.files,store,record:()=>record(native.manifest),cleanup,recordCleanup});
 await finish(userId,runId,a.ingest_sha256);return {replayed:false,native_qualified:false};
}
