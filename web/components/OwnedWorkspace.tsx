'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {workspaceState,workspaceSummary,savedJourneyGroups,nextAction,savedOn} from '../lib/workspace-state.mjs';
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
 runs:['Runs','Screen-reader runs recorded for your account.'],
 reports:['Reports','Diagnostic reports from your runs with readable evidence.'],
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
type Group={journey_id:string,name:string,editHref:string,latest:Version,count:number};
function JourneyTable({groups}:{groups:Group[]}){
 return <table className="data-table stack"><thead><tr><th>Journey</th><th>Latest version</th><th>Saved</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{groups.map(g=><tr key={g.journey_id}><td data-label="Journey"><strong>{g.name}</strong><small>{g.count} {g.count===1?'version':'versions'} in recent results</small></td><td data-label="Latest version"><Link className="textlink" href={`/journeys/versions/${g.latest.id}`}>Version {g.latest.n}</Link><small className="mono">SHA256 {g.latest.sha256.slice(0,12)}…</small></td><td data-label="Saved">{savedOn(g.latest.created_at)??'—'}</td><td data-label="Actions" className="row-actions"><Link className="button secondary small" href={g.editHref}>Open local draft</Link></td></tr>)}</tbody></table>;
}
// Execution restriction, shown apart from the (possibly empty) data so the two are never confused.
function RunsGate(){return <p className="gate-note"><StatusChip tone="gated">Live runs gated</StatusChip> No run can start from this deployment until the independent worker review is complete. <Link className="textlink" href="/status">What works today</Link></p>;}
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
  const next=nextAction(summary),groups=savedJourneyGroups(summary) as Group[];
  const stats:[('journeys'|'runs'|'reports'),string,string][]=[['journeys','Recent saved versions','/w/me/journeys'],['runs','Runs','/w/me/runs'],['reports','Reports','/w/me/reports']];
  body=<>
   <section className="next-card" aria-labelledby="next-heading"><div><span className="eyebrow">Next step</span><h2 id="next-heading">{next.title}</h2><p>{next.reason}</p></div><div className="actions"><Link className="button" href={next.primary.href}>{next.primary.label}</Link>{next.secondary&&<Link className="button secondary" href={next.secondary.href}>{next.secondary.label}</Link>}</div></section>
   <div className="stat-row">{stats.map(([k,label,href])=><Link key={k} className="stat" href={href}><strong>{summary.counts[k]}</strong><span>{label}</span></Link>)}</div>
   <div className="dash-grid">
    <section className="panel"><div className="panel-head"><h2>Saved journeys</h2><Link className="textlink" href="/w/me/journeys">All saved journeys</Link></div><div className="panel-body">{groups.length?<ul className="record-list">{groups.slice(0,3).map(g=><li key={g.journey_id}><Link className="textlink" href={`/journeys/versions/${g.latest.id}`}>{g.name} · version {g.latest.n}</Link><span className="muted"> · {g.count} saved{savedOn(g.latest.created_at)?` · ${savedOn(g.latest.created_at)}`:''}</span></li>)}</ul>:<p className="muted">Nothing saved to your account yet. Journeys you can record: {(summary.catalog as Data['catalog']).map((j,i)=><span key={j.id}>{i?', ':''}<Link className="textlink" href={j.href}>{j.name}</Link></span>)}.</p>}</div></section>
    <section className="panel"><div className="panel-head"><h2>Runs and reports</h2><Link className="textlink" href="/w/me/runs">All runs</Link></div><div className="panel-body">{summary.latest.runs.length?<RunList items={summary.latest.runs as Run[]}/>:<p className="muted">No runs recorded for your account.</p>}<RunsGate/></div></section>
   </div>
  </>;
 }
 else if(section==='journeys'){const groups=savedJourneyGroups(summary) as Group[];body=groups.length?<><section className="panel">{<JourneyTable groups={groups}/>}</section><p className="muted small-note">Each saved version is immutable. Saving again from the editor adds a new version.</p></>:<EmptyState headingLevel={2} title="No saved journeys yet" reason="Drafts and local versions stay in the browser where you made them until you choose “Save to my account” in the editor." action={editor}/>;}
 else if(section==='runs')body=<><RunsGate/>{summary.runs.length?<section className="panel"><div className="panel-body"><RunList items={summary.runs as Run[]}/></div></section>:<EmptyState headingLevel={2} title="No runs recorded for your account" reason="Runs of your saved journeys will appear here once live execution is approved. Until then you can inspect the public R1 capture." action={<><Link className="button secondary small" href="/w/me/journeys">Your saved journeys</Link><Link className="button quiet small" href="/runs/r1-20261028T153344Z">Public R1 capture</Link></>}/>}<p className="muted small-note">A completed capture does not establish that a repair worked.</p></>;
 else body=<>{summary.reports.length?<section className="panel"><div className="panel-body"><RunList items={summary.reports as Run[]} report/></div></section>:<EmptyState headingLevel={2} title="No reports yet" reason="A report appears when one of your runs has readable evidence. Verification stays pending until a qualified rerun." action={<><Link className="button secondary small" href="/w/me/runs">Your runs</Link><Link className="button quiet small" href="/r/r1-diagnostic">Public diagnostic example</Link></>}/>}</>;
 return <><PageHeader title={title} purpose={purpose} status={<StatusChip tone="info">GitHub account</StatusChip>}/>{body}</>;
}
