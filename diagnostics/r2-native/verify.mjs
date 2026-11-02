// Runs without a native runtime, also on a separate Linux runner. Integrity is not independent native attestation.
import {readFileSync,readdirSync,lstatSync,writeFileSync,mkdtempSync,cpSync,rmSync} from 'node:fs';
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
export function inputFor(){const plan=JSON.parse(readFileSync(join(root,PLAN),'utf8')),page=plan.pages.find(p=>p.id===PAGE);return {plan:{...plan,pages:[page]},page,fixture:readFileSync(join(root,FIXTURE)),approved:{fixture_sha256:page.fixture_sha256,task:page.task}};}
export function checkArtifactApproval(approval,env=process.env){
 const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
 const expected=packetFor({head:env.GITHUB_SHA,source_digest:sourceDigest(root),run_id:env.GITHUB_RUN_ID,actor:env.GITHUB_ACTOR});
 if(env.GITHUB_REPOSITORY!=='ANIRUDDH-001/Tabwise'||env.GITHUB_REF!==BRANCH||env.GITHUB_WORKFLOW_REF!==`ANIRUDDH-001/Tabwise/${WORKFLOW}@${BRANCH}`||env.GITHUB_RUN_ATTEMPT!=='2'||canonical(approval)!==canonical(expected))throw Error('artifact owner approval/run identity mismatch');
}
export function projectionFor(source,report){
 const files=filesUnder(source),manifest=JSON.parse(files[PAGE+'/manifest.json']);
 const {page}=inputFor();
 const expected={repository:'ANIRUDDH-001/Tabwise',workflow:report.approval.workflow,revision:report.approval.revision,actor:report.approval.actor,github_run_id:report.approval.run_id,github_run_attempt:report.approval.run_attempt,page_id:PAGE,session:manifest.page.session,spec:{steps:page.task.map((t,i)=>({step:i+1,key:t.press}))}};
 const rows=captureObservationSources({files,expected});
 // Preserve real diagnostic identity and the sealed synthetic/incomplete class. Never manufacture a product run.
 let exporter,native;
 try{buildR2ProductExport({files,expected,stage_timings:[]});exporter={accepted:true};}catch(e){exporter={accepted:false,reason:e.message};}
 try{openQualifiedR2ProductEvidence({files,expected});native={accepted:true};}catch(e){native={accepted:false,reason:e.message};}
 return {rows,exporter,native};
}
export async function verifyDiagnostic(dir){
 checkIndex(dir);assertProductionBlocked(root);
 const report=JSON.parse(readFileSync(join(dir,'report.json'),'utf8'));
 if(report.classification!==CLASSIFICATION||report.w2a_qualified!==false||report.production_qualified!==false||(process.env.GITHUB_SHA&&report.approval?.revision!==process.env.GITHUB_SHA)||report.approval?.source_digest!==sourceDigest(root))throw Error('diagnostic source/classification binding');
 checkArtifactApproval(report.approval);
 const {plan,fixture,approved}=inputFor(),source=join(dir,'source');
 const page=await verifyR2PageEvidence(join(source,PAGE),{fixture,approved});
 const run=await verifyR2Run(source,{plan,inputs:{[PAGE]:{fixture,approved}}});
 if(!page.ok||!run.ok)throw Error('sealed evidence verification: '+[...page.errors,...run.errors].join('; '));
 if(!['synthetic','incomplete'].includes(page.class)||!['synthetic','incomplete'].includes(run.run_class))throw Error('forbidden qualification promotion');
 const session=JSON.parse(readFileSync(join(dir,'session.json'),'utf8'));
 let projection=null;
 if(session.completed){
  projection=projectionFor(source,report);
  const stored=JSON.parse(readFileSync(join(dir,'projection.json'),'utf8'));
  if(JSON.stringify(stored)!==JSON.stringify(projection)||projection.exporter.accepted||projection.native.accepted||projection.native.reason!=='native qualification disabled')throw Error('projection or product refusal mismatch');
 }
 const custody=report.custody;
 const native_interaction_pass=session.completed===true&&session.runtime_checks?.brand===true&&session.runtime_checks.post_session_authentic===true&&session.nvda==='stopped'&&session.cleanup_errors.length===0&&session.reasons.length===0&&report.child?.code===0&&report.child.timed_out===false&&report.child.output_overflow===false&&report.preflight?.quiescent===true&&custody?.confirmed===true&&custody.quiescent===true&&custody.root?.exact===true&&custody.sample_failures===0&&custody.errors.length===0&&report.post?.quiescent===true&&Array.isArray(report.post.helper_processes)&&report.post.helper_processes.length===0&&report.errors.length===0&&projection!==null;
 if(report.pass!==native_interaction_pass)throw Error('diagnostic pass does not recompute');
 return {integrity_pass:true,native_interaction_pass,w2a_qualified:false,production_qualified:false,page_class:page.class,run_class:run.run_class,observation_rows:projection?.rows.length??0,product_refused:projection?projection.native.accepted===false:null};
}
export async function tamperChecks(dir){
 const scratch=mkdtempSync(join(tmpdir(),'r2-native-tamper-')),checks=[];
 try{
  for(const type of ['changed-source','missing-source','forged-pass']){
   const copy=join(scratch,type);cpSync(dir,copy,{recursive:true});
   const path=join(copy,type==='forged-pass'?'report.json':'source/'+PAGE+'/capture.json');
   if(type==='missing-source')rmSync(path);
   else if(type==='forged-pass'){const report=JSON.parse(readFileSync(path,'utf8'));report.pass=!report.pass;writeFileSync(path,JSON.stringify(report));writeFileSync(join(copy,'index.json'),JSON.stringify(indexFiles(copy)));}
   else writeFileSync(path,Buffer.concat([readFileSync(path),Buffer.from(' ')]));
   let refused=false;try{await verifyDiagnostic(copy);}catch{refused=true;}
   if(!refused)throw Error('tampering accepted: '+type);checks.push({type,refused});
  }
 }finally{rmSync(scratch,{recursive:true,force:true});}
 return checks;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const dir=resolve(process.argv[2]),result=await verifyDiagnostic(dir),negative=await tamperChecks(dir);console.log(JSON.stringify({...result,negative},null,2));process.exitCode=result.native_interaction_pass?0:1;}
 catch(e){console.log(JSON.stringify({integrity_pass:false,native_interaction_pass:false,error:e.message,w2a_qualified:false}));process.exitCode=1;}
}
