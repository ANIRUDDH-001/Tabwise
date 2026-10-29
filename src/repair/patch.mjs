import {sha256,validateContract} from '../../packages/contracts/index.mjs';
import {applyPatch} from './apply.mjs';

export function validatePatchProposal({runId,source,baseSha256,evidenceRefs,knownEvidenceRefs,proposal}){
 const errors=[];
 if(typeof source!=='string'||sha256(source)!==baseSha256)errors.push('source does not match pinned base hash');
 if(!proposal||typeof proposal!=='object'||Array.isArray(proposal)||Object.keys(proposal).sort().join(',')!=='diff,expected_speech_after,rationale')errors.push('unknown or missing patch proposal field');
 if(!Array.isArray(evidenceRefs)||!evidenceRefs.length||!Array.isArray(knownEvidenceRefs)||evidenceRefs.some(ref=>!knownEvidenceRefs.includes(ref)))errors.push('unknown or missing evidence reference');
 if(errors.length)return {ok:false,errors};
 const contract={version:'0.1.0',run_id:runId,base_sha256:baseSha256,patch_sha256:typeof proposal.diff==='string'?sha256(proposal.diff):'',files:['index.html'],diff:proposal.diff,evidence_refs:[...evidenceRefs],rationale:proposal.rationale,expected_speech_after:proposal.expected_speech_after};
 errors.push(...validateContract('patch',contract).errors);
 let patched;
 if(!errors.length)try{patched=applyPatch({'index.html':source},proposal.diff);}catch(error){errors.push(error.message);}
 if(errors.length)return {ok:false,errors};
 return {ok:true,errors:[],contract,patched,checks:{base_hash_bound:true,evidence_refs_valid:true,applies_exactly:true,owned_file_only:true,bounded_diff:true},evidence_class:'MACHINE',independence:'L3'};
}

export function prepareFindings({input,output,source,baseSha256}){
 return output.findings.map(finding=>{
  const item={...structuredClone(finding),patch_contract:null,patch_validation:null};
  if(finding.patch){
   const checked=validatePatchProposal({runId:input.run_id,source,baseSha256,evidenceRefs:finding.evidence_refs,knownEvidenceRefs:input.evidence_refs,proposal:finding.patch});
   item.patch_validation={ok:checked.ok,errors:checked.errors,...(checked.ok?{checks:checked.checks,evidence_class:checked.evidence_class,independence:checked.independence}:{})};
   if(checked.ok)item.patch_contract=checked.contract;
  }
  return item;
 });
}
