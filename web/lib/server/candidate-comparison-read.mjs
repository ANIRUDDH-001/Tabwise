import {sha256} from '../../../packages/contracts/index.mjs';
import {stable} from '../../../packages/contracts/r2-product.mjs';
export function readCandidateComparison(id,saved){
 const r=saved?.result;
 if(!r||sha256(stable(r))!==saved.sha256||r.schema!=='tabwise-candidate-repair-comparison/1'||r.product_run_id!==id||r.classification!=='NONPRODUCTION_UNQUALIFIED'||r.production_qualified!==false||r.independent_qualification!==false||!['FIXED','NOT_FIXED','REGRESSED','INCONCLUSIVE'].includes(r.verdict)||r.verdict==='FIXED'&&stable(r.checks)!==stable({symptom_gone:true,other_steps_preserved:true,evidence_complete:true}))throw Error('immutable candidate comparison readback refused');
 return r;
}
