import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export const REVIEW_FILES=Object.freeze([
 '.github/workflows/tabwise-run.yml','packages/contracts/index.mjs','packages/contracts/limits.mjs','packages/contracts/palette.mjs','packages/contracts/schemas.mjs',
 'scripts/check-r1-baseline.mjs','scripts/tabwise-run.mjs','scripts/tabwise/executor.mjs','scripts/tabwise/input-policy.mjs','scripts/tabwise/network.mjs',
 'scripts/tabwise/observer.mjs','scripts/tabwise/observer-qualification.mjs','scripts/tabwise/review-approval.mjs','scripts/tabwise/worker.mjs','src/r2/capture.mjs','src/repair/apply.mjs',
].sort());
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export function reviewContentDigest(root=ROOT){
 const hash=createHash('sha256');
 for(const file of REVIEW_FILES){const bytes=readFileSync(resolve(root,file));hash.update(`${file}\0${createHash('sha256').update(bytes).digest('hex')}\n`);}
 return hash.digest('hex');
}
export function checkReviewApproval(status,root=ROOT){
 const errors=[];
 if(status?.verdict!=='PASS')errors.push('independent review is BLOCK');
 for(const field of ['reviewer','review_ref','owner_approval_ref'])if(typeof status?.[field]!=='string'||!status[field].trim())errors.push(`missing ${field}`);
 if(JSON.stringify(status?.reviewed_files)!==JSON.stringify(REVIEW_FILES))errors.push('review file scope differs');
 try{if(status?.reviewed_sha256!==reviewContentDigest(root))errors.push('reviewed content changed');}catch{errors.push('reviewed content unavailable');}
 return {ok:errors.length===0,errors};
}
