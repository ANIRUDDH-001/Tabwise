import {HttpError} from './core.mjs';
const base='https://api.github.com/repos/ANIRUDDH-001/Tabwise';
export async function github(path:string,init:RequestInit={}){
 const token=process.env.GH_PAT;if(!token)throw new HttpError(503,'github_credential_pending');
 if(!path.startsWith('/actions/')||path.includes('..')||path.includes('?')&&!/^\/actions\/workflows\/tabwise-run.yml\/runs\?/.test(path))throw new HttpError(400,'unsupported_github_path');
 const response=await fetch(`${base}${path}`,{...init,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2026-03-10',...init.headers},cache:'no-store',signal:AbortSignal.timeout(8000),redirect:'error'});
 if(!response.ok)throw new HttpError(502,'github_request_failed');
 return {data:response.status===204?null:await response.json(),remaining:Number(response.headers.get('x-ratelimit-remaining')??0)};
}
export async function downloadArtifact(id:string){
 if(!/^\d+$/.test(id))throw new HttpError(409,'invalid_artifact_identity');
 const token=process.env.GH_PAT;if(!token)throw new HttpError(503,'github_credential_pending');
 const redirect=await fetch(`${base}/actions/artifacts/${id}/zip`,{headers:{Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2026-03-10'},redirect:'manual',signal:AbortSignal.timeout(8000)});
 const location=redirect.headers.get('location');if(redirect.status!==302||!location)throw new HttpError(502,'artifact_download_unavailable');
 const url=new URL(location);if(url.protocol!=='https:'||url.username||url.password||!['.blob.core.windows.net','.githubusercontent.com','.actions.githubusercontent.com'].some(s=>url.hostname.endsWith(s)))throw new HttpError(502,'artifact_redirect_refused');
 // The PAT is never forwarded to the signed download host.
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(8000)});if(!response.ok||Number(response.headers.get('content-length')??0)>8000000||!response.body)throw new HttpError(502,'artifact_download_failed');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
 for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>8000000){await reader.cancel();throw new HttpError(413,'archive_too_large');}chunks.push(value);}
 return Buffer.concat(chunks);
}
