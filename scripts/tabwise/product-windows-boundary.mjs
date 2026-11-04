// Windows delivery/export CLI. Never imports a native runtime or obtains an OIDC token.
import {readFileSync,writeFileSync,appendFileSync,mkdirSync,readdirSync,lstatSync} from 'node:fs';
import {join,resolve,relative,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateProductDelivery} from '../../src/r2/product-delivery.mjs';
import {verifyWindowsDelivery,persistExportPackage,stageWindowsProductSource,inspectPersistedExport} from '../../src/r2/workflow-delivery.mjs';
import {buildWorkflowProductExport} from '../../src/r2/product-workflow-export.mjs';
import {r2Digest} from './r2-policy.mjs';
import {qualificationDigest} from './qualification-policy.mjs';
import {r2RunDir} from './r2-run.mjs';
import {admissionDirectory,admissionConsumer} from './r2-admission-transport.mjs';
import {sha256,LIMITS} from '../../packages/contracts/index.mjs';
import {safePath} from '../../packages/contracts/r2-product.mjs';
export function loadSealedFiles(dir){
 const files=Object.create(null);let total=0,entries=0;
 if(lstatSync(dir).isSymbolicLink())throw Error('sealed root symlink');
 const walk=(d,prefix='')=>{for(const name of readdirSync(d)){if(++entries>512)throw Error('sealed entry cap');const path=prefix+name,full=join(d,name),s=lstatSync(full);if(!safePath(path)||s.isSymbolicLink())throw Error('sealed source path');if(s.isDirectory())walk(full,path+'/');else{if(!s.isFile()||Object.keys(files).length>=97||(total+=s.size)>LIMITS.RUN_BYTES)throw Error('sealed source cap');files[path]=readFileSync(full);}}};
 walk(dir);return files;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const mode=process.argv[2],e=process.env,root=resolve(import.meta.dirname,'../..');
 if(process.argv.length!==3||!['verify','export'].includes(mode)||e.TABWISE_PRODUCT_BOUND!=='true'||process.platform!=='win32'||e.GITHUB_ACTIONS!=='true'||e.RUNNER_ENVIRONMENT!=='github-hosted'||process.execArgv.length||e.NODE_OPTIONS||e.NODE_PATH)throw Error('reviewed product Windows boundary required');
 const path=join(e.RUNNER_TEMP,'tabwise-product-delivery','delivery.json');if(lstatSync(path).size>400000||lstatSync(path).isSymbolicLink())throw Error('delivery artifact refused');
 const delivery=validateProductDelivery(JSON.parse(readFileSync(path))),github={workflow:'.github/workflows/tabwise-r2.yml',ref:e.GITHUB_REF,revision:e.GITHUB_SHA,actor:e.GITHUB_ACTOR,triggeringActor:e.GITHUB_TRIGGERING_ACTOR,runId:e.GITHUB_RUN_ID,attempt:Number(e.GITHUB_RUN_ATTEMPT)};
 if(e.GITHUB_REPOSITORY!=='ANIRUDDH-001/Tabwise'||e.GITHUB_WORKFLOW_SHA!==e.GITHUB_SHA||e.GITHUB_WORKFLOW_REF!=='ANIRUDDH-001/Tabwise/.github/workflows/tabwise-r2.yml@refs/heads/main'||e.ACTIONS_ID_TOKEN_REQUEST_TOKEN||e.ACTIONS_ID_TOKEN_REQUEST_URL)throw Error('Windows identity or credential isolation refused');
 const d=verifyWindowsDelivery({delivery,github,sourceDigest:r2Digest(root),qualificationDigest:qualificationDigest(root),requestSha256:e.PRODUCT_REQUEST_SHA256,productRunId:e.PRODUCT_RUN_ID,
  read:()=>({plan:Buffer.from(delivery.plan_text),fixture:Buffer.from(delivery.fixture_text)})});
 if(mode==='verify'){
  const stage=stageWindowsProductSource({delivery:d,root,outputDir:join(e.RUNNER_TEMP,'tabwise-product-source-'+github.runId+'-1')});
  if(!e.GITHUB_ENV||/[\r\n]/.test(stage.planPath))throw Error('bounded Actions environment path required');
  const out=join(e.RUNNER_TEMP,'tabwise-product-verified');mkdirSync(out);writeFileSync(join(out,'receipt.json'),JSON.stringify({product_run_id:d.request.product_run_id,request_sha256:d.request.request_sha256,github_run_id:github.runId,delivery_sha256:sha256(readFileSync(path)),source_package_sha256:stage.package_sha256,native_qualified:false}),{flag:'wx'});
  appendFileSync(e.GITHUB_ENV,'TABWISE_R2_PLAN_PATH='+stage.planPath+'\n');
 }else{
  const receipt=JSON.parse(readFileSync(join(e.RUNNER_TEMP,'tabwise-product-verified','receipt.json')));
  if(receipt.request_sha256!==d.request.request_sha256||receipt.product_run_id!==d.request.product_run_id||receipt.github_run_id!==github.runId||receipt.delivery_sha256!==sha256(readFileSync(path)))throw Error('delivery receipt mismatch');
  const staged=join(e.RUNNER_TEMP,'tabwise-product-source-'+github.runId+'-1');
  if(!inspectPersistedExport(staged).complete||sha256(readFileSync(join(staged,'COMPLETE.json')))!==receipt.source_package_sha256)throw Error('staged product source changed');
  const sealed=loadSealedFiles(r2RunDir(e,root));
  const producer=loadSealedFiles(join(admissionDirectory(r2RunDir(e,root),admissionConsumer(e)),'product'));
  for(const [name,bytes]of Object.entries(producer))sealed['product-producer/'+name]=bytes;
  // Missing genuine sealed runtime/provenance is a refusal, never filled from dispatch inputs or asset manifests.
  const result=buildWorkflowProductExport({delivery:d,files:sealed,github:{...github,workflow:d.request.workflow},stageTimings:[]});
  persistExportPackage({outputDir:join(e.RUNNER_TEMP,'tabwise-product-export'),files:result.files});
 }
}
