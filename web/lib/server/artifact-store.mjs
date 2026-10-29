// Compensate only this operation's exact attempted paths, including unknown store outcomes.
export async function storeArtifactSet({prefix,manifestBytes,manifest,files,store,record,cleanup,recordCleanup}){
 const attempted=[];
 const put=async(path,bytes,kind)=>{attempted.push(path);await store(path,bytes,kind);};
 try{
  await put(`${prefix}/manifest.json`,manifestBytes,'manifest');
  for(const file of manifest.files)await put(`${prefix}/${file.path}`,files[file.path],file.kind);
  await record();
 }catch(cause){
  let pending=true;
  if(typeof cleanup==='function')try{await cleanup(prefix,[...attempted]);pending=false;}catch{ /* original failure stays authoritative */ }
  const evidence={prefix,paths:[...attempted],artifact_cleanup_pending:pending,reason:'artifact_store_or_metadata_failure'};
  let recorded=false;
  if(typeof recordCleanup==='function')try{await recordCleanup(evidence);recorded=true;}catch{ /* reported on the original error */ }
  const error=cause instanceof Error?cause:new Error('artifact storage failed');
  Object.assign(error,{artifact_cleanup_pending:pending,cleanup_evidence_recorded:recorded,cleanup_evidence:evidence});throw error;
 }
}
