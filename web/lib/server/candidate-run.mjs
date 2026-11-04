// Separate engineering candidate records. Never writes production evidence/runs.
import {stable} from '../../../packages/contracts/r2-product.mjs';
import {recordNativeDispatch} from './native-request.mjs';
import {parseUniqueJson} from '../../../src/r2/strict-json.mjs';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const REF='refs/heads/feat/tabwise-r2-r7-product-completion',CLASSIFICATION='NONPRODUCTION_UNQUALIFIED';
export function candidateConfigurationFromEnv(env){const revision=env.TABWISE_CANDIDATE_REVISION;return {enabled:env.TABWISE_CANDIDATE_ENABLED==='true'&&/^[a-f0-9]{40}$/.test(revision??''),userId:env.TABWISE_CANDIDATE_USER_ID,ref:env.TABWISE_CANDIDATE_REF,revision};}
const shape=row=>row?{...row,request_sha256:row.request?.request_sha256??null}:null;
export function candidateWorkspaceViews(rows,userId){
 if(!userId||!Array.isArray(rows)||rows.length>25||rows.some(r=>r.user_id!==userId||r.classification!==CLASSIFICATION||r.production_qualified!==false))throw Error('candidate workspace ownership/classification');
 return rows.map(({product_run_id,journey_version_id,state,created_at})=>({product_run_id,journey_version_id,state,created_at,classification:CLASSIFICATION,production_qualified:false}));
}
export function candidateRunView(row){
 return {product_run_id:row.product_run_id,journey_version_id:row.journey_version_id,state:row.state,classification:CLASSIFICATION,production_qualified:false,github_run_id:row.github_run_id??null,request_sha256:row.request?.request_sha256??null,native_observations_available:row.state==='EVIDENCE_READY'&&row.readback?.native_interaction_pass===true,...(row.repair?{repair:{baseline_run_id:row.repair.baseline_run_id,patch_sha256:row.repair.patch_sha256,source_sha256:row.repair.source_sha256,review:row.repair.review}}:{})};
}
export function candidateRunStore(db){
 const rpc=async(name,args)=>{const {data,error}=await db.rpc(name,args);if(error||!data)throw Error('candidate persistence conflict');return shape(data);};
 return {
  create:(user,version,key)=>rpc('create_candidate_native_run',{p_user:user,p_version:version,p_key:key}),
  read:async(user,id)=>{const {data,error}=await db.from('candidate_native_runs').select('*').eq('product_run_id',id).eq('user_id',user).maybeSingle();if(error)throw Error('candidate persistence unavailable');return shape(data);},
  prepare:(user,id,request,specText)=>rpc('prepare_candidate_native_run',{p_user:user,p_run:id,p_request:request,p_canonical:stable(Object.fromEntries(Object.entries(request).filter(([k])=>k!=='request_sha256'))),p_spec:specText}),
  transition:(user,id,hash,action,ghId=null)=>rpc('transition_candidate_native_run',{p_user:user,p_run:id,p_request_sha:hash,p_action:action,p_gh_run_id:ghId}),
 };
}
async function input(request){
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')??'')||!request.body)throw Error('input');
 const reader=request.body.getReader(),chunks=[];let size=0,timer;
 try{const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('input')),3000);});for(;;){const v=await Promise.race([reader.read(),deadline]);if(v.done)break;size+=v.value.length;if(size>4096)throw Error('input');chunks.push(Buffer.from(v.value));}return parseUniqueJson(Buffer.concat(chunks).toString('utf8'));}
 finally{clearTimeout(timer);reader.cancel().catch(()=>{});}
}
export function createCandidateRunHandler({authenticate,configuration,store,context}){return async(request,id='')=>{
 const reply=(status,value)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
 try{
  const user=await authenticate(request);if(!user?.id)return reply(401,{reason:'sign_in_required'});
  if(!['GET','POST'].includes(request.method))return reply(405,{reason:'method_not_allowed'});
  if(request.method==='POST'&&request.headers.get('origin')!==new URL(request.url).origin)return reply(403,{reason:'same_origin_required'});
  const c=await configuration();
  if(c?.enabled!==true||c.ref!==REF)return reply(503,{reason:'candidate_execution_disabled'});
  if(c.userId!==user.id)return reply(403,{reason:'candidate_owner_required'});
  if(request.method==='GET'){
   if(!uuid(id))return reply(400,{reason:'invalid_candidate_id'});
   const row=await store.read(user.id,id);return row?reply(200,candidateRunView(row)):reply(404,{reason:'candidate_not_found'});
  }
  let q;try{q=await input(request);}catch{return reply(400,{reason:'invalid_candidate_request'});}
  const key=request.headers.get('Idempotency-Key');
  if(!q||Object.keys(q).join(',')!=='journey_version_id'||!uuid(q.journey_version_id)||!key||key.length>128)return reply(400,{reason:'invalid_candidate_request'});
  const saved=await store.create(user.id,q.journey_version_id,key);
  if(saved.request)return reply(200,candidateRunView(saved));
  const run={id:saved.product_run_id,user_id:saved.user_id,journey_version_id:saved.journey_version_id,status:'admitted',spec:saved.spec};
  const specText=JSON.stringify(saved.spec),source=await context(c);
  const prepared=source.prepareCandidateRequest({...source,userId:user.id,run,specBytes:Buffer.from(specText)});
  return reply(201,candidateRunView(await store.prepare(user.id,saved.product_run_id,prepared,specText)));
 }catch(error){if(error.status===401)return reply(401,{reason:'sign_in_required'});if(error.status===503&&['sign_in_configuration_pending','server_configuration_pending'].includes(error.reason))return reply(503,{reason:error.reason});return reply(409,{reason:'candidate_request_conflict'});}
};}
export async function dispatchCandidate({userId,runId,requestSha256,store,send}){
 // Reuse the existing durable intent/unknown-outcome mechanism. Candidate SQL
 // never resets an uncertain intent and binds only the actual returned run ID.
 await recordNativeDispatch({userId,runId,requestSha256,store,send});
 const row=await store.read(userId,runId);if(!row)throw Error('candidate readback unavailable');return candidateRunView(row);
}
