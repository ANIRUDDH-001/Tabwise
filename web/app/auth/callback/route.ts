import {sessionClient} from '../../../lib/server/supabase';
import {endpoint} from '../../../lib/server/http';
import {HttpError} from '../../../lib/server/core.mjs';
export async function GET(request:Request){return endpoint(request,async()=>{const code=new URL(request.url).searchParams.get('code');if(!code)throw new HttpError(400,'oauth_code_missing');const client=await sessionClient(),{error}=await client.auth.exchangeCodeForSession(code);if(error)throw new HttpError(401,'oauth_exchange_failed');return Response.redirect(new URL('/w/me',request.url),303);});}
