import {sha256,validateContract} from '../../packages/contracts/index.mjs';
import {applyPatch} from './apply.mjs';
export function verifyRepairApplication({contract,baseSource,candidateSource}){
 const errors=validateContract('patch',contract).errors;
 if(!errors.length){
  if(sha256(baseSource)!==contract.base_sha256||sha256(contract.diff)!==contract.patch_sha256)errors.push('repair digest mismatch');
  try{if(applyPatch({'index.html':baseSource},contract.diff)['index.html']!==candidateSource)errors.push('candidate does not match exact patch');}catch(error){errors.push(error.message);}
 }
 return {schema:'tabwise-repair-inspection/1',ok:!errors.length,errors,source_sha256:typeof candidateSource==='string'?sha256(candidateSource):null,evidence_class:'MACHINE',independence:'L3',verdict:null};
}
