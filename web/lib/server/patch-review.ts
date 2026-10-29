import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {serviceClient} from './supabase';
import {authorizeRun,HttpError} from './core.mjs';
import {preparePatchReview} from '../../../src/repair/review.mjs';

export async function ownedPatchReview(id:string,userId:string){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))throw new HttpError(404,'patch_not_found');
 const db=serviceClient(),{data:patch}=await db.from('patches').select('*').eq('id',id).maybeSingle();
 if(!patch)throw new HttpError(404,'patch_not_found');
 const {data:run}=await db.from('runs').select('id,user_id,status,evidence_status,spec').eq('id',patch.run_id).maybeSingle();
 authorizeRun({id:userId},run);
 const {data:finding}=await db.from('findings').select('title,mechanism,evidence_refs,confidence,location').eq('id',patch.finding_id).eq('run_id',run!.id).maybeSingle();
 if(!finding)throw new HttpError(409,'finding_unavailable');
 const {data:app}=await db.from('apps').select('base_sha256').eq('id','fernway').single();
 const source=(await readFile(join(process.cwd(),'../fixtures/fernway/index.html'),'utf8')).replace(/\r\n/g,'\n');
 const context={userId,run,patch,source,currentBaseSha256:app?.base_sha256,knownEvidenceRefs:finding.evidence_refs};
 const check=preparePatchReview({...context,decision:{decision:'approved',patch_sha256:patch.validator?.contract?.patch_sha256}});
 return {db,context,finding,check};
}
