'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {workspaceState,workspaceSummary} from '../lib/workspace-state.mjs';
import PageHeader from './ui/PageHeader';
import EmptyState from './ui/EmptyState';
import StatusChip from './ui/StatusChip';
import WorkspaceUnavailable from './WorkspaceUnavailable';
type Version={id:string;journey_id:string;n:number;sha256:string;created_at?:string};
type Run={id:string;status:string;evidence_status:string;created_at?:string};
type Data={catalog:{id:string;name:string;supported:boolean;href:string}[];versions:Version[];runs:Run[]};
type Failure={kind:string,title:string,message:string,actions:string[]};
export type Section='overview'|'journeys'|'runs'|'reports';
const HEAD:Record<Section,[string,string]>={
 overview:['Your workspace','Saved journeys, runs and reports for your GitHub account. Everything here comes from your account storage.'],
 journeys:['Saved journeys','Immutable journey versions saved to your account from the editor.'],
 runs:['Runs','Screen-reader runs recorded for your account. Live runs are gated pending worker review.'],
 reports:['Reports','Diagnostic reports from your runs with readable evidence. Verification remains pending until a qualified rerun.'],
};
function useWorkspace(){
 const [data,setData]=useState<Data|null>(null),[failure,setFailure]=useState<Failure|null>(null),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();setFailure(null);setData(null);
  fetch('/api/workspace',{cache:'no-store',signal:controller.signal}).then(async response=>{
   if(!response.ok){let reason:string|undefined;try{reason=(await response.json())?.reason;}catch{reason=undefined;}if(!controller.signal.aborted)setFailure(workspaceState(response.status,reason));return;}
   const value=await response.json();if(!controller.signal.aborted)setData(value);
  }).catch(()=>{if(!controller.signal.aborted)setFailure(workspaceState(0));});
  return()=>controller.abort();
 },[attempt]);
 return {data,failure,retry:()=>setAttempt(n=>n+1)};
}
function VersionList({items}:{items:Version[]}){
 return <ul className="record-list">{items.map(v=><li key={v.id}><Link className="textlink" href={`/journeys/versions/${v.id}`}>{v.journey_id} · version {v.n}</Link>{v.created_at&&<span className="muted"> · saved {v.created_at}</span>}<span className="mono record-hash">SHA256 {v.sha256.slice(0,12)}…</span></li>)}</ul>;
}
function RunList({items,report=false}:{items:Run[],report?:boolean}){
 return <ul className="record-list">{items.map(r=><li key={r.id}><Link className="textlink mono" href={report?`/runs/${r.id}/report`:`/runs/${r.id}`}>{report?'Report for run ':'Run '}{r.id.slice(0,8)}</Link> <StatusChip tone={r.status==='completed'?'ok':r.status==='failed'||r.status==='timed_out'?'failed':'info'}>{String(r.status).replaceAll('_',' ')}</StatusChip><span className="muted"> · evidence {String(r.evidence_status).replaceAll('_',' ')}</span></li>)}</ul>;
}
export default function OwnedWorkspace({section='overview'}:{section?:Section}){
 const {data,failure,retry}=useWorkspace();
 const [title,purpose]=HEAD[section];
 const summary=data?workspaceSummary(data):null;
 const editor=<Link className="button small" href="/journeys">Open the journey editor</Link>;
 let body:React.ReactNode;
 if(failure)body=<WorkspaceUnavailable state={failure} onRetry={retry}/>;
 else if(!summary)body=<div className="skeleton-stack" aria-busy="true" aria-label="Loading your workspace"><div className="skeleton"/><div className="skeleton"/><div className="skeleton short"/><p className="sr-only" role="status">Loading your workspace…</p></div>;
 else if(section==='overview'){
  const stats:[('journeys'|'runs'|'reports'),string,string][]=[['journeys','Saved journeys','/w/me/journeys'],['runs','Runs','/w/me/runs'],['reports','Reports','/w/me/reports']];
  body=<>
   <div className="stat-row">{stats.map(([k,label,href])=><Link key={k} className="stat" href={href}><strong>{summary.counts[k]}</strong><span>{label}</span></Link>)}</div>
   <section className="panel"><div className="panel-head"><h2>Latest saved journeys</h2><Link className="textlink" href="/w/me/journeys">All saved journeys</Link></div><div className="panel-body">{summary.latest.journeys.length?<VersionList items={summary.latest.journeys as Version[]}/>:<EmptyState title="No saved journeys yet" reason="Record a journey in the editor, then choose “Save to my account”." action={editor}/>}</div></section>
   <section className="panel"><div className="panel-head"><h2>Latest runs</h2><Link className="textlink" href="/w/me/runs">All runs</Link></div><div className="panel-body">{summary.latest.runs.length?<RunList items={summary.latest.runs as Run[]}/>:<EmptyState title="No runs yet" reason="Live runs are gated until the worker review is complete. Nothing will start from this page." action={<Link className="button secondary small" href="/status">Why runs are gated</Link>}/>}</div></section>
   <section className="panel"><div className="panel-head"><h2>Supported application · Fernway</h2><StatusChip tone="ok">Recording available</StatusChip></div><div className="panel-body"><ul className="record-list">{(summary.catalog as Data['catalog']).map(j=><li key={j.id}><Link className="textlink" href={j.href}>{j.name}</Link> <span className="muted">· {j.supported?'Supported journey':'Recording only'}</span></li>)}</ul></div></section>
  </>;
 }
 else if(section==='journeys')body=summary.versions.length?<section className="panel"><div className="panel-body"><VersionList items={summary.versions as Version[]}/></div></section>:<EmptyState headingLevel={2} title="No saved journeys yet" reason="Browser-local drafts stay on this device until you save them to your account from the editor." action={editor}/>;
 else if(section==='runs')body=<>{summary.runs.length?<section className="panel"><div className="panel-body"><RunList items={summary.runs as Run[]}/></div></section>:<EmptyState headingLevel={2} title="No runs yet" reason="Live runs are gated pending an independent worker review, so no run can start from this deployment yet." action={<Link className="button secondary small" href="/status">View status</Link>}/>}<p className="muted small-note">A completed capture does not establish that a repair worked.</p></>;
 else body=summary.reports.length?<section className="panel"><div className="panel-body"><RunList items={summary.reports as Run[]} report/></div></section>:<EmptyState headingLevel={2} title="No reports yet" reason="Reports appear when one of your runs has readable evidence. The public R1 report in the demo is separate." action={<Link className="button secondary small" href="/r/r1-diagnostic">Open the demo report</Link>}/>;
 return <><PageHeader title={title} purpose={purpose} status={<StatusChip tone="info">GitHub account</StatusChip>}/>{body}</>;
}
