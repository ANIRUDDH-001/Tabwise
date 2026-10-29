import {createServerClient} from '@supabase/ssr';
import {createClient} from '@supabase/supabase-js';
import {cookies} from 'next/headers';
import {assertProject,HttpError} from './core.mjs';
export function serviceClient(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new HttpError(503,'server_configuration_pending');
 assertProject(url);
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function sessionClient(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new HttpError(503,'sign_in_configuration_pending');
 assertProject(url);const jar=await cookies();
 return createServerClient(url,key,{cookies:{getAll:()=>jar.getAll(),setAll:values=>{values.forEach(({name,value,options})=>jar.set(name,value,options));}}});
}
export async function requireUser(){const client=await sessionClient();const {data,error}=await client.auth.getUser();if(error||!data.user)throw new HttpError(401,'sign_in_required');return data.user;}
export async function requireOperator(userId:string){const client=serviceClient();const {data,error}=await client.from('operators').select('github_id').eq('user_id',userId).maybeSingle();if(error||!data)throw new HttpError(403,'owner_only');return data;}
