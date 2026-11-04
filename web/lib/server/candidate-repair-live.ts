import 'server-only';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {requireUser,serviceClient} from './supabase';
import {candidateConfiguration} from './candidate-run-live';
import {reviewedSourceRoot} from '../../../src/r2/node-review.mjs';
import {endpoint} from './http';
import {HttpError,assertSameOrigin} from './core.mjs';
const rawRequire=createRequire(import.meta.url);
export function candidateRepairRoute(request:Request,id:string){return endpoint(request,async()=>{
 const user=await requireUser(),c=candidateConfiguration();
 if(!c.enabled||c.userId!==user.id)throw new HttpError(403,'candidate_owner_required');
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))throw new HttpError(400,'invalid_candidate_id');
 const sourceRoot=reviewedSourceRoot(),adapter=rawRequire(/* webpackIgnore: true */ resolve(sourceRoot,'web/lib/server/candidate-repair.mjs'));
 const common={db:serviceClient(),userId:user.id,baselineId:id,sourceRoot};
 if(request.method==='GET'){
  const {context}=await adapter.candidateRepairContext(common);
  return Response.json({classification:'NONPRODUCTION_UNQUALIFIED',production_qualified:false,review:context.review,diff:context.patch},{headers:{'Cache-Control':'private, no-store'}});
 }
 assertSameOrigin(request);
 const value=await adapter.prepareOwnedCandidateRepair({...common,key:request.headers.get('Idempotency-Key'),revision:c.revision});
 return Response.json(value,{status:201,headers:{'Cache-Control':'private, no-store'}});
});}
