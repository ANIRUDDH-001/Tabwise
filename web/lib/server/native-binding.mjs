import {verifyExecutionCaller} from './r2-caller.mjs';
import {parseUniqueJson} from '../../../src/r2/strict-json.mjs';
import {nativeRequestView} from './native-request.mjs';
// Authentication binds a previously correlated worker; it never issues W5 input authority.
export function createNativeBindingHandler({configuration,keys,client}){return async request=>{
 const reply=(status,reason)=>Response.json({reason},{status,headers:{'Cache-Control':'private, no-store'}});
 try{
  const c=await configuration();if(c?.policy?.enabled!==true||c.status?.enabled!==true||c.status.verdict!=='PASS')return reply(503,'native_binding_disabled');
  if(request.method!=='POST'||request.headers.has('origin')||request.headers.has('cookie'))return reply(403,'native_binding_caller_refused');
  const auth=request.headers.get('authorization');if(!auth?.startsWith('Bearer ')||auth.length>16400)return reply(401,'native_binding_caller_refused');
  if(Number(request.headers.get('content-length')??0)>4096||!request.body)return reply(400,'native_binding_request_invalid');
  const reader=request.body.getReader(),chunks=[];let bytes=0,timer;
  try{const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('body deadline')),5000);});for(;;){const v=await Promise.race([reader.read(),deadline]);if(v.done)break;bytes+=v.value.length;if(bytes>4096)throw Error('body cap');chunks.push(v.value);}}finally{clearTimeout(timer);reader.cancel().catch(()=>{});}
  const q=parseUniqueJson(Buffer.concat(chunks).toString('utf8'));
  if(!q||Object.keys(q).sort().join(',')!=='github_run_id,product_run_id,request_sha256'||!/^[a-f0-9-]{36}$/.test(q.product_run_id??'')||!/^[a-f0-9]{64}$/.test(q.request_sha256??'')||!/^[1-9][0-9]{0,19}$/.test(q.github_run_id??''))return reply(400,'native_binding_request_invalid');
  const principal=verifyExecutionCaller(auth.slice(7),{jwks:await keys(),configuration:c,binding:c.binding,consumer:{run_id:q.github_run_id,attempt:1}});
  // Construct the privileged store only after signature and exact execution claims passed.
  const db=await client(),row=await db.load(q.product_run_id);
  if(!row||row.request_sha256!==q.request_sha256||row.github_run_id!==principal.run_id||!['DISPATCH_ACCEPTED','RUN_BOUND'].includes(row.state)||row.request.revision!==principal.revision||row.request.actor!==principal.actor||row.request.plan_sha256!==c.binding.plan_sha256||row.request.r2_source_sha256!==c.binding.reviewed_sha256||row.request.qualification_sha256!==c.binding.qualification_sha256||!c.binding.fixtures?.some(f=>f.id===row.request.page_id&&f.sha256===row.request.fixture_sha256))return reply(409,'native_binding_conflict');
  const result=await db.bind(row.user_id,q.product_run_id,q.request_sha256,principal.run_id);
  return Response.json(nativeRequestView(result),{headers:{'Cache-Control':'private, no-store'}});
 }catch{return reply(403,'native_binding_caller_refused');}
};}
