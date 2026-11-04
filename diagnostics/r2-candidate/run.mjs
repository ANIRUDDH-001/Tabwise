// Candidate entry; no production qualification.
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,existsSync,realpathSync} from 'node:fs';
import {generateKeyPairSync} from 'node:crypto';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {CLASSIFICATION,REF,sourceDigest,candidatePacket,candidateBinding,checkCandidateApproval,assertProductionBlocked,readCandidateEnvelope} from './policy.mjs';
import {createAuthority,createCoordinator,publicText,requestPageAdmission,verifyAdmissionRecord,canonical} from '../../scripts/tabwise/r2-admission.mjs';
import {checkFrozenIntegrity} from '../../scripts/check-r1-baseline.mjs';
import {parseUniqueJson} from '../../src/r2/strict-json.mjs';
import {indexFiles} from '../r2-native/verify.mjs';
const root=resolve(import.meta.dirname,'../..'),entry=resolve(import.meta.dirname,'run.mjs');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000}).trim();
const save=(dir,name,value)=>writeFileSync(join(dir,name),JSON.stringify(value,null,2)+'\n');
const readPublic=path=>{const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||s.size>100000)throw Error('candidate public context refused');return parseUniqueJson(readFileSync(path,'utf8'));};
export function assertChildCompleted(child,hasSession){if(child?.exit_code!==0||child?.outcome!=='accepted')throw Error('candidate page failed; inspect original stderr.log and custody');if(!hasSession)throw Error('candidate page completed without original session record');}

async function main(){
 const mode=process.argv[2]??'--run',env=process.env,head=git('rev-parse','HEAD'),scope=sourceDigest(root);
 const input=readCandidateEnvelope(env.TABWISE_CANDIDATE_REQUEST_JSON,{head,scope}),r=input.request;
 if(mode==='--packet'||mode==='--bootstrap'){
  const runId=mode==='--packet'?process.argv[3]:env.GITHUB_RUN_ID,issuedAt=new Date().toISOString(),expiresAt=new Date(Date.now()+3600000).toISOString();
  if(git('status','--porcelain','--untracked-files=all'))throw Error('candidate refused: clean source required for packet');
  assertProductionBlocked(root);
  const packet=candidatePacket({request:r,githubRunId:runId,issuedAt,expiresAt});
  if(mode==='--bootstrap'){const directory=join(env.RUNNER_TEMP,'tabwise-candidate-bootstrap');mkdirSync(directory);save(directory,'approval-packet.json',packet);save(directory,'request.json',{request:r,spec_text:input.spec_text});}
  console.log(JSON.stringify({authorizing:false,review_only:true,packet},null,2));return;
 }
 if(!['--check-only','--initialize','--worker','--run'].includes(mode)||process.argv.length!==3&&process.argv.length!==2)throw Error('candidate refused: invalid mode');
 const failures=checkCandidateApproval({request:r,approval:env.TABWISE_CANDIDATE_EXECUTION_APPROVAL,env,head,sourceDigest:scope,platform:process.platform,execArgv:process.execArgv});
 if(failures.length)throw Error('BLOCK: '+failures.join('; '));
 assertProductionBlocked(root);const frozen=checkFrozenIntegrity(root);if(!frozen.ok)throw Error('BLOCK: frozen runtime changed');
 if(git('status','--porcelain','--untracked-files=all'))throw Error('BLOCK: candidate checkout dirty');
 const approval=parseUniqueJson(env.TABWISE_CANDIDATE_EXECUTION_APPROVAL),temp=realpathSync(env.RUNNER_TEMP),rel=relative(root,temp);
 if(!rel||!isAbsolute(rel)&&rel.split(/[\\/]/)[0]!=='..')throw Error('candidate refused: external runtime directory required');
 const out=join(temp,'tabwise-r2-candidate'),source=join(out,'source'),page=input.plan.pages[0],consumer={run_id:env.GITHUB_RUN_ID,attempt:2},binding=candidateBinding(r,approval),id='candidate-'+r.product_run_id;
 if(mode==='--check-only'){console.log(JSON.stringify({candidate_authorized:true,classification:CLASSIFICATION,production_qualified:false,product_run_id:r.product_run_id,revision:head}));return;}
 if(mode==='--initialize'){
  mkdirSync(out);save(out,'request.json',{request:r,spec_text:input.spec_text});writeFileSync(join(out,'saved-spec.json'),input.spec_text,{flag:'wx'});save(out,'setup.json',{stage:'native-not-started',classification:CLASSIFICATION,production_qualified:false});return;
 }
 const {r2SessionData,r2ChildEnv,r2PageExit,runR2Pages,r2RunSealable}=await import('../../scripts/tabwise/r2-run.mjs');
 if(mode==='--worker'){
  const authority=readPublic(env.TABWISE_CANDIDATE_AUTHORITY_FILE);
  if(authority.id!==id||canonical(authority.binding)!==canonical(binding)||canonical(authority.consumer)!==canonical(consumer))throw Error('candidate refused: process authority context mismatch');
  await requestPageAdmission({...authority,page:page.id});
  const {loadR2Runtime}=await import('../../scripts/tabwise/r2-loader.mjs');
  const runtime=await loadR2Runtime({root,additionalIntegrity:()=>sourceDigest(root)===scope?[]:['candidate source changed']});
  const stop=()=>{if(!runtime.guard.isStopped())runtime.guard.stop('candidate cancelled','timeout');};
  for(const signal of ['SIGINT','SIGTERM','SIGBREAK'])process.on(signal,stop);const timer=setTimeout(stop,150000);
  try{
   const {runR2Session}=await import('../../scripts/tabwise/r2-session.mjs');
   const result=await runR2Session(runtime,r2SessionData(input.plan,page,input.fixture,join(source,page.id)));
   save(out,'session.json',result);save(out,'owned-process.json',{process:runtime.observedProcess(),exit:runtime.processExit()});
   console.log(JSON.stringify(r2PageExit({page:page.id,completed:result.completed,nvda:result.nvda,manifest_sha256:result.manifest_sha256,reasons:[...result.reasons,...result.cleanup_errors]})));
   process.exitCode=result.completed?0:2;
  }finally{clearTimeout(timer);for(const signal of ['SIGINT','SIGTERM','SIGBREAK'])process.off(signal,stop);}return;
 }
 if(!existsSync(out))throw Error('candidate refused: initialized request required');
 if(canonical(readPublic(join(out,'request.json')))!==canonical({request:r,spec_text:input.spec_text}))throw Error('candidate delivery changed');
 mkdirSync(source);
 const report={schema:'tabwise-candidate-native-report/1',classification:CLASSIFICATION,production_qualified:false,request_sha256:r.request_sha256,product_run_id:r.product_run_id,approval,pass:false,errors:[]};save(out,'report.json',report);
 const {openCandidateStore}=await import('./store.mjs'),store=openCandidateStore({path:join(out,'consumption.sqlite'),id,binding,consumer});
 const pair=generateKeyPairSync('ed25519');
 // Candidate-only issuer key remains in this trusted supervisor's memory. It is
 // never persisted, inherited by the native child, or accepted by production.
 const authority={id,binding,consumer,publicKey:publicText(pair.publicKey)};save(out,'authority.json',authority);
 const transport=createAuthority({rpc:store.rpc,signingKey:pair.privateKey,authenticate:async()=>({repository:r.repository,workflow:r.workflow,revision:head,actor:env.GITHUB_ACTOR,run_id:consumer.run_id,attempt:consumer.attempt})});
 let coordinator;
 try{
  coordinator=await createCoordinator({...authority,transport});save(out,'receipt.json',coordinator.receipt);
  const {windowsProcessTools,processBaseline,quiescenceOf}=await import('../../scripts/tabwise/r2-proctree.mjs');
  const tools=windowsProcessTools({spawn,env});report.preflight=await processBaseline(tools);save(out,'report.json',report);
  if(!report.preflight.quiescent)throw Error('candidate baseline not quiescent');
  const childEnv={...r2ChildEnv(env),TABWISE_CANDIDATE_REQUEST_JSON:JSON.stringify({request:r,spec_text:input.spec_text}),TABWISE_CANDIDATE_EXECUTION_APPROVAL:env.TABWISE_CANDIDATE_EXECUTION_APPROVAL,TABWISE_CANDIDATE_AUTHORITY_FILE:join(out,'authority.json')};
  let stdout='',stderr='';const cancel=new AbortController(),stop=()=>cancel.abort();
  for(const signal of ['SIGINT','SIGTERM','SIGBREAK','SIGHUP'])process.on(signal,stop);
  let outcome;
  try{outcome=await runR2Pages({pages:[page.id],timeoutMs:approval.max_ms,killGraceMs:5000,maxOutputBytes:1048576,processes:tools,signal:cancel.signal,protect:[process.pid,process.ppid],
   launch:()=>{
    const child=spawn(process.execPath,[entry,'--worker'],{cwd:root,env:childEnv,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe','ipc']});
    child.stdout.on('data',b=>{stdout=(stdout+b.toString()).slice(0,1048576);});
    child.once('message',value=>{(async()=>{if(value?.schema!=='tabwise-r2-page-challenge/1'||Object.keys(value).sort().join(',')!=='challenge,schema')throw Error('invalid candidate IPC');const grant=await coordinator.grant(value.challenge,{pid:child.pid,ppid:process.pid,page:page.id});save(out,'page-grant.json',grant);if(child.connected)child.send(grant,error=>{if(error)cancel.abort();});})().catch(()=>{cancel.abort();if(child.connected)child.disconnect();});});return child;
   },onStderr:(_id,b)=>{stderr+=b.toString();if(Buffer.byteLength(stderr)>1048576){stderr=stderr.slice(0,524288);cancel.abort();}}
  });}finally{for(const signal of ['SIGINT','SIGTERM','SIGBREAK','SIGHUP'])process.off(signal,stop);}
  writeFileSync(join(out,'stdout.log'),stdout);writeFileSync(join(out,'stderr.log'),stderr);report.outcome=outcome;report.child=outcome.pages[0];report.custody=report.child.custody;
  const snapshot=await tools.snapshot();report.post={...quiescenceOf(snapshot),helper_processes:snapshot.processes.filter(p=>/^nvdahelperremoteloader\.exe$/i.test(p.name))};
  assertChildCompleted(report.child,existsSync(join(out,'session.json')));
  const session=readPublic(join(out,'session.json'));
  if(r2RunSealable(outcome)&&report.custody?.confirmed&&existsSync(join(source,page.id,'manifest.json'))){
   const {sealR2Run,verifyR2Run}=await import('../../scripts/tabwise/r2-evidence.mjs'),approved={query:page.query,fixture_sha256:r.fixture_sha256,task:page.task},inputs={[page.id]:{fixture:input.fixture,approved}};
   const sealed=await sealR2Run(source,{enabled:true,plan:input.plan,pages:[{id:page.id,exit_code:report.child.exit_code}],inputs});report.sealed=await verifyR2Run(source,{plan:input.plan,inputs});
   const record=coordinator.record(sealed.manifest_sha256);verifyAdmissionRecord(record,{...authority,manifest:sealed.manifest_sha256,pages:[page.id]});save(out,'admission.json',record);
  }
  const {nativeComplete}=await import('./verify.mjs');
  report.pass=nativeComplete(session,report)&&report.sealed?.ok===true&&report.sealed.run_class==='synthetic';
  if(sourceDigest(root)!==scope)throw Error('candidate source changed after capture');assertProductionBlocked(root);
 }catch(error){report.errors.push(error.message);report.pass=false;}
 finally{store.close();save(out,'report.json',report);save(out,'index.json',indexFiles(out));}
 console.log(JSON.stringify({classification:CLASSIFICATION,product_run_id:r.product_run_id,pass:report.pass,production_qualified:false,errors:report.errors}));process.exitCode=report.pass?0:2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error('candidate refused: '+error.message);process.exitCode=2;});
