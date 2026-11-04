import 'server-only';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {requireUser,serviceClient} from './supabase';
import {candidateConfiguration} from './candidate-run-live';
import {candidateRunStore} from './candidate-run.mjs';
import {reviewedSourceRoot} from '../../../src/r2/node-review.mjs';
import {sha256} from '../../../packages/contracts/index.mjs';
import {stable} from '../../../packages/contracts/r2-product.mjs';
import {endpoint} from './http';
import {HttpError} from './core.mjs';
const rawRequire=createRequire(import.meta.url);
export function candidateComparisonRoute(request:Request,id:string){return endpoint(request,async()=>{
 const user=await requireUser(),c=candidateConfiguration();if(!c.enabled||c.userId!==user.id)throw new HttpError(403,'candidate_owner_required');
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))throw new HttpError(400,'invalid_candidate_id');
 const db=serviceClient();
 if(request.method==='GET'){
  const {data,error}=await db.from('candidate_repair_comparisons').select('result,sha256').eq('product_run_id',id).eq('user_id',user.id).maybeSingle();
  if(error)throw new HttpError(503,'candidate_evidence_unavailable');if(!data)throw new HttpError(404,'candidate_comparison_pending');
  if(sha256(stable(data.result))!==data.sha256||data.result.production_qualified!==false)throw new HttpError(409,'candidate_evidence_unavailable');
  return Response.json(data.result,{headers:{'Cache-Control':'private, no-store'}});
 }
 const store=candidateRunStore(db),row=await store.read(user.id,id),sourceRoot=reviewedSourceRoot();
 const adapter=rawRequire(/* webpackIgnore: true */ resolve(sourceRoot,'web/lib/server/candidate-comparison.mjs'));
 const result=await adapter.compareStoredCandidateRepair({userId:user.id,row,sourceRoot,read:(run:string)=>store.read(user.id,run),download:async(path:string)=>{
  const {data,error}=await db.storage.from('tabwise-evidence').download(path);if(error||!data||data.size>4000000)throw new HttpError(503,'candidate_evidence_unavailable');return Buffer.from(await data.arrayBuffer());
 }}),canonical=stable(result);
 const saved=await db.rpc('finish_candidate_repair_comparison',{p_user:user.id,p_run:id,p_result:result,p_canonical:canonical,p_sha:sha256(canonical)});
 if(saved.error||!saved.data||saved.data.sha256!==sha256(canonical))throw new HttpError(409,'candidate_comparison_conflict');
 return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
},request.method==='POST');}
