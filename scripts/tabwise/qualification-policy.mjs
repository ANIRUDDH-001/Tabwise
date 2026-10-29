import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ciGuardErrors,workflowGuardErrors} from '../../src/speech/runguard.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export const QUALIFICATION_FILES=Object.freeze([
 '.github/workflows/tabwise-observer.yml','scripts/tabwise-observer.mjs','scripts/check-r1-baseline.mjs',
 'scripts/tabwise/qualification-policy.mjs','scripts/tabwise/qualification-loader.mjs','scripts/tabwise/qualification-providers.mjs','scripts/tabwise/qualification-core.mjs','scripts/tabwise/qualification-evidence.mjs',
 'scripts/tabwise/network.mjs','scripts/tabwise/observer.mjs','scripts/tabwise/observer-qualification.mjs',
].sort());
export function qualificationDigest(root=ROOT){const hash=createHash('sha256');for(const file of QUALIFICATION_FILES){const bytes=readFileSync(resolve(root,file));hash.update(`${file}\0${createHash('sha256').update(bytes).digest('hex')}\n`);}return hash.digest('hex');}
export function checkQualificationApproval({env,head,status,root=ROOT,platform=process.platform}){
 const errors=[...ciGuardErrors(env),...workflowGuardErrors(env,head,{repository:'ANIRUDDH-001/Tabwise',ref:'refs/heads/main',workflow:'.github/workflows/tabwise-observer.yml'})];
 if(platform!=='win32')errors.push('Windows process required');
 if(status?.enabled!==true||status?.verdict!=='PASS')errors.push('qualification is BLOCK/disabled');
 for(const field of ['reviewer','review_ref','owner_approval_ref','actor'])if(typeof status?.[field]!=='string'||!status[field].trim())errors.push(`missing ${field}`);
 if(env.TABWISE_QUALIFICATION_ENABLED!=='true')errors.push('manual qualification opt-in absent');
 if(!/^[a-f0-9]{40}$/.test(head??'')||env.TABWISE_OBSERVER_APPROVED_REVISION!==head)errors.push('external owner-approved revision mismatch');
 if(!/^D-[0-9]+$/.test(env.TABWISE_OBSERVER_OWNER_APPROVAL??'')||env.TABWISE_OBSERVER_OWNER_APPROVAL!==status?.owner_approval_ref)errors.push('explicit owner decision mismatch');
 if(env.GITHUB_ACTOR!==status?.actor)errors.push('approved owner actor mismatch');
 if(!/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID??'')||env.GITHUB_RUN_ATTEMPT!=='1'||!env.RUNNER_TEMP)errors.push('single initial hosted attempt identity required');
 if(JSON.stringify(status?.reviewed_files)!==JSON.stringify(QUALIFICATION_FILES))errors.push('qualification reviewed scope mismatch');
 try{if(status?.reviewed_sha256!==qualificationDigest(root))errors.push('qualification content changed');}catch{errors.push('qualification content unavailable');}
 return {ok:errors.length===0,errors};
}
