const REASONS=new Set(['github_oauth_provider_pending','sign_in_configuration_pending','wrong_supabase_project','oauth_code_missing','oauth_exchange_failed','sign_in_unavailable']);
export const safeReason=value=>typeof value==='string'&&REASONS.has(value)?value:'sign_in_unavailable';
export function unavailableUrl(requestUrl,reason){const url=new URL('/auth/unavailable',requestUrl);url.searchParams.set('reason',safeReason(reason));return url;}
// Browser navigation errors use HTML destinations; existing successful cookie responses pass through.
export async function authRedirect(request,work){
 try{return await work();}catch(error){return new Response(null,{status:303,headers:{Location:unavailableUrl(request.url,error?.reason).href,'Cache-Control':'no-store'}});}
}
