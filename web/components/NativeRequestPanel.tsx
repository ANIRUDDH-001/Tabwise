'use client';
import {useEffect,useState} from 'react';
type View={state:string|null,message:string,request_sha256?:string,github_run_id?:string|null,native_qualified:false,can_dispatch:boolean,can_ingest?:boolean,can_prepare?:boolean};
export default function NativeRequestPanel({id,runStatus}:{id:string,runStatus?:string}){
 const [view,setView]=useState<View|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
 useEffect(()=>{
  setView(null);
  const controller=new AbortController();
  fetch(`/api/runs/${encodeURIComponent(id)}/native-request`,{cache:'no-store',signal:controller.signal}).then(async r=>{
   if(!r.ok)throw Error(r.status===401?'Sign in to view this request.':'Native request tracking is awaiting server setup.');
   return r.json();
  }).then(v=>{if(!controller.signal.aborted){setView(v);setError('');}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
  return()=>controller.abort();
 },[id,refresh,runStatus]);
 const act=async(action:'native-request'|'native-dispatch'|'native-ingest')=>{
  setBusy(true);setError('');
  try{
   const r=await fetch(`/api/runs/${encodeURIComponent(id)}/${action}`,{method:'POST'});
   if(!r.ok)throw Error(r.status===401?'Sign in to continue.':action==='native-ingest'?'Evidence could not be accepted. The run remains unverified; source and qualification checks must pass.':r.status===409?'The run state or approved source has changed. Refresh the request before continuing.':'This action is awaiting authorized server setup.');
   if(action==='native-request')setView(await r.json());
   setRefresh(n=>n+1);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 return <section className="panel" aria-label="Native execution request">
  <div className="panel-head"><h2>Execution request</h2></div>
  <div className="panel-body">
   <p role="status" aria-live="polite">{error||view?.message||'Checking the saved execution request…'}</p>
   <div className="actions">
    {view?.state===null&&view.can_prepare===true&&<button className="button secondary small" disabled={busy} onClick={()=>act('native-request')}>Prepare request</button>}
    {view?.can_dispatch===true&&<button className="button small" disabled={busy} onClick={()=>act('native-dispatch')}>Request native run</button>}
    {view?.can_ingest===true&&<button className="button small" disabled={busy} onClick={()=>act('native-ingest')}>Retrieve and check evidence</button>}
    <button className="button secondary small" disabled={busy} onClick={()=>setRefresh(n=>n+1)}>{busy?'Working…':'Refresh request'}</button>
   </div>
   {!view?.can_dispatch&&!view?.can_ingest&&<p className="muted">Native actions are awaiting the required run state and authorized server setup. Your saved request is retained.</p>}
   <p className="muted">Preparation saves a request. A completed worker run still requires evidence integrity and qualification checks.</p>
   {view?.request_sha256&&<details><summary>Request identity</summary><p className="mono" style={{overflowWrap:'anywhere'}}>{view.request_sha256}</p>{view.github_run_id&&<p>Associated workflow run: {view.github_run_id}</p>}</details>}
  </div>
 </section>;
}
