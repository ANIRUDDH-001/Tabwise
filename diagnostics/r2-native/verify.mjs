// Runs without a native runtime, also on a separate Linux runner. Integrity is not independent native attestation.
import {readFileSync,readdirSync,lstatSync,writeFileSync,mkdtempSync,cpSync,rmSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {sha,CLASSIFICATION,PAGE,PLAN,FIXTURE,assertProductionBlocked,sourceDigest,packetFor,BRANCH,WORKFLOW} from './policy.mjs';
import {verifyR2PageEvidence,verifyR2Run} from '../../scripts/tabwise/r2-evidence.mjs';
import {captureObservationSources} from '../../src/r2/capture-export.mjs';
import {buildR2ProductExport} from '../../src/r2/product-export.mjs';
import {openQualifiedR2ProductEvidence} from '../../src/r2/product-bridge.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
export function filesUnder(dir,prefix=''){
 const files={};let total=0;
 for(const name of readdirSync(dir).sort()){
  if(!/^[a-zA-Z0-9_.-]+$/.test(name))throw Error('unsafe artifact name');
  const path=join(dir,name),st=lstatSync(path),key=prefix+name;
  if(st.isSymbolicLink())throw Error('artifact symlink');
  if(st.isDirectory())Object.assign(files,filesUnder(path,key+'/'));
  else if(st.isFile()){if(st.size>20_000_000)throw Error('artifact file cap');files[key]=readFileSync(path);}
  else throw Error('artifact file type');
 }
 for(const bytes of Object.values(files))total+=bytes.length;
 if(total>30_000_000||Object.keys(files).length>100)throw Error('artifact total cap');
 return files;
}
export function indexFiles(dir){const files=filesUnder(dir);delete files['index.json'];return Object.fromEntries(Object.entries(files).map(([p,b])=>[p,{sha256:sha(b),bytes:b.length}]));}
export function checkIndex(dir){
 const expected=JSON.parse(readFileSync(join(dir,'index.json'),'utf8')),actual=indexFiles(dir);
 if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error('artifact hash/index coverage mismatch');
 return actual;
}
export function inputFor(sourceRoot=root){const plan=JSON.parse(readFileSync(join(sourceRoot,PLAN),'utf8')),page=plan.pages.find(p=>p.id===PAGE);return {plan:{...plan,pages:[page]},page,fixture:readFileSync(join(sourceRoot,FIXTURE)),approved:{fixture_sha256:page.fixture_sha256,task:page.task}};}
export function checkArtifactApproval(approval,env=process.env,sourceRoot=root){
 const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
 const expected=packetFor({head:env.TABWISE_DIAGNOSTIC_SOURCE_REVISION??env.GITHUB_SHA,source_digest:sourceDigest(sourceRoot),run_id:env.TABWISE_DIAGNOSTIC_RUN_ID??env.GITHUB_RUN_ID,actor:env.GITHUB_ACTOR});
 if(env.GITHUB_REPOSITORY!=='ANIRUDDH-001/Tabwise'||env.GITHUB_REF!==BRANCH||env.GITHUB_WORKFLOW_REF!==`ANIRUDDH-001/Tabwise/${WORKFLOW}@${BRANCH}`||(env.TABWISE_DIAGNOSTIC_RUN_ATTEMPT??env.GITHUB_RUN_ATTEMPT)!=='2'||canonical(approval)!==canonical(expected))throw Error('artifact owner approval/run identity mismatch');
}
export function projectionFor(source,report,sourceRoot=root){
 const files=filesUnder(source),manifest=JSON.parse(files[PAGE+'/manifest.json']);
 const {page}=inputFor(sourceRoot);
 const expected={repository:'ANIRUDDH-001/Tabwise',workflow:report.approval.workflow,revision:report.approval.revision,actor:report.approval.actor,github_run_id:report.approval.run_id,github_run_attempt:report.approval.run_attempt,page_id:PAGE,session:manifest.page.session,spec:{steps:page.task.map((t,i)=>({step:i+1,key:t.press}))}};
 const rows=captureObservationSources({files,expected});
 // Preserve real diagnostic identity and the sealed synthetic/incomplete class. Never manufacture a product run.
 let exporter,native;
 try{buildR2ProductExport({files,expected,stage_timings:[]});exporter={accepted:true};}catch(e){exporter={accepted:false,reason:e.message};}
 try{openQualifiedR2ProductEvidence({files,expected});native={accepted:true};}catch(e){native={accepted:false,reason:e.message};}
 return {rows,exporter,native};
}
export async function verifyDiagnostic(dir,{sourceRoot=root,env=process.env}={}){
 checkIndex(dir);assertProductionBlocked(sourceRoot);
 const report=JSON.parse(readFileSync(join(dir,'report.json'),'utf8'));
 const expectedHead=env.TABWISE_DIAGNOSTIC_SOURCE_REVISION??env.GITHUB_SHA;
 if(report.classification!==CLASSIFICATION||report.w2a_qualified!==false||report.production_qualified!==false||(expectedHead&&report.approval?.revision!==expectedHead)||report.approval?.source_digest!==sourceDigest(sourceRoot))throw Error('diagnostic source/classification binding');
 checkArtifactApproval(report.approval,env,sourceRoot);
 if(execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8',timeout:10000,windowsHide:true}).trim()!==report.approval.revision)throw Error('approved source checkout revision mismatch');
 const {plan,fixture,approved}=inputFor(sourceRoot),source=join(dir,'source');
 const page=await verifyR2PageEvidence(join(source,PAGE),{fixture,approved});
 const run=await verifyR2Run(source,{plan,inputs:{[PAGE]:{fixture,approved}}});
 if(!page.ok||!run.ok)throw Error('sealed evidence verification: '+[...page.errors,...run.errors].join('; '));
 if(!['synthetic','incomplete'].includes(page.class)||!['synthetic','incomplete'].includes(run.run_class))throw Error('forbidden qualification promotion');
 const session=JSON.parse(readFileSync(join(dir,'session.json'),'utf8'));
 let projection=null;
 if(session.completed){
  projection=projectionFor(source,report,sourceRoot);
  const stored=JSON.parse(readFileSync(join(dir,'projection.json'),'utf8'));
  if(JSON.stringify(stored)!==JSON.stringify(projection)||projection.exporter.accepted||projection.native.accepted||projection.native.reason!=='native qualification disabled')throw Error('projection or product refusal mismatch');
 }
 const custody=report.custody;
 const native_interaction_pass=session.completed===true&&session.runtime_checks?.brand===true&&session.runtime_checks.post_session_authentic===true&&session.nvda==='stopped'&&session.cleanup_errors.length===0&&session.reasons.length===0&&report.child?.code===0&&report.child.timed_out===false&&report.child.output_overflow===false&&report.preflight?.quiescent===true&&custody?.confirmed===true&&custody.quiescent===true&&custody.root?.exact===true&&custody.sample_failures===0&&custody.errors.length===0&&report.post?.quiescent===true&&Array.isArray(report.post.helper_processes)&&report.post.helper_processes.length===0&&report.errors.length===0&&projection!==null;
 if(report.pass!==native_interaction_pass)throw Error('diagnostic pass does not recompute');
 return {integrity_pass:true,native_interaction_pass,w2a_qualified:false,production_qualified:false,page_class:page.class,run_class:run.run_class,observation_rows:projection?.rows.length??0,product_refused:projection?projection.native.accepted===false:null};
}
export async function tamperChecks(dir,options={}){
 const scratch=mkdtempSync(join(tmpdir(),'r2-native-tamper-')),checks=[];
 try{
  for(const type of ['changed-source','missing-source','forged-pass']){
   const copy=join(scratch,type);cpSync(dir,copy,{recursive:true});
   // Startup failures legitimately have no capture.json. Tamper the actually sealed page manifest instead.
   const subject=existsSync(join(copy,'source',PAGE,'capture.json'))?'capture.json':'manifest.json';
   const path=join(copy,type==='forged-pass'?'report.json':'source/'+PAGE+'/'+subject);
   if(type==='missing-source')rmSync(path);
   else if(type==='forged-pass'){const report=JSON.parse(readFileSync(path,'utf8'));report.pass=!report.pass;writeFileSync(path,JSON.stringify(report));writeFileSync(join(copy,'index.json'),JSON.stringify(indexFiles(copy)));}
   else writeFileSync(path,Buffer.concat([readFileSync(path),Buffer.from(' ')]));
   let refused=false;try{await verifyDiagnostic(copy,options);}catch{refused=true;}
   if(!refused)throw Error('tampering accepted: '+type);checks.push({type,refused});
  }
 }finally{rmSync(scratch,{recursive:true,force:true});}
 return checks;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const dir=resolve(process.argv[2]),options={sourceRoot:process.argv[3]?resolve(process.argv[3]):root},result=await verifyDiagnostic(dir,options),negative=await tamperChecks(dir,options);console.log(JSON.stringify({...result,negative},null,2));process.exitCode=process.argv[4]==='--integrity-only'?result.integrity_pass?0:1:result.native_interaction_pass?0:1;}
 catch(e){console.log(JSON.stringify({integrity_pass:false,native_interaction_pass:false,error:e.message,w2a_qualified:false}));process.exitCode=1;}
}
