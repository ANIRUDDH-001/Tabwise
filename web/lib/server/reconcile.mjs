const terminal=new Set(['completed','failed','cancelled','timed_out']);
export async function reconcileRun(run,api){
 if(terminal.has(run.status))return run;
 if(Date.parse(run.deadline_at)<=Date.now()){
  await api.transition(run.id,run.status,'timed_out','deadline_exceeded');
  if(run.gh_run_id)await api.cancel(run.gh_run_id);
  return {...run,status:'timed_out',reason:'deadline_exceeded'};
 }
 if(!await api.claim(run.id))return run;
 if(run.status==='ingesting')return run; // Never start a second ingest while a request owns this stage.
 let remote;
 if(!run.gh_run_id){
  const candidates=await api.find(run);
  if(!candidates.length)return run;
  if(candidates.length!==1||!api.identity(candidates[0])){
   await api.transition(run.id,run.status,'failed','worker_identity');
   await api.downgrade?.('worker_identity');return {...run,status:'failed',reason:'worker_identity'};
  }
  remote=candidates[0];run={...run,gh_run_id:String(remote.id),gh_head_sha:remote.head_sha};await api.saveIdentity?.(run);
 }
 const status=await api.status(run);
 if(status.rate_remaining<1000){await api.downgrade?.('github_rate');return {...run,status_delayed:true};}
 await api.stages?.(run.id,status.stages??[]);
 if(status.status==='queued')return run;
 if(run.status==='dispatched'){await api.transition(run.id,'dispatched','running',null);run={...run,status:'running'};}
 if(status.status!=='completed')return run;
 if(status.conclusion!=='success'){
  let diagnostic_evidence_available=false,artifact_cleanup_pending=false;
  try{const partial=await api.ingestPartial?.(run);diagnostic_evidence_available=partial?.diagnostic_only===true;}catch(error){artifact_cleanup_pending=error.artifact_cleanup_pending===true;}
  await api.transition(run.id,run.status,'failed','worker_failed');await api.infrastructureFailure?.(run);
  return {...run,status:'failed',reason:'worker_failed',evidence_status:'incomplete',diagnostic_evidence_available,artifact_cleanup_pending};
 }
 if(run.status==='running'){await api.transition(run.id,'running','uploading',null);run={...run,status:'uploading'};}
 await api.transition(run.id,'uploading','ingesting',null);
 let ingested;
 try{
  ingested=await api.ingest({...run,status:'ingesting'},remote);
  if(!ingested?.complete)throw Error('incomplete evidence');
 }catch(error){
  await api.transition(run.id,'ingesting','failed','evidence_integrity');await api.downgrade?.('evidence_integrity');
  return {...run,status:'failed',reason:'evidence_integrity',evidence_status:'incomplete',artifact_cleanup_pending:error.artifact_cleanup_pending===true};
 }
 await api.transition(run.id,'ingesting','completed',null);
 let artifact_cleanup_pending=false;
 try{await api.deleteArtifact?.(ingested.artifact_id);}catch{artifact_cleanup_pending=true;}
 return {...run,status:'completed',evidence_status:'complete',artifact_cleanup_pending};
}
