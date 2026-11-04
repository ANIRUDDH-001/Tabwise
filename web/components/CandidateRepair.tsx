'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import Panel from './ui/Panel';
type Proposal={diff:string;existing_run_id?:string|null;review:{decision:string;patch_sha256:string;model_basis_run_id:string;decision_text:string}};
export default function CandidateRepair({baseline}:{baseline:string}){
 const router=useRouter(),[proposal,setProposal]=useState<Proposal|null>(null),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[key]=useState(()=>crypto.randomUUID());
 useEffect(()=>{const c=new AbortController();fetch('/api/candidate-runs/'+baseline+'/repair',{cache:'no-store',signal:c.signal}).then(async r=>{if(r.ok){const v=await r.json();if(!c.signal.aborted)setProposal(v);}}).catch(()=>{});return()=>c.abort();},[baseline]);
 async function prepare(){setBusy(true);setStatus('Preparing the approved source…');try{const r=await fetch('/api/candidate-runs/'+baseline+'/repair',{method:'POST',headers:{'Idempotency-Key':key}}),v=await r.json();if(!r.ok)throw Error('The approved rerun could not be prepared. Retry this same request.');router.push('/candidate-runs/'+encodeURIComponent(v.product_run_id));}catch(e){setStatus(e instanceof Error?e.message:'Repair preparation failed.');}finally{setBusy(false);}}
 if(!proposal)return null;
 return <Panel title="Approved focus repair"><p>The model proposed restoring focus to the seat button after closing the dialog. The owner reviewed and approved this exact change.</p><p className="muted">Model suggestion · L1. Native rerun and comparison are still required.</p><pre className="mono" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{proposal.diff}</pre><p>Human decision: {proposal.review.decision_text}</p><details><summary>Repair provenance</summary><p className="mono">Patch: {proposal.review.patch_sha256}<br/>Diagnosis basis: {proposal.review.model_basis_run_id}</p><p>The fresh baseline uses the same original source. The diagnosis basis is retained separately.</p></details>{proposal.existing_run_id?<Link className="button" href={'/candidate-runs/'+proposal.existing_run_id}>Open approved repair rerun</Link>:<button className="button" disabled={busy} onClick={prepare}>Prepare approved repair rerun</button>}<p role="status" aria-live="polite">{status}</p></Panel>;
}
