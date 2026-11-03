import 'server-only';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {reviewedSourceRoot,reviewedR2Module} from '../../../src/r2/node-review.mjs';
import {githubExecutionKeys} from './r2-caller.mjs';
import {createNativeBindingHandler} from './native-binding.mjs';
import {producerLane,dispatchNativeProduct} from './native-integration.mjs';
import {nativeRequestStore} from './native-request.mjs';
import {serviceClient,requireUser} from './supabase';
import {github} from './github';
import {endpoint} from './http';
import {HttpError} from './core.mjs';
export function nativeIntegrationConfiguration(){
 const root=reviewedSourceRoot(),read=(name:string)=>JSON.parse(readFileSync(resolve(root,'scripts/tabwise',name),'utf8'));
 const integration=read('native-integration-policy.json');
 // This committed false policy cannot be overridden with environment variables.
 if(integration.schema!=='tabwise-native-integration-policy/1'||integration.enabled!==true)return {...integration,policy:{enabled:false}};
 const policy=read('r2-admission-server-policy.json'),transport=read('r2-admission-policy.json'),native=reviewedR2Module('r2-policy.mjs'),status=native.readR2Status(root);
 if(native.r2Digest(root)!==status.reviewed_sha256||reviewedR2Module('qualification-policy.mjs').qualificationDigest(root)!==status.qualification_sha256)throw Error('native source review pending');
 return {...integration,policy,status,require_nonce:true,audience:transport.authority_origin+'/api/r2/product-binding',deployment_sha:process.env.VERCEL_GIT_COMMIT_SHA};
}
export const nativeBindingPOST=createNativeBindingHandler({configuration:nativeIntegrationConfiguration,keys:githubExecutionKeys,client:()=>{
 const db=serviceClient();return {
  load:async(id:string)=>{const {data,error}=await db.from('native_product_requests').select('*').eq('product_run_id',id).maybeSingle();if(error)throw error;return data;},
  claim:async(user:string,id:string,hash:string,ghId:string,nonce:string,jti:string)=>{const {data,error}=await db.rpc(nativeIntegrationConfiguration().recovery_enabled===true?'recover_native_worker':'bind_native_worker',{p_user:user,p_run:id,p_request_sha:hash,p_gh_run_id:ghId,p_nonce:nonce,p_jti_sha:jti});if(error)throw error;return data;}
 };
}});
export async function nativeDispatchPOST(request:Request,id:string){return endpoint(request,async()=>{
 const user=await requireUser(),c=nativeIntegrationConfiguration();if(c.enabled!==true||c.sender_enabled!==true)throw new HttpError(503,'native_sender_disabled');
 const db=serviceClient(),{data:row,error}=await db.from('native_product_requests').select('*').eq('product_run_id',id).eq('user_id',user.id).maybeSingle();if(error||!row)throw new HttpError(404,'native_request_not_found');
 const {data:run,error:runError}=await db.from('runs').select('*').eq('id',id).eq('user_id',user.id).maybeSingle();
 const {data:producer,error:producerError}=await db.from('run_producers').select('*').eq('product_run_id',id).maybeSingle();
 if(runError||!run||run.status!=='admitted'||producerLane({run,record:producer,error:producerError,native:row,nativeError:null})!=='native-r2')throw new HttpError(409,'native_dispatch_run_ineligible');
 const transitions=nativeRequestStore(db),store={...transitions,read:async()=>{const {data,error}=await db.from('native_product_requests').select('*').eq('product_run_id',id).eq('user_id',user.id).maybeSingle();if(error)throw error;return data;}};
 return Response.json(await dispatchNativeProduct({configuration:c,userId:user.id,runId:id,requestSha256:row.request_sha256,store,send:async(path:string,payload:unknown)=>(await github(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})).data}));
 },true);}
