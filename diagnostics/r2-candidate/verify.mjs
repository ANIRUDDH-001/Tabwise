// Offline readback. Archive signatures establish consistency, not an independent
// trust anchor. Consumers must authenticate the originating GitHub artifact.
import {readFileSync,writeFileSync,mkdtempSync,cpSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {CLASSIFICATION,REF,WORKFLOW,sourceDigest,readCandidateEnvelope,candidatePacket,candidateBinding,assertProductionBlocked} from './policy.mjs';
import {checkIndex,indexFiles,filesUnder} from '../r2-native/verify.mjs';
import {canonical,verifyAdmissionRecord} from '../../scripts/tabwise/r2-admission.mjs';
import {verifyR2PageEvidence,verifyR2Run} from '../../scripts/tabwise/r2-evidence.mjs';
import {captureObservationSources} from '../../src/r2/capture-export.mjs';
import {validateRuntimeMetadata} from '../../src/r2/runtime-metadata.mjs';
import {parseUniqueJson} from '../../src/r2/strict-json.mjs';
import {sha256} from '../../packages/contracts/index.mjs';
const root=resolve(import.meta.dirname,'../..'),read=p=>parseUniqueJson(readFileSync(p,'utf8'));
const same=(a,b)=>canonical(a)===canonical(b);
const need=(ok,why)=>{if(!ok)throw Error('candidate verification refused: '+why);};
export function nativeComplete(s,r){
 return s?.completed===true&&s.runtime_checks?.brand===true&&s.runtime_checks?.post_session_authentic===true&&s.nvda==='stopped'&&s.cleanup_errors?.length===0&&s.reasons?.length===0&&s.unexpected_loopback_requests===0&&s.lifecycle?.clean===true&&r.preflight?.quiescent===true&&r.child?.exit_code===0&&r.child?.outcome==='accepted'&&r.custody?.confirmed===true&&r.custody?.quiescent===true&&r.custody.root?.exact===true&&r.custody.sample_failures===0&&r.custody.errors?.length===0&&r.post?.quiescent===true&&r.post.helper_processes?.length===0&&r.errors?.length===0;
}
export async function verifyCandidate(dir,{sourceRoot=root,env=process.env}={}){
 checkIndex(dir);assertProductionBlocked(sourceRoot);
 const head=execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8',windowsHide:true,timeout:10000}).trim();
 const input=readCandidateEnvelope(readFileSync(join(dir,'request.json'),'utf8'),{head,scope:sourceDigest(sourceRoot),sourceRoot}),r=input.request;
 need(readFileSync(join(dir,'saved-spec.json'),'utf8')===input.spec_text,'saved version bytes');
 const report=read(join(dir,'report.json')),p=report.approval;
 const expected=candidatePacket({request:r,githubRunId:env.GITHUB_RUN_ID,issuedAt:p?.issued_at,expiresAt:p?.expires_at});
 need(same(p,expected)&&env.GITHUB_SHA===head&&env.GITHUB_REPOSITORY===r.repository&&env.GITHUB_REF===REF&&env.GITHUB_WORKFLOW_REF===r.repository+'/'+WORKFLOW+'@'+REF&&env.GITHUB_RUN_ATTEMPT==='2'&&env.GITHUB_ACTOR===r.actor&&env.GITHUB_TRIGGERING_ACTOR===r.actor,'GitHub source/run identity');
 need(report.schema==='tabwise-candidate-native-report/1'&&report.classification===CLASSIFICATION&&report.production_qualified===false&&report.request_sha256===r.request_sha256&&report.product_run_id===r.product_run_id,'candidate classification/request');
 const page=input.plan.pages[0],approved={query:page.query,fixture_sha256:r.fixture_sha256,task:page.task},source=join(dir,'source');
 const pageResult=await verifyR2PageEvidence(join(source,page.id),{fixture:input.fixture,approved});
 const runResult=await verifyR2Run(source,{plan:input.plan,inputs:{[page.id]:{fixture:input.fixture,approved}}});
 need(pageResult.ok&&runResult.ok&&pageResult.class==='synthetic'&&runResult.run_class==='synthetic','sealed candidate source');
 const files=filesUnder(source),pageManifest=read(join(source,page.id,'manifest.json'));
 const authority=read(join(dir,'authority.json')),binding=candidateBinding(r,p),consumer={run_id:p.github_run_id,attempt:2},id='candidate-'+r.product_run_id;
 need(authority.id===id&&same(authority.binding,binding)&&same(authority.consumer,consumer),'candidate authority context');
 const admission=read(join(dir,'admission.json'));
 verifyAdmissionRecord(admission,{id,binding,consumer,publicKey:authority.publicKey,manifest:runResult.manifest_sha256,pages:[page.id]});
 need(same(read(join(dir,'receipt.json')),admission.receipt)&&same(read(join(dir,'page-grant.json')),admission.grants[0]),'W5 receipt/grant readback');
 const session=read(join(dir,'session.json'));
 need(report.pass===true&&nativeComplete(session,report)&&same(report.child,report.outcome?.pages?.[0])&&report.outcome.pages.length===1&&same(report.custody,report.child.custody),'native lifecycle/custody');
 need(session.manifest_sha256===sha256(files[page.id+'/manifest.json'])&&session.fixture_id===page.id&&admission.grants[0].grant.payload.challenge.pid===report.custody.root.pid,'session/worker binding');
 const rows=captureObservationSources({files,expected:{page_id:page.id,session:pageManifest.page.session,spec:input.spec}});
 const events=files[page.id+'/events.jsonl'].toString('utf8').trimEnd().split('\n').map(parseUniqueJson).filter(e=>e.phase==='native-runtime');
 need(events.length===1,'unique sealed runtime metadata');
 const runtime=validateRuntimeMetadata(events[0].runtime),owned=read(join(dir,'owned-process.json'));
 need(owned.process&&['pid','created','path_sha256'].every(k=>owned.process[k]===runtime.process_identity[k]),'owned native process identity');
 need(report.custody.observed.some(p=>p.pid===runtime.process_identity.pid&&p.created===runtime.process_identity.created&&p.depth>0),'native process belongs to worker custody');
 need(rows.some(row=>row.row.lane==='speech'),'actual native speech required');
 return {schema:'tabwise-candidate-readback/1',classification:CLASSIFICATION,production_qualified:false,integrity_pass:true,native_interaction_pass:true,request:r,github_run_id:p.github_run_id,github_run_attempt:2,runtime,rows,run_manifest_sha256:runResult.manifest_sha256};
}
export async function tamperChecks(dir,options){
 const scratch=mkdtempSync(join(tmpdir(),'candidate-tamper-')),results=[];
 try{for(const kind of ['source','saved-version','custody','classification','receipt']){
  const copy=join(scratch,kind);cpSync(dir,copy,{recursive:true});
  const path=join(copy,kind==='source'?'source/candidate-seat/capture.json':kind==='saved-version'?'saved-spec.json':kind==='receipt'?'receipt.json':'report.json');
  if(['source','saved-version'].includes(kind))writeFileSync(path,Buffer.concat([readFileSync(path),Buffer.from(' ')]));
  else{const v=read(path);if(kind==='custody')v.custody.confirmed=false;else if(kind==='classification')v.production_qualified=true;else v.signature='forged';writeFileSync(path,JSON.stringify(v));}
  writeFileSync(join(copy,'index.json'),JSON.stringify(indexFiles(copy)));
  let refused=false;try{await verifyCandidate(copy,options);}catch{refused=true;}
  need(refused,'tamper accepted '+kind);results.push({kind,refused});
 }}finally{rmSync(scratch,{recursive:true,force:true});}return results;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const options={sourceRoot:process.argv[3]?resolve(process.argv[3]):root},dir=resolve(process.argv[2]),result=await verifyCandidate(dir,options),negative=await tamperChecks(dir,options);console.log(JSON.stringify({...result,negative},null,2));}
 catch(e){console.log(JSON.stringify({integrity_pass:false,native_interaction_pass:false,production_qualified:false,error:e.message}));process.exitCode=1;}
}
