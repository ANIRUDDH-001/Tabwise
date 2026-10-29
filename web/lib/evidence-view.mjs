export const evidenceRefreshKey=run=>[run.status,run.evidence_status,run.diagnostic_evidence_available===true].join(':');
export const citationTarget=(ref,available)=>available.includes(ref)?`#evidence-${ref}`:null;
