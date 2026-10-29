import {readFileSync,lstatSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {checkFrozenIntegrity} from '../check-r1-baseline.mjs';
import {qualificationDigest} from './qualification-policy.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const identity=file=>{const s=lstatSync(file,{bigint:true});if(!s.isFile()||s.isSymbolicLink())throw Error('non-regular qualification source');return [s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');};

// Full verification is a phase boundary. The send closure only compares file identities.
// Disk identity checks detect ordinary writes/replacements; full hashes at teardown remain required.
export function createQualificationIntegrity({root,head,reviewedDigest}){
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 const full=()=>{
  const errors=[...checkFrozenIntegrity(root).errors];
  if(git('rev-parse','HEAD')!==head||git('status','--porcelain','--untracked-files=all'))errors.push('qualification checkout changed');
  if(qualificationDigest(root)!==reviewedDigest)errors.push('reviewed content changed');
  return errors;
 };
 let errors=full();if(errors.length)throw Error(errors.join('; '));
 const lock=JSON.parse(readFileSync(resolve(root,'fixtures/r1/lock.json'),'utf8'));
 const files=[...new Set([...git('ls-files','-z').split('\0').filter(Boolean),...Object.keys(lock.dependencies)])].sort();
 if(files.length>2048)throw Error('qualification identity manifest exceeds bound');
 const manifest=Object.freeze(files.map(path=>Object.freeze({path,identity:identity(resolve(root,path)),sha256:hash(readFileSync(resolve(root,path)))})));
 const receipt=Object.freeze({head,reviewed_sha256:reviewedDigest,manifest_sha256:hash(JSON.stringify(manifest)),file_count:manifest.length,manifest});
 const checkSend=()=>{const errors=[];for(const row of manifest){try{if(identity(resolve(root,row.path))!==row.identity)errors.push(`source identity changed: ${row.path}`);}catch{errors.push(`source identity unavailable: ${row.path}`);}}return errors;};
 const verifyPhase=()=>{
  let errors;try{errors=full();}catch(error){errors=[`phase verification failed: ${error.message}`];}errors.push(...checkSend());
  for(const row of manifest){try{if(hash(readFileSync(resolve(root,row.path)))!==row.sha256)errors.push(`source hash changed: ${row.path}`);}catch{errors.push(`source hash unavailable: ${row.path}`);}}
  return {ok:errors.length===0,errors,manifest_sha256:receipt.manifest_sha256};
 };
 errors=verifyPhase().errors;if(errors.length)throw Error(errors.join('; '));
 return Object.freeze({receipt,checkSend,verifyPhase});
}
