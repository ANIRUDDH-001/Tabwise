const SOURCES=new Set(['signal','spark']);
const VERDICTS=new Set(['barrier_found','no_barrier','insufficient_evidence']);
const text=(value,max)=>typeof value==='string'?value.slice(0,max):null;

// A model finding is a claim about complete evidence, never a repair verdict.
export function reviewView(evidenceStatus,findings,diagnoses){
 if(evidenceStatus!=='complete')return {findings:[],diagnoses:[]};
 return {
  findings:(Array.isArray(findings)?findings:[]).filter(row=>row&&SOURCES.has(row.source)&&Number.isInteger(row.step)&&row.step>=0&&typeof row.title==='string').slice(0,25).map(row=>({id:row.id,source:row.source,step:row.step,title:text(row.title,200),mechanism:text(row.mechanism,2000),confidence:text(row.confidence,40),evidence_count:Array.isArray(row.evidence_refs)?row.evidence_refs.length:0})),
  diagnoses:(Array.isArray(diagnoses)?diagnoses:[]).filter(row=>row&&row.model==='muse-spark-1.3'&&VERDICTS.has(row.output?.verdict)).slice(0,10).map(row=>({id:row.id,model:row.model,verdict:row.output.verdict})),
 };
}
