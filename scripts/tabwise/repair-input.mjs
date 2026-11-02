import {assertProject} from '../../web/lib/server/core.mjs';
// Read-only dedicated-project loader, invoked only after the worker execution gate.
export async function loadRepairInput({spec,env=process.env,fetchImpl=fetch}){
 const origin=assertProject(env.NEXT_PUBLIC_SUPABASE_URL);
 if(!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('repair worker credentials unavailable');
 async function one(table,key,id){
  if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw Error('repair record identity');
  const response=await fetchImpl(`${origin}/rest/v1/${table}?${key}=eq.${id}&select=*`,{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`},redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok||Number(response.headers.get('content-length'))>2200000)throw Error('repair record unavailable');
  const text=await response.text();if(Buffer.byteLength(text)>2200000)throw Error('repair record cap');
  const rows=JSON.parse(text);if(!Array.isArray(rows)||rows.length!==1)throw Error('repair record cardinality');return rows[0];
 }
 const binding=await one('repair_reruns','verify_run_id',spec.run_id);
 const application=await one('repair_applications','id',binding.application_id);
 const patch=await one('patches','id',application.patch_id);
 const baseline=await one('runs','id',binding.baseline_run_id);
 return {binding,application,patch,baseline};
}
