import {citationTarget} from '../lib/evidence-view.mjs';
type Finding={id:string;source:'signal'|'spark';step:number;title:string;mechanism:string|null;confidence:string|null;evidence_count:number};
type Diagnosis={id:string;model:string;verdict:'barrier_found'|'no_barrier'|'insufficient_evidence'};

export default function RunReview({evidenceStatus,findings=[],diagnoses=[],references={},availableRefs=[]}:{evidenceStatus?:string;findings?:Finding[];diagnoses?:Diagnosis[];references?:Record<string,string[]>;availableRefs?:string[]}){
 if(evidenceStatus!=='complete')return null;
 return <section aria-labelledby="review-heading" style={{marginTop:24}}><h3 id="review-heading">Evidence review</h3>
  {diagnoses.map(d=><p key={d.id} className="muted">Muse Spark assessment: {d.verdict.replaceAll('_',' ')}. This is a diagnosis, not a verification result.</p>)}
  {findings.length?<ol>{findings.map(f=><li key={f.id} style={{padding:'8px 0'}}><strong>Step {f.step}: {f.title}</strong> <span className="muted">({f.source==='signal'?'Deterministic signal':'Spark claim'}; {f.evidence_count} evidence reference{f.evidence_count===1?'':'s'})</span>{f.mechanism&&<p className="muted">{f.mechanism}</p>}{references[f.id]?.map(ref=><p key={ref}><>{citationTarget(ref,availableRefs)?<a className="textlink mono" href={citationTarget(ref,availableRefs)!}>{ref}</a>:<><code>{ref}</code> <span className="muted">Source reference; timeline origin unavailable.</span></>}</></p>)}</li>)}</ol>:<p className="muted">No findings are stored for this run.</p>}
 </section>;
}
