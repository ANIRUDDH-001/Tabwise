// Fresh product capture only. Never imports or reclassifies an existing diagnostic archive.
import {mkdirSync,writeFileSync,readFileSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,dirname,basename,join,relative,isAbsolute} from 'node:path';
import {validateProductDelivery} from './product-delivery.mjs';
import {verifyNativePlanAdmission} from './native-plan.mjs';
import {canonical,verifyPageGrant,bindingFromGate} from '../../scripts/tabwise/r2-admission.mjs';
import {loadAdmissionPolicy,admissionConsumer} from '../../scripts/tabwise/r2-admission-transport.mjs';
import {readR2Status,checkR2Approval} from '../../scripts/tabwise/r2-policy.mjs';
import {execFileSync} from 'node:child_process';
import {sha256} from '../../packages/contracts/index.mjs';
import {stable} from '../../packages/contracts/r2-product.mjs';
import {parseUniqueJson} from './strict-json.mjs';
import {validateRuntimeMetadata} from './runtime-metadata.mjs';
const used=new WeakSet(),pending=new WeakMap(),root=resolve(import.meta.dirname,'../..');
const refuse=why=>{throw Error('native product producer refused: '+why);};

// Lifecycle around the existing single protected input entry. This module neither
// imports nor invokes a session, observer, executor or alternate input factory.
export async function beginNativeProductPage({runtime,delivery,github,receipt,requestReceipt,pageGrant,outputDir,evidenceDir:rawDirectory}){
 const d=validateProductDelivery(structuredClone(delivery)),r=d.request,g=structuredClone(github);
 // The caller cannot introduce a key, clock, status or alternate source root.
 const policy=loadAdmissionPolicy(),status=readR2Status(root),plan=parseUniqueJson(d.plan_text),consumer=admissionConsumer(process.env);
 const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000}).trim();
 const approval=checkR2Approval({env:process.env,head,status,plan:Buffer.from(d.plan_text),root,platform:process.platform});
 if(!approval.ok||g?.runId!==consumer.run_id||r.revision!==head)refuse('approved current product source required');
 if(execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000}).trim())refuse('clean reviewed checkout required');
 const a={id:policy.authorization_id,binding:bindingFromGate({status,head,plan},policy),consumer,publicKey:policy.receipt_public_key};
 const consumption=structuredClone(receipt),requestAdmission=structuredClone(requestReceipt),grant=structuredClone(pageGrant);
 verifyNativePlanAdmission({delivery:d,githubRunId:g?.runId,authority:a,receipt:consumption,requestReceipt:requestAdmission});
 const challenge=grant?.grant?.payload?.challenge;
 if(challenge?.page!==r.page_id||challenge.pid!==process.pid||challenge.ppid!==process.ppid||canonical(grant.receipt)!==canonical(consumption))refuse('owned page grant required');
 verifyPageGrant(grant,{...a,challenge});
 // Importing the loader does not load or start its runtime. The brand is private
 // to the existing loader; plain objects and archived session reports cannot pass.
 const {isR2Runtime}=await import('../../scripts/tabwise/r2-loader.mjs');
 if(!isR2Runtime(runtime))refuse('authentic owned runtime required');
 runtime.assertAuthentic();
 if(runtime.getGate()!==runtime.guard||runtime.guard.isStopped()||used.has(runtime))refuse('live unused owned runtime required');
 const [{r2Digest},{qualificationDigest},{verifyBoundProductDelivery}]=await Promise.all([
  import('../../scripts/tabwise/r2-policy.mjs'),import('../../scripts/tabwise/qualification-policy.mjs'),import('../../scripts/tabwise/product-workflow-boundary.mjs')]);
 verifyBoundProductDelivery({delivery:d,identity:r,github:g,sourceDigest:r2Digest(root),qualificationDigest:qualificationDigest(root)});
 const candidate=resolve(outputDir),parent=dirname(candidate);
 if(lstatSync(parent).isSymbolicLink()||!lstatSync(parent).isDirectory())refuse('regular external output parent required');
 const output=join(realpathSync(parent),basename(candidate)),rel=relative(realpathSync(root),output);
 if(!rel||!isAbsolute(rel)&&rel.split(/[\\/]/)[0]!=='..')refuse('output must be outside checkout');
 // Burn before I/O: even an interrupted output is never resumed as a new capture.
 used.add(runtime);mkdirSync(output);
 const intent={schema:'tabwise-native-product-session-intent/1',request:r,github:g,
  consumption_receipt:consumption,request_receipt:requestAdmission,page_grant:grant};
 const intentBytes=Buffer.from(canonical(intent)+'\n');
 writeFileSync(join(output,'product-session-intent.json'),intentBytes,{flag:'wx'});
 const page=plan.pages[0],evidenceDir=rawDirectory?resolve(rawDirectory):join(output,page.id);
 const rawRelative=relative(realpathSync(root),join(realpathSync(dirname(evidenceDir)),basename(evidenceDir)));
 if(!rawRelative||!isAbsolute(rawRelative)&&rawRelative.split(/[\\/]/)[0]!=='..')refuse('raw evidence must be outside checkout');
 const {r2SessionData}=await import('../../scripts/tabwise/r2-run.mjs');
 const data=r2SessionData(plan,page,Buffer.from(d.fixture_text),evidenceDir);
 const handle=Object.freeze({});
 pending.set(handle,{runtime,r,g,page,data,output,evidenceDir,intentBytes,r2Digest,qualificationDigest});
 return handle;
}

export async function finishNativeProductPage(handle,result){
 const state=pending.get(handle);if(!state)refuse('unused product session handle required');
 pending.delete(handle); // A failed completion cannot be retried with substituted observations.
 const {runtime,r,g,page,data,output,evidenceDir,intentBytes,r2Digest,qualificationDigest}=state;
 const {verifyR2PageEvidence}=await import('../../scripts/tabwise/r2-evidence.mjs');
 const sessionBytes=Buffer.from(stable(result)+'\n');
 writeFileSync(join(output,'product-session-result.json'),sessionBytes,{flag:'wx'});
 runtime.assertAuthentic();
 const verified=await verifyR2PageEvidence(evidenceDir,{fixture:data.fixture,approved:data.approved});
 const manifestBytes=readFileSync(join(evidenceDir,'manifest.json')),manifest=parseUniqueJson(manifestBytes.toString('utf8'));
 const capture=parseUniqueJson(readFileSync(join(evidenceDir,'capture.json'),'utf8'));
 const events=readFileSync(join(evidenceDir,'events.jsonl'),'utf8').trimEnd().split('\n').map(parseUniqueJson);
 const rows=events.filter(e=>e.phase==='native-runtime');
 if(rows.length!==1)refuse('unique observed runtime journal required');
 const metadata=validateRuntimeMetadata(rows[0].runtime),owned=runtime.observedProcess();
 if(!owned||['pid','created','path_sha256'].some(k=>metadata.process_identity[k]!==owned[k]))refuse('observed owned process changed');
 if(!verified.ok||verified.class!=='synthetic'||manifest.class!=='synthetic'||manifest.incomplete.length||
  result.schema!=='tabwise-r2-session-result/1'||result.fixture_id!==r.page_id||result.completed!==true||result.nvda!=='stopped'||
  result.runtime_checks?.brand!==true||result.runtime_checks?.post_session_authentic!==true||result.cleanup_errors?.length!==0||result.reasons?.length!==0||result.unexpected_loopback_requests!==0||result.lifecycle?.clean!==true||
  result.manifest_sha256!==sha256(manifestBytes)||capture.source!=='nvda'||capture.completed!==true||capture.outcome!=='COMPLETE'||
  !capture.raw?.length||capture.records?.length!==page.task.length||runtime.getGate()!==runtime.guard||runtime.guard.isStopped()||runtime.guard.status().live!==0||runtime.startupState().owned!==false)refuse('fresh complete native observation and cleanup required');
 if(r2Digest(root)!==r.r2_source_sha256||qualificationDigest(root)!==r.qualification_sha256)refuse('source changed during native observation');
 // This separate producer record describes THIS fresh branded session. The legacy
 // raw manifest is preserved byte-for-byte with its original synthetic class.
 // It is unsigned and cannot enter qualified product storage without independent
 // coordinator/custody verification and the separate native attester policy.
 const record={schema:'tabwise-native-product-session/1',producer_class:'genuine-unqualified',raw_manifest_class:manifest.class,
  request_sha256:r.request_sha256,product_run_id:r.product_run_id,github_run_id:g.runId,github_run_attempt:1,
  r2_source_sha256:r.r2_source_sha256,qualification_sha256:r.qualification_sha256,page_id:r.page_id,session:manifest.page.session,
  page_manifest_sha256:sha256(manifestBytes),intent_sha256:sha256(intentBytes),session_result_sha256:sha256(sessionBytes),runtime:metadata,
  association:'observation-window-only',physical_quiescence_verified:false,native_qualified:false};
 const bytes=Buffer.from(canonical(record)+'\n');
 writeFileSync(join(output,'product-session.json'),bytes,{flag:'wx'});
 return {outputDir:output,evidenceDir,session:result,producer:record,producer_sha256:sha256(bytes),source_verified:false,native_qualified:false};
}

// The sole protected entry supplies the accepted IPC grant and its exact session
// data. No product context means the existing diagnostic behavior is unchanged.
export async function beginConfiguredNativeProductPage(runtime,data,pageGrant){
 const path=process.env.TABWISE_R2_PRODUCT_CONTEXT;if(!path)return null;
 const stat=lstatSync(path);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>400000)refuse('bounded product context required');
 const context=parseUniqueJson(readFileSync(path,'utf8'));
 const d=validateProductDelivery(context.delivery),plan=parseUniqueJson(d.plan_text),page=plan.pages[0];
 const {r2SessionData,r2RunDir}=await import('../../scripts/tabwise/r2-run.mjs');
 const {admissionDirectory}=await import('../../scripts/tabwise/r2-admission-transport.mjs');
 const expected=r2SessionData(plan,page,Buffer.from(d.fixture_text),join(r2RunDir(process.env,root),page.id));
 const comparable=v=>({...v,fixture:Buffer.from(v.fixture).toString('base64')});
 if(canonical(comparable(data))!==canonical(comparable(expected)))refuse('exact protected session data required');
 const directory=join(admissionDirectory(r2RunDir(process.env,root),admissionConsumer(process.env)),'product');
 try{mkdirSync(directory);}catch(error){if(error.code!=='EEXIST'||lstatSync(directory).isSymbolicLink()||!lstatSync(directory).isDirectory())throw error;}
 return beginNativeProductPage({...context,runtime,pageGrant,outputDir:join(directory,page.id),evidenceDir:expected.evidenceDir});
}
