// Reuses the existing W5 coordinator; no second consumption or launch authority.
import {bindingFromGate,createCoordinator,canonical,verifyAdmissionRecord} from '../../scripts/tabwise/r2-admission.mjs';
import {validateAdmissionPolicy} from '../../scripts/tabwise/r2-admission-transport.mjs';
import {verifyBoundProductDelivery} from '../../scripts/tabwise/product-workflow-boundary.mjs';
import {requestNativePlanAdmission} from './product-worker.mjs';
import {materializeNativePlan} from './native-plan.mjs';
import {readFileSync,writeFileSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {parseUniqueJson} from './strict-json.mjs';
import {sha256} from '../../packages/contracts/index.mjs';
import {r2RunAcceptance} from '../../scripts/tabwise/r2-run.mjs';
export async function prepareNativeProductCoordinator({gate,delivery,github,policy,root,outputDir,transport,getIDToken,fetchImpl}){
 const p=validateAdmissionPolicy(policy),binding=bindingFromGate(gate,p),consumer={run_id:github?.runId,attempt:github?.attempt};
 const d=verifyBoundProductDelivery({delivery,identity:delivery?.request,github,sourceDigest:gate.status.reviewed_sha256,qualificationDigest:gate.status.qualification_sha256});
 if(gate.head!==d.request.revision)throw Error('product coordinator revision mismatch');
 const authority={id:p.authorization_id,binding,consumer,publicKey:p.receipt_public_key};
 // This is the only consume. A later failure intentionally loses the coordinator
 // capability; no readback/recovery branch creates a replacement launch owner.
 const coordinator=await createCoordinator({...authority,transport});
 const receipt=coordinator.receipt;
 const {requestReceipt}=await requestNativePlanAdmission({origin:p.authority_origin,delivery:d,githubRunId:consumer.run_id,authority,receipt,getIDToken,fetchImpl});
 const nativePlan=materializeNativePlan({root,outputDir,delivery:d,githubRunId:consumer.run_id,authority,receipt,requestReceipt});
 return {coordinator,nativePlan,authority,context:{delivery:d,github:structuredClone(github),receipt,requestReceipt},input_authorized:false,native_qualified:false};
}

export function sealNativeProductRun({product,runDir,admissionDir,verification,outcome}){
 if(r2RunAcceptance(verification).length||outcome?.stopped_after!==null||outcome.pages?.length!==1||outcome.pages[0].exit_code!==0)throw Error('complete original run verification required');
 const r=product.context.delivery.request,id=r.page_id,directory=join(admissionDir,'product');
 const raw=readFileSync(join(runDir,'run-manifest.json'));
 if(sha256(raw)!==verification.manifest_sha256||verification.manifest.pages[0].id!==id)throw Error('original run manifest mismatch');
 const files=[];
 for(const name of ['product-session-intent.json','product-session-result.json','product-session.json']){
  const path=id+'/'+name,full=join(directory,path),stat=lstatSync(full);
  if(stat.isSymbolicLink()||!stat.isFile()||stat.size>1000000)throw Error('bounded fresh producer record required');
  const data=readFileSync(full);files.push({path,bytes:data.length,sha256:sha256(data)});
 }
 const record=parseUniqueJson(readFileSync(join(directory,id,'product-session.json'),'utf8'));
 if(record.producer_class!=='genuine-unqualified'||record.native_qualified!==false||record.request_sha256!==r.request_sha256||record.product_run_id!==r.product_run_id||record.github_run_id!==product.authority.consumer.run_id||record.page_manifest_sha256!==verification.manifest.pages[0].manifest_sha256)throw Error('fresh product session binding mismatch');
 const manifest={schema:'tabwise-native-product-run/1',producer_class:'genuine-unqualified',request_sha256:r.request_sha256,product_run_id:r.product_run_id,github_run_id:product.authority.consumer.run_id,github_run_attempt:1,raw_run_manifest_sha256:sha256(raw),files,native_qualified:false};
 const bytes=Buffer.from(canonical(manifest)+'\n'),digest=sha256(bytes),admission=product.coordinator.record(digest);
 verifyAdmissionRecord(admission,{...product.authority,manifest:digest,pages:[id]});
 writeFileSync(join(directory,'product-run.json'),bytes,{flag:'wx'});
 writeFileSync(join(directory,'product-admission.json'),canonical(admission)+'\n',{flag:'wx'});
 return {producer_manifest_sha256:digest,source_verified:false,native_qualified:false};
}

export async function prepareConfiguredNativeProductCoordinator({gate,policy,root,transport}){
 if(process.env.TABWISE_PRODUCT_BOUND!=='true')return null;
 const env=process.env,path=join(env.RUNNER_TEMP,'tabwise-product-delivery','delivery.json'),stat=lstatSync(path);
 if(!env.TABWISE_W5_PRODUCT_AUTH_TOKEN||env.TABWISE_W5_PRODUCT_AUTH_TOKEN.length>16384||/[\x00-\x20\x7f]/.test(env.TABWISE_W5_PRODUCT_AUTH_TOKEN))throw Error('authenticated product admission credential unavailable');
 if(stat.isSymbolicLink()||!stat.isFile()||stat.size>400000)throw Error('bounded product delivery required');
 const delivery=parseUniqueJson(readFileSync(path,'utf8')),github={workflow:delivery.request.workflow,revision:env.GITHUB_SHA,actor:env.GITHUB_ACTOR,triggeringActor:env.GITHUB_TRIGGERING_ACTOR,ref:env.GITHUB_REF,runId:env.GITHUB_RUN_ID,attempt:Number(env.GITHUB_RUN_ATTEMPT)};
 const ready=await prepareNativeProductCoordinator({gate,delivery,github,policy,root,transport,outputDir:join(env.RUNNER_TEMP,'tabwise-native-product-plan-'+github.runId+'-1'),
  getIDToken:async()=>{if(!env.TABWISE_W5_PRODUCT_AUTH_TOKEN)throw Error('authenticated product admission credential unavailable');return env.TABWISE_W5_PRODUCT_AUTH_TOKEN;}});
 const contextPath=join(env.RUNNER_TEMP,'tabwise-native-product-context-'+github.runId+'-1.json');
 writeFileSync(contextPath,JSON.stringify(ready.context),{flag:'wx'});
 return {...ready,childEnv:{TABWISE_R2_PRODUCT_CONTEXT:contextPath}};
}
