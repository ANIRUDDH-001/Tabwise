import {assertContract,sha256} from '../../packages/contracts/index.mjs';
// Caller supplies evidence only after the stored artifact reader recomputes its provenance.
export function diagnosisInput({run,evidence,source}){
 assertContract('evidence-bundle',evidence);
 if(run.status!=='completed'||run.evidence_status!=='complete'||evidence.evidence_status!=='complete'||evidence.provenance!=='observed-nvda'||evidence.run_id!==run.id||evidence.journey_id!==run.journey_id)throw Error('qualified evidence required');
 if(typeof source!=='string'||sha256(source)!==run.spec?.app_hash)throw Error('matching run source required');
 const timeline=Object.values(evidence.lanes).flat().map(event=>structuredClone(event));
 const input={version:'0.1.0',run_id:run.id,journey:run.spec.steps,evidence_refs:timeline.map(e=>e.evidence_ref),timeline,signals:[],axe:{violations:evidence.axe.reduce((n,a)=>n+a.violations,0),rules_checked:0},source:[{path:'index.html',sha256:sha256(source),lines:source.split('\n').map((text,n)=>({n:n+1,text}))}]};
 return assertContract('diagnosis-input',input);
}
