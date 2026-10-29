// Default-disabled dedicated qualification entry. Built-ins + built-in-only integrity before dynamic imports.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkFrozenIntegrity} from './check-r1-baseline.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));let writer,loopback,phaseIntegrity;
try{
 if(process.env.TABWISE_QUALIFICATION_ENABLED!=='true')throw Error('BLOCK: observer qualification disabled by default');
 const frozen=checkFrozenIntegrity(root);if(!frozen.ok)throw Error(`BLOCK: ${frozen.errors.join('; ')}`);
 const {checkQualificationApproval,qualificationDigest}=await import('./tabwise/qualification-policy.mjs');
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim(),head=git('rev-parse','HEAD');
 const status=JSON.parse(readFileSync(resolve(root,'scripts/tabwise/qualification-status.json'),'utf8'));
 const approved=checkQualificationApproval({env:process.env,head,status,root});if(!approved.ok)throw Error(`BLOCK: ${approved.errors.join('; ')}`);
 if(git('status','--porcelain','--untracked-files=all'))throw Error('BLOCK: qualification checkout is not clean');
 if(process.argv.includes('--check-only')){console.log('Observer qualification approval and integrity checks passed; no runtime loaded.');}
 else{
  const {createQualificationWriter}=await import('./tabwise/qualification-evidence.mjs');
  const run=process.env.GITHUB_RUN_ID,attempt=Number(process.env.GITHUB_RUN_ATTEMPT),nonce=randomBytes(4).toString('hex');
  writer=createQualificationWriter(join(process.env.RUNNER_TEMP,'tabwise-observer',`${run}-${attempt}`),{head_sha:head,github_run_id:run,github_run_attempt:attempt,actor:process.env.GITHUB_ACTOR,workflow:'.github/workflows/tabwise-observer.yml',event:'workflow_dispatch',profile:'A15',owner_approval_ref:status.owner_approval_ref,review_ref:status.review_ref,reviewed_content_sha256:qualificationDigest(root),network_scope:'browser restrictions only; whole-VM egress unverified'});
  const {loadQualificationRuntime,isQualificationRuntime}=await import('./tabwise/qualification-loader.mjs');
  const {createQualificationIntegrity}=await import('./tabwise/qualification-integrity.mjs');
  phaseIntegrity=createQualificationIntegrity({root,head,reviewedDigest:status.reviewed_sha256});
  writer.append('events',{phase:'verified-source-boundary',receipt:phaseIntegrity.receipt});
  const runtime=await loadQualificationRuntime({root,additionalIntegrity:phaseIntegrity.checkSend});if(!isQualificationRuntime(runtime))throw Error('authentic qualification runtime required');
  const [{chromium},{createQualificationBrowser},{runObserverQualification}]=await Promise.all([import('@playwright/test'),import('./tabwise/qualification-providers.mjs'),import('./tabwise/qualification-core.mjs')]);
  const unexpected=[];loopback=createServer((request,response)=>{unexpected.push({method:request.method,url:request.url});response.writeHead(410);response.end();});
  await new Promise((ok,fail)=>{loopback.once('error',fail);loopback.listen(0,'127.0.0.1',ok);});
  const browser=createQualificationBrowser({chromium,port:loopback.address().port,nonce,timeoutMs:runtime.cfg.load_timeout_ms}),foreground=runtime.createForeground();
  const controller=new AbortController(),abort=()=>{controller.abort();if(!runtime.guard.isStopped())runtime.guard.stop('qualification signal/deadline','timeout');};
  const {installQualificationCrashHandlers}=await import('./tabwise/qualification-crash.mjs');
  const removeCrashHandlers=installQualificationCrashHandlers({abort,record:event=>writer.append('events',event)});
  process.once('SIGINT',abort);process.once('SIGTERM',abort);const deadline=setTimeout(abort,120000);
  let result;try{result=await runObserverQualification({runtime,browser,foreground,writer,nonce,signal:controller.signal});}
  finally{clearTimeout(deadline);process.off('SIGINT',abort);process.off('SIGTERM',abort);removeCrashHandlers();}
  result.unexpected_loopback_requests=unexpected;if(unexpected.length){result.candidate_pass=false;result.reasons.push('unexpected network request reached loopback listener');}
  result.teardown_integrity=phaseIntegrity.verifyPhase();try{runtime.assertAuthentic();}catch(error){result.teardown_integrity.ok=false;result.teardown_integrity.errors.push(error.message);}if(!result.teardown_integrity.ok){result.candidate_pass=false;result.reasons.push(...result.teardown_integrity.errors);}
  const sealed=writer.finish(result);writer=null;console.log(JSON.stringify({candidate_pass:result.candidate_pass,full_worker_ready:false,manifest_sha256:sealed.manifest_sha256}));
  process.exitCode=result.candidate_pass?0:2;
 }
}catch(error){
 if(writer)try{writer.finish({candidate_pass:false,full_worker_ready:false,relay_equivalence_verified:false,reasons:[error.message],qualification_incomplete:true,teardown_integrity:phaseIntegrity?phaseIntegrity.verifyPhase():null});}catch{console.error('Qualification evidence finalization failed; inspect retained partial journals.');}
 console.error(`Observer qualification refused/failed: ${error.message}`);process.exitCode=2;
}finally{if(loopback)await new Promise(resolve=>loopback.close(resolve));}
