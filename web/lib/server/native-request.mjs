import {prepareNativeProductRequest} from '../../../src/r2/product-dispatch.mjs';
import {stable} from '../../../packages/contracts/r2-product.mjs';
const messages={PREPARED:'Journey request saved. Native execution has not started.',DISPATCH_INTENT:'Execution request recorded. Awaiting confirmation.',DISPATCH_UNKNOWN:'The execution response was interrupted. Waiting for reconciliation; do not start another run.',DISPATCH_ACCEPTED:'A workflow run is associated. Native authorization and evidence checks are still pending.',RUN_BOUND:'Worker identity is bound. Evidence qualification is still pending.'};
// Controlled coordination seam only: no default network client and no live route invokes it.
// Caller must separately establish execution approval before supplying a real sender.
export async function recordNativeDispatch({userId,runId,requestSha256,store,send}){
 const current=await store.read(userId,runId);if(!current||current.request_sha256!==requestSha256)throw Error('native request ownership/digest mismatch');
 if(current.state!=='PREPARED')return nativeRequestView(current);
 await store.transition(userId,runId,requestSha256,'intent');
 try{
  const data=await send();
  if(!Number.isSafeInteger(data?.workflow_run_id)||data.workflow_run_id<1)throw Error('invalid dispatch response');
  const id=String(data.workflow_run_id);
  if(data.run_url!==`https://api.github.com/repos/ANIRUDDH-001/Tabwise/actions/runs/${id}`||data.html_url!==`https://github.com/ANIRUDDH-001/Tabwise/actions/runs/${id}`)throw Error('invalid dispatch response identity');
  return nativeRequestView(await store.transition(userId,runId,requestSha256,'accepted',id));
 }catch{
  try{const recovered=await store.read(userId,runId);if(recovered?.request_sha256===requestSha256&&['DISPATCH_ACCEPTED','RUN_BOUND'].includes(recovered.state))return nativeRequestView(recovered);}catch{}
  // SQL failure after an accepted POST stays ambiguous too. This code never resends.
  try{return nativeRequestView(await store.transition(userId,runId,requestSha256,'unknown'));}catch{return {state:'DISPATCH_UNKNOWN',message:messages.DISPATCH_UNKNOWN,request_sha256:requestSha256,github_run_id:null,native_qualified:false,can_dispatch:false,persistence_uncertain:true};}
 }
}
export function nativeRequestView(row){if(!row)return null;if(!Object.hasOwn(messages,row.state))throw Error('unknown native request state');return {state:row.state,message:messages[row.state],request_sha256:row.request_sha256,github_run_id:row.github_run_id??null,replayed:row.replayed===true,native_qualified:false,can_dispatch:false};}
export function nativePreparationEligible(run){return run?.status==='admitted'&&(!run.kind||run.kind==='baseline')&&Boolean(run.journey_version_id)&&['healthy','broken'].includes(run.spec?.variant)&&Array.isArray(run.spec?.steps)&&run.spec.steps.length>0&&run.spec.steps.every(s=>s.key!=='type');}
export function nativeRequestStore(client){
 const rpc=async(name,args)=>{const {data,error}=await client.rpc(name,args);if(error)throw Error(error.message??String(error));if(!data)throw Error('native request persistence unavailable');return data;};
 return {read:async(user,id)=>{if(client.read)return client.read(user,id);const {data,error}=await client.from('native_product_requests').select('*').eq('product_run_id',id).eq('user_id',user).maybeSingle();if(error)throw Error('native request schema unavailable');return data;},
 prepare:(user,request,context)=>rpc('prepare_native_product_request',{p_user:user,p_request:request,p_canonical:stable(Object.fromEntries(Object.entries(request).filter(([k])=>k!=='request_sha256'))),p_spec:Buffer.from(context.specBytes).toString('utf8'),p_plan:Buffer.from(context.planBytes).toString('utf8'),p_fixture:Buffer.from(context.fixture).toString('utf8')}),
 transition:(user,id,hash,action,ghId=null)=>rpc('transition_native_product_request',{p_user:user,p_run:id,p_request_sha:hash,p_action:action,p_gh_run_id:ghId})};
}
export function createNativeRequestHandler({authenticate,ownedRun,context,store,capabilities}){return async(request,id)=>{
 const reply=(status,value)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
 try{
  const user=await authenticate(request);if(!user?.id)return reply(401,{reason:'sign_in_required'});
  if(!['GET','POST'].includes(request.method))return reply(405,{reason:'method_not_allowed'});
  if(request.method==='POST'&&request.headers.get('origin')!==new URL(request.url).origin)return reply(403,{reason:'same_origin_required'});
  const run=await ownedRun(user.id,id);if(!run)return reply(404,{reason:'run_not_found'});
  if(request.method==='GET'){
   const row=await store.read(user.id,id);let actions={can_dispatch:false,can_ingest:false};
   try{if(capabilities){const value=await capabilities(user.id,run,row);actions={can_dispatch:value.can_dispatch===true,can_ingest:value.can_ingest===true};}}catch{}
   return reply(200,{...(nativeRequestView(row)??{state:null,message:nativePreparationEligible(run)?'No native execution request has been prepared.':'This run is not eligible for native request preparation.',native_qualified:false}),...actions,can_prepare:!row&&nativePreparationEligible(run)});
  }
  if(!nativePreparationEligible(run))return reply(409,{reason:'native_request_conflict'});
  const c=await context(user.id,run),p=prepareNativeProductRequest({...c,userId:user.id,run});
  return reply(200,nativeRequestView(await store.prepare(user.id,p,c)));
 }catch(error){if(error.status===401)return reply(401,{reason:'sign_in_required'});const conflict=/conflict|transition|binding|mismatch|required/.test(error.message??'');return reply(conflict?409:503,{reason:conflict?'native_request_conflict':'native_request_configuration_pending'});}
};}
