import 'server-only';
import {withVerificationDirectory} from './verification-directory.mjs';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {nativeIntegrationConfiguration} from './native-integration-live';
import {ingestNativeArtifacts,recoverNativeStoredSet} from './native-artifacts.mjs';
import {verifyR2HostedProvenance} from '../../../src/r2/provenance.mjs';
import {reviewedR2Module} from '../../../src/r2/node-review.mjs';
import {serviceClient,requireUser} from './supabase';
import {github,downloadArtifact} from './github';
import {createArtifactCompensation} from './artifact-store.mjs';
import {endpoint} from './http';
import {HttpError} from './core.mjs';
export async function nativeIngestPOST(request:Request,id:string){return endpoint(request,async()=>{
 const user=await requireUser(),configuration=nativeIntegrationConfiguration();
 if(configuration.enabled!==true||configuration.ingestion_enabled!==true)throw new HttpError(503,'native_ingestion_disabled');
 const db=serviceClient(),rpc=async(name:string,args:Record<string,unknown>)=>{const {data,error}=await db.rpc(name,args);if(error)throw error;return data;};
 const compensation=createArtifactCompensation(db,id);
 return Response.json(await ingestNativeArtifacts({configuration,userId:user.id,runId:id,
  load:async()=>{const {data:row,error}=await db.from('native_product_requests').select('*').eq('product_run_id',id).eq('user_id',user.id).maybeSingle();const {data:run,error:runError}=await db.from('runs').select('*').eq('id',id).eq('user_id',user.id).maybeSingle();if(error||runError)throw new HttpError(503,'native_evidence_state_unavailable');return {row,run};},
  readRemote:async(gh:string)=>(await github(`/actions/runs/${gh}`)).data,
  listArtifacts:async(gh:string)=>(await github(`/actions/runs/${gh}/artifacts`)).data.artifacts,
  download:downloadArtifact,
  verifyHosted:async(a:{files:Record<string,Uint8Array>,bundle:Uint8Array,ingest_sha256:string,forensics:{evidenceArchive:Uint8Array,attestationArchive:Uint8Array}})=>{
   if(!configuration.provenance?.policy||!configuration.provenance.trusted_root)throw Error('reviewed hosted verifier configuration missing');
   return withVerificationDirectory(async(dir:string)=>{
   for(const [path,bytes] of Object.entries(a.files)){const target=resolve(dir,path);if(!target.startsWith(resolve(dir)+'/')&&!target.startsWith(resolve(dir)+'\\'))throw Error('native staging path');await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});}
   const bundle=join(dir,'run-manifest.sigstore.jsonl');await writeFile(bundle,a.bundle,{flag:'wx'});
   const plan=reviewedR2Module('r2-run.mjs').parseR2Plan(a.files['plan.json']),fixtures=new Map();for(const page of plan.pages)fixtures.set(page.id,a.files[page.fixture]);
   const verification=await reviewedR2Module('r2-run.mjs').r2VerifyRun({plan,pages:plan.pages,fixtures},dir);
   if(!verification.ok||!verification.complete)throw Error('native run verifier refused');
   return (await verifyR2HostedProvenance({runDir:dir,bundle,trustedRoot:configuration.provenance.trusted_root,policy:configuration.provenance.policy})).handle;
   },{preserveFailure:async()=>{
    const prefix=id+'/forensics/'+a.ingest_sha256;
    for(const [name,bytes] of Object.entries(a.forensics)){const {error}=await db.storage.from('tabwise-evidence').upload(prefix+'/'+name+'.zip',bytes,{contentType:'application/zip',upsert:false});if(error&&String(error.statusCode)!=='409')throw Error('forensic retention incomplete');}
    const {error}=await db.from('audit_log').insert({actor:'native-verifier',action:'native_verification_refused',subject:id,detail:{prefix,ingest_sha256:a.ingest_sha256}});if(error)throw Error('forensic retention audit unavailable');
   }});
  },
  reserve:(user:string,run:string,sha:string)=>rpc('reserve_native_ingestion',{p_user:user,p_run:run,p_sha:sha}),
  recoverStored:async(native:{manifest:{files:{path:string,sha256:string,bytes:number,kind:string}[]},files:Record<string,Uint8Array>})=>{
   const {data:metadata,error}=await db.from('artifacts').select('path,sha256,bytes,kind').eq('run_id',id);if(error)return false;
   return recoverNativeStoredSet({userId:user.id,run:{id,user_id:user.id},manifest:native.manifest,files:native.files,metadata,download:async(path:string)=>{const {data,error}=await db.storage.from('tabwise-evidence').download(path);if(error||!data||data.size>4000000)return null;return Buffer.from(await data.arrayBuffer());}});
  },
  finish:(user:string,run:string,sha:string)=>rpc('finish_native_ingestion',{p_user:user,p_run:run,p_sha:sha}),
  store:async(path:string,bytes:Uint8Array,kind:string)=>{const {error}=await db.storage.from('tabwise-evidence').upload(path,bytes,{contentType:kind==='screenshot'?'image/png':'application/json',upsert:false});if(error)throw error;},
  record:async(manifest:{files:{path:string,sha256:string,bytes:number,kind:string}[]})=>{const {error}=await db.from('artifacts').insert(manifest.files.map(f=>({run_id:id,...f})));if(error)throw error;},...compensation
 }));
 },true);}
