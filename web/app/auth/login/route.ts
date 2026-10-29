import {sessionClient} from '../../../lib/server/supabase';
import {endpoint} from '../../../lib/server/http';
import {HttpError} from '../../../lib/server/core.mjs';
export async function GET(request:Request){return endpoint(request,async()=>{if(!process.env.TABWISE_OAUTH_CONFIGURED)throw new HttpError(503,'github_oauth_provider_pending');const client=await sessionClient();const {data,error}=await client.auth.signInWithOAuth({provider:'github',options:{redirectTo:`${new URL(request.url).origin}/auth/callback`}});if(error||!data.url)throw new HttpError(503,'sign_in_unavailable');return Response.redirect(data.url,303);});}
