// D-73 owner-side decisions for ONE observer dispatch, used by d73-observer-dispatch.ps1. Pure functions over raw
// GitHub REST responses plus a local preflight. Never dispatches, cancels, sets variables or calls GitHub.
// The workflow admits the qualify job only while TABWISE_OBSERVER_APPROVED_REVISION equals the run SHA. GitHub
// evaluates that condition after accepting the dispatch (INFERENCE from D72 run 40826157539, skipped after an
// immediate deletion), so the variable is kept until the job is observed started or terminal, bounded by deadlines.
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const VARIABLE='TABWISE_OBSERVER_APPROVED_REVISION',JOB_NAME='qualify';
const SHA=/^[a-f0-9]{40}$/,DECISION=/^D-[0-9]+$/;
const parse=text=>{try{return JSON.parse(text);}catch{return null;}};

// Authenticated absence: the repository variable listing answered (exit 0, so HTTP 2xx), is complete and omits the
// name. Any error text, including "Not Found" from a missing executable or a 403/404 on the repository, is not absence.
export function variableAbsent({code,body,name=VARIABLE}){
 const list=code===0?parse(body):null;
 if(!list||!Array.isArray(list.variables)||list.total_count!==list.variables.length)return false;
 return !list.variables.some(variable=>String(variable?.name).toUpperCase()===name.toUpperCase());
}
export function variableReadBack({code,body,value}){const variable=code===0?parse(body):null;return variable?.name===VARIABLE&&variable?.value===value;}

const identityErrors=(run,revision,actor)=>{
 const errors=[];
 if(!/^[1-9][0-9]*$/.test(String(run?.id??'')))errors.push('run id');
 if(run?.head_sha!==revision)errors.push('head SHA');
 if(run?.head_branch!=='main')errors.push('branch');
 if(run?.event!=='workflow_dispatch')errors.push('event');
 if(run?.run_attempt!==1)errors.push('attempt');
 if(run?.actor?.login!==actor||run?.triggering_actor?.login!==actor)errors.push('actor');
 return errors;
};
const listRuns=({code,body})=>{const list=code===0?parse(body):null;return Array.isArray(list?.workflow_runs)?list.workflow_runs:null;};

// Read-only remote preflight: published main equals the revision on both channels, signed-in owner, variable absent,
// and no observer run is still pending anywhere (it could otherwise be admitted once the variable exists).
export function remotePreflight({revision,actor,lsRemote,commit,user,variables,runs}){
 const errors=[],remote=lsRemote?.code===0?String(lsRemote.out).trim().split(/\s+/):[];
 if(remote.length!==2||remote[0]!==revision||remote[1]!=='refs/heads/main')errors.push('origin refs/heads/main differs from revision');
 if(commit?.code!==0||parse(commit.body)?.sha!==revision)errors.push('GitHub API main differs from revision');
 if(user?.code!==0||parse(user.body)?.login!==actor)errors.push('signed-in gh user differs from status actor');
 if(!variableAbsent(variables??{}))errors.push('approval variable is not confirmed absent');
 const list=listRuns(runs??{});
 if(!list)errors.push('observer run listing unavailable');
 else if(list.some(run=>run.status!=='completed'))errors.push('an observer run is still pending or running');
 return {ok:errors.length===0,errors,known:(list??[]).map(run=>String(run.id))};
}

// One monitoring observation. Every run absent from the pre-dispatch snapshot is new; exactly one may be ours.
export function observe({runs,jobs,known,revision,actor,runId=null,dispatchRunId=null}){
 const list=listRuns(runs??{});if(!list)return {ok:false,reason:'run listing unavailable'};
 const seen=new Set((known??[]).map(String)),fresh=list.filter(run=>!seen.has(String(run.id)));
 let id=runId==null?null:String(runId),ambiguous=false;
 if(id==null){
  const matching=fresh.filter(run=>!identityErrors(run,revision,actor).length);
  if(matching.length>1||(dispatchRunId&&matching.length===1&&String(matching[0].id)!==String(dispatchRunId)))ambiguous=true;
  else if(matching.length===1)id=String(matching[0].id);
 }
 const extras=fresh.filter(run=>String(run.id)!==id).map(run=>({id:String(run.id),qualifying:run.head_branch==='main'&&run.head_sha===revision&&run.event==='workflow_dispatch',terminal:run.status==='completed'}));
 if(id==null)return {ok:true,run_id:null,ambiguous,extras,admission:'wait',terminal:false};
 const run=list.find(candidate=>String(candidate.id)===id);
 if(!run)return {ok:true,run_id:id,ambiguous,extras,admission:'wait',terminal:false,reason:'run not in listing'};
 const errors=identityErrors(run,revision,actor);
 if(errors.length)return {ok:true,run_id:id,ambiguous,extras,admission:'invalid',terminal:run.status==='completed',reason:`run identity changed: ${errors.join(', ')}`};
 const jobList=jobs?.code===0?parse(jobs.body)?.jobs:null,terminal=run.status==='completed',base={ok:true,run_id:id,ambiguous,extras,terminal,conclusion:run.conclusion??null};
 if(!Array.isArray(jobList))return {...base,admission:terminal?'not-admitted':'wait',reason:'jobs unavailable'};
 if(jobList.length>1||jobList.some(job=>job.name!==JOB_NAME))return {...base,admission:'invalid',reason:'unexpected job set'};
 const [job]=jobList;
 if(job?.status==='in_progress'||(job?.status==='completed'&&job.conclusion!=='skipped'&&job.started_at))return {...base,admission:'admitted'};
 if(job?.status==='completed'||terminal)return {...base,admission:'not-admitted',reason:`qualify job not admitted (${job?.conclusion??run.conclusion??'none'})`};
 return {...base,admission:'wait'};
}

export function runTerminal({code,body}){return code===0&&parse(body)?.status==='completed';}
export function dispatchRunId(out){return /\/actions\/runs\/([1-9][0-9]*)/.exec(String(out??''))?.[1]??null;}

export async function artifactEvidence({dir}){
 const {verifyQualificationArtifact}=await import('./qualification-evidence.mjs');
 let source=dir;
 try{
  const entries=readdirSync(dir,{withFileTypes:true});
  if(entries.length===1&&entries[0].isDirectory()&&/^[1-9]\d*-[1-9]\d*$/.test(entries[0].name))source=join(dir,entries[0].name);
 }catch(error){return {ok:false,errors:[error.message],candidate_pass:false};}
 const checked=verifyQualificationArtifact(source);
 let result=null;try{result=JSON.parse(readFileSync(join(source,'result.json'),'utf8'));}catch{}
 return {ok:checked.ok,errors:checked.errors,candidate_pass:checked.ok&&result?.candidate_pass===true};
}

// Local owner preflight at the exact revision: clean tree, HEAD, status metadata, digest and frozen R1.
export async function localPreflight({root,revision,ownerRef}){
 const errors=[],git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 if(!SHA.test(revision??''))errors.push('revision must be a full 40-character SHA');
 if(!DECISION.test(ownerRef??''))errors.push('owner reference must be D-<number>');
 try{if(git('rev-parse','HEAD')!==revision)errors.push('local HEAD differs from revision');if(git('status','--porcelain','--untracked-files=all'))errors.push('working tree is not clean');}catch{errors.push('git unavailable');}
 const {checkFrozenIntegrity}=await import('../check-r1-baseline.mjs'),frozen=checkFrozenIntegrity(root);if(!frozen.ok)errors.push(...frozen.errors);
 const {qualificationDigest,QUALIFICATION_FILES}=await import('./qualification-policy.mjs');let status;
 try{status=JSON.parse(readFileSync(resolve(root,'scripts/tabwise/qualification-status.json'),'utf8'));}catch{errors.push('status unreadable');}
 if(status){
  if(status.enabled!==true||status.verdict!=='PASS')errors.push('status is not enabled/PASS');
  if(status.owner_approval_ref!==ownerRef)errors.push('status owner reference differs');
  for(const field of ['reviewer','review_ref','actor'])if(typeof status[field]!=='string'||!status[field].trim())errors.push(`status ${field} missing`);
  if(JSON.stringify(status.reviewed_files)!==JSON.stringify(QUALIFICATION_FILES))errors.push('status reviewed scope differs');
  if(status.reviewed_sha256!==qualificationDigest(root))errors.push('status digest differs from qualification content');
 }
 return {ok:errors.length===0,errors,actor:status?.actor??null};
}

const DECIDE={absent:variableAbsent,readback:variableReadBack,remote:remotePreflight,observe,terminal:runTerminal,dispatch:({out})=>dispatchRunId(out),evidence:artifactEvidence};

// CLI: `preflight <sha> <D-n>`, or `decide` with base64 UTF-8 JSON {kind,input} on stdin. Failures print {ok:false}.
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [command,a,b]=process.argv.slice(2),root=fileURLToPath(new URL('../../',import.meta.url));
 try{
  if(command==='preflight'){const result=await localPreflight({root,revision:a,ownerRef:b});console.log(JSON.stringify(result));process.exitCode=result.ok?0:1;}
  else if(command==='decide'){
   const {kind,input}=JSON.parse(Buffer.from(readFileSync(0,'utf8').trim(),'base64').toString('utf8'));
   if(!Object.hasOwn(DECIDE,kind))throw Error(`unknown decision ${kind}`);
   console.log(JSON.stringify({ok:true,value:await DECIDE[kind](input)}));
  }else{console.error('usage: preflight <sha> <D-n> | decide < base64-json');process.exitCode=64;}
 }catch(error){console.log(JSON.stringify({ok:false,reason:`decision failure: ${error.message}`}));process.exitCode=1;}
}
