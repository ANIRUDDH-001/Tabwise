// Explicit non-conversion boundary. Even product-shaped input must go through product ingestion;
// this diagnostic helper cannot grant COMPLETE_OBSERVATION or observed-nvda provenance.
export function productCompatibility(value){
 const experimental=['tabwise-r2-run-evidence/1','tabwise-r2-page-evidence/1'].includes(value?.schema);
 return {compatible:false,converted:null,reasons:[experimental?'Experimental R2 evidence has no qualified product-worker identity or product manifest.':'Product evidence requires independent schema, manifest, ownership, worker identity and qualification checks; no conversion is supplied.']};
}
