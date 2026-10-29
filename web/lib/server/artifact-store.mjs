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
export function createArtifactCompensation(db,runId){
 return {
  async cleanup(prefix,paths){
   const diagnosticPrefix=`${runId}/diagnostics/`;
   if((prefix!==runId&&!(prefix.startsWith(diagnosticPrefix)&&/^[1-9][0-9]*$/.test(prefix.slice(diagnosticPrefix.length))))||paths.some(path=>!path.startsWith(`${prefix}/`)||path.includes('/../')))throw Error('invalid artifact cleanup scope');
   const results=await Promise.allSettled([
    db.storage.from('tabwise-evidence').remove(paths),
    db.from('artifacts').delete().eq('run_id',runId).in('path',paths.map(path=>path.slice(runId.length+1))),
    // A metadata/status request may have succeeded before its response failed.
    db.from('runs').update({evidence_status:'incomplete'}).eq('id',runId).neq('status','completed'),
   ]);
   if(results.some(result=>result.status==='rejected'||result.value.error))throw Error('artifact cleanup pending');
  },
  async recordCleanup(evidence){
   const {error}=await db.from('audit_log').insert({actor:'reconciler',action:evidence.artifact_cleanup_pending?'artifact_cleanup_pending':'artifact_cleanup_complete',subject:runId,detail:evidence});
   if(error)throw Error('cleanup evidence unavailable');
  },
 };
}
