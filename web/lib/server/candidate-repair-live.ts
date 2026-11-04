import 'server-only';
import {requireUser,serviceClient} from './supabase';
import {candidateConfiguration} from './candidate-run-live';
import * as adapter from './candidate-repair.mjs';
import {webRepairContext} from '../../../diagnostics/r2-candidate/repair.mjs';
import {endpoint} from './http';
import {HttpError,assertSameOrigin} from './core.mjs';
export function candidateRepairRoute(request:Request,id:string){return endpoint(request,async()=>{
 const user=await requireUser(),c=candidateConfiguration();
 if(!c.enabled||c.userId!==user.id)throw new HttpError(403,'candidate_owner_required');
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))throw new HttpError(400,'invalid_candidate_id');
 const common={db:serviceClient(),userId:user.id,baselineId:id,sourceRoot:undefined,sourceContext:webRepairContext()};
 if(request.method==='GET'){
  const {context}=await adapter.candidateRepairContext(common);
  const existing=await adapter.existingCandidateRepair({...common,review:context.review});
  return Response.json({classification:'NONPRODUCTION_UNQUALIFIED',production_qualified:false,review:context.review,diff:context.patch,existing_run_id:existing?.product_run_id??null,preparation_available:false},{headers:{'Cache-Control':'private, no-store'}});
 }
 assertSameOrigin(request);
 if(!await adapter.existingCandidateRepair({...common,review:common.sourceContext.review}))throw new HttpError(503,'candidate_execution_disabled');
 const value=await adapter.prepareOwnedCandidateRepair({...common,key:request.headers.get('Idempotency-Key'),revision:c.revision});
 return Response.json(value,{status:201,headers:{'Cache-Control':'private, no-store'}});
});}
