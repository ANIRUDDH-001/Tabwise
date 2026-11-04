import {test} from 'node:test';import assert from 'node:assert/strict';
import {readCandidateComparison} from '../lib/server/candidate-comparison-read.mjs';
import {sha256} from '../../packages/contracts/index.mjs';import {stable} from '../../packages/contracts/r2-product.mjs';
test('completed comparison recovery returns only the exact immutable owned result and never promotes incomplete checks',()=>{
 const result={schema:'tabwise-candidate-repair-comparison/1',product_run_id:'owned',classification:'NONPRODUCTION_UNQUALIFIED',production_qualified:false,independent_qualification:false,verdict:'FIXED',checks:{symptom_gone:true,other_steps_preserved:true,evidence_complete:true}},saved={result,sha256:sha256(stable(result))};
 assert.equal(readCandidateComparison('owned',saved),result);
 for(const edit of [r=>r.product_run_id='foreign',r=>r.production_qualified=true,r=>r.independent_qualification=true,r=>r.checks.other_steps_preserved=null,r=>r.verdict='COMPLIANT']){const bad=structuredClone(result);edit(bad);assert.throws(()=>readCandidateComparison('owned',{result:bad,sha256:sha256(stable(bad))}));}
 assert.throws(()=>readCandidateComparison('owned',{result,sha256:'f'.repeat(64)}));
});
