// The one actual owner-reviewed Fernway repair. No production admission or model authority.
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {sha256} from '../../packages/contracts/index.mjs';
import {applyPatch} from '../../src/repair/apply.mjs';
const root=resolve(import.meta.dirname,'../..');
export const BASE_SHA='5ad4631558cdcc557770ae864957ffc167546cd0af58bd11258808e1c0e523be';
export const PATCH_SHA='015d122118b5306e9528048f83abf5f293cc5603422b6182bce06e06d743f739';
export const REPAIRED_SHA='1860345c688f2adfe7241b97f05ba32fe345f08b0594cff8476d7b6e70e484ce';
export const OWNER='6198bfc5-5937-46d9-8eac-9b7599cbee52';
export function repairContext(sourceRoot=root){return {base:readFileSync(join(sourceRoot,'fixtures/fernway/index.html'),'utf8').replaceAll('\r\n','\n'),patch:readFileSync(join(sourceRoot,'diagnostics/r2-candidate/focus-restoration.patch'),'utf8').replaceAll('\r\n','\n'),review:JSON.parse(readFileSync(join(sourceRoot,'diagnostics/r2-candidate/focus-restoration-review.json'),'utf8'))};}
export function materializeReviewedCandidate({base,patch,review}){
 if(sha256(base)!==BASE_SHA||sha256(patch)!==PATCH_SHA||review?.decision!=='approved'||review.reviewed_by!==OWNER||review.patch_sha256!==PATCH_SHA||review.base_sha256!==BASE_SHA||review.source_sha256!==REPAIRED_SHA||review.decision_text!=='Approve this exact focus-restoration patch')throw Error('exact actual candidate repair review/source required');
 const source=applyPatch({'index.html':base},patch)['index.html'];
 if(sha256(source)!==REPAIRED_SHA)throw Error('exact reviewed candidate application required');
 return {source,base_sha256:BASE_SHA,patch_sha256:PATCH_SHA,source_sha256:REPAIRED_SHA,review:structuredClone(review),classification:'NONPRODUCTION_UNQUALIFIED',production_qualified:false};
}
export function candidateFixture(variant,sourceRoot=root){const c=repairContext(sourceRoot);if(variant==='broken'){if(sha256(c.base)!==BASE_SHA)throw Error('original candidate source changed');return Buffer.from(c.base);}if(variant!=='patched')throw Error('unsupported candidate variant');return Buffer.from(materializeReviewedCandidate(c).source);}
