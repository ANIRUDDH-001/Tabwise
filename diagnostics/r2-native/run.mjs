import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {diagnosticErrorChain,packetFor,sourceDigest,checkDiagnosticApproval,assertProductionBlocked,CLASSIFICATION,BASE,PAGE} from './policy.mjs';
import {inputFor,indexFiles,projectionFor} from './verify.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),entry=fileURLToPath(import.meta.url);
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:10000}).trim();
const head=git(['rev-parse','HEAD']),digest=sourceDigest(root);
if(process.argv[2]==='--packet'){
 if(!/^[1-9][0-9]*$/.test(process.argv[3]??''))throw Error('supply the completed bootstrap run ID');
 console.log(JSON.stringify(packetFor({head,source_digest:digest,run_id:process.argv[3],actor:'ANIRUDDH-001'}),null,2));
}else{
 const errors=checkDiagnosticApproval({env:process.env,head,source_digest:digest,approval:process.env.TABWISE_NATIVE_DIAGNOSTIC_APPROVAL,platform:process.platform,execArgv:process.execArgv});
 if(errors.length)throw Error('BLOCK before runtime: '+errors.join('; '));
 assertProductionBlocked(root);git(['merge-base','--is-ancestor',BASE,'HEAD']);
 if(git(['status','--porcelain','--untracked-files=no']))throw Error('BLOCK: tracked checkout dirty');
 const approval=JSON.parse(process.env.TABWISE_NATIVE_DIAGNOSTIC_APPROVAL);
 const out=join(process.env.RUNNER_TEMP,'tabwise-r2-native-diagnostic'),source=join(out,'source');
 const save=(name,value)=>writeFileSync(join(out,name),JSON.stringify(value,null,2)+'\n');
 const {plan,page,fixture,approved}=inputFor();
 const {r2SessionData,r2ChildEnv,r2PageExit,runR2Pages,r2RunSealable}=await import('../../scripts/tabwise/r2-run.mjs');
 if(process.argv[2]==='--check-only'){
  console.log(JSON.stringify({approved_diagnostic:true,classification:CLASSIFICATION,revision:head,production_qualified:false}));
 }else if(process.argv[2]==='--initialize'){
  mkdirSync(out);
  save('report.json',{schema:'tabwise-native-diagnostic-report/1',classification:CLASSIFICATION,approval,w2a_qualified:false,production_qualified:false,pass:false,stage:'setup-not-completed',errors:['No native session has completed; inspect setup logs']});
  save('index.json',indexFiles(out));
 }else if(process.argv[2]==='--worker'){
  const {loadQualificationRuntime}=await import('../../scripts/tabwise/qualification-loader.mjs');
  const additionalIntegrity=()=>sourceDigest(root)===digest?[]:['diagnostic reviewed source changed'];
  const runtime=await loadQualificationRuntime({root,additionalIntegrity});
  const stop=()=>{if(!runtime.guard.isStopped())runtime.guard.stop('diagnostic cancelled','timeout');};
  for(const signal of ['SIGINT','SIGTERM','SIGBREAK'])process.on(signal,stop);
  const timer=setTimeout(stop,150000);
  try{
   const {runR2Session}=await import('../../scripts/tabwise/r2-session.mjs');
   const result=await runR2Session(runtime,r2SessionData(plan,page,fixture,join(source,PAGE)),{onStartupError:(error,timing)=>save('startup-errors.json',{...diagnosticErrorChain(error),...timing})});
   save('session.json',result);
   console.log(JSON.stringify(r2PageExit({page:PAGE,completed:result.completed,nvda:result.nvda,manifest_sha256:result.manifest_sha256,reasons:[...result.reasons,...result.cleanup_errors]})));
   process.exitCode=result.completed?0:1;
  }finally{clearTimeout(timer);for(const signal of ['SIGINT','SIGTERM','SIGBREAK'])process.off(signal,stop);}
 }else if(process.argv.length===2){
  // No runtime capability in the supervisor. It owns the child and original process-custody implementation.
  mkdirSync(out,{recursive:true});mkdirSync(source);
  const report={schema:'tabwise-native-diagnostic-report/1',classification:CLASSIFICATION,approval,w2a_qualified:false,production_qualified:false,pass:false,preflight:null,child:null,custody:null,post:null,errors:[]};
  save('report.json',report);
  const {windowsProcessTools,processBaseline,quiescenceOf}=await import('../../scripts/tabwise/r2-proctree.mjs');
  const tools=windowsProcessTools({spawn,env:process.env});
  try{
   report.preflight=await processBaseline(tools);save('report.json',report);
   if(!report.preflight.quiescent)throw Error('baseline not quiescent: no worker launched');
   const env={...r2ChildEnv(process.env),TABWISE_NATIVE_DIAGNOSTIC_APPROVAL:process.env.TABWISE_NATIVE_DIAGNOSTIC_APPROVAL};
   let stdout='',stderr='',stderrOverflow=false;
   const cancel=new AbortController(),onCancel=()=>cancel.abort();
   for(const name of ['SIGINT','SIGTERM','SIGBREAK','SIGHUP'])process.on(name,onCancel);
   let outcome;
   try{outcome=await runR2Pages({pages:[PAGE],timeoutMs:approval.max_ms,killGraceMs:5000,maxOutputBytes:1048576,processes:tools,signal:cancel.signal,protect:[process.pid,process.ppid],
    launch:()=>{
     const child=spawn(process.execPath,[entry,'--worker'],{cwd:root,env,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
     child.stdout.on('data',bytes=>{stdout=(stdout+bytes.toString('utf8')).slice(0,1048576);});return child;
    },onStderr:(_,bytes)=>{stderr+=bytes.toString('utf8');if(Buffer.byteLength(stderr)>1048576){stderrOverflow=true;stderr=stderr.slice(0,524288);cancel.abort();}}
   });}finally{for(const name of ['SIGINT','SIGTERM','SIGBREAK','SIGHUP'])process.off(name,onCancel);}
   const childResult=outcome.pages[0];report.outcome=outcome;
   report.child={code:childResult.exit_code,outcome:childResult.outcome,timed_out:childResult.outcome==='timeout',output_overflow:stderrOverflow||childResult.outcome==='result-refused'};
   writeFileSync(join(out,'stdout.log'),stdout);writeFileSync(join(out,'stderr.log'),stderr);
   report.custody=childResult.custody??null;save('report.json',report);
   const snapshot=await tools.snapshot();report.post={...quiescenceOf(snapshot),helper_processes:snapshot.processes.filter(p=>/^nvdahelperremoteloader\.exe$/i.test(p.name))};
   let session=null;try{session=JSON.parse(readFileSync(join(out,'session.json'),'utf8'));}catch{report.errors.push('worker did not produce session result');}
   if(r2RunSealable(outcome)&&report.custody?.confirmed&&existsSync(join(source,PAGE,'manifest.json'))){
    const {sealR2Run,verifyR2Run}=await import('../../scripts/tabwise/r2-evidence.mjs');
    await sealR2Run(source,{enabled:true,plan,pages:[{id:PAGE,exit_code:session?.completed?0:2}],inputs:{[PAGE]:{fixture,approved}}});
    report.sealed=await verifyR2Run(source,{plan,inputs:{[PAGE]:{fixture,approved}}});
   }
   if(session?.completed&&report.sealed?.ok){report.projection=projectionFor(source,report);save('projection.json',report.projection);}
   assertProductionBlocked(root);
   if(sourceDigest(root)!==digest)throw Error('source changed after capture');
   report.pass=session?.completed===true&&session.runtime_checks.brand===true&&session.runtime_checks.post_session_authentic===true&&session.nvda==='stopped'&&!session.cleanup_errors.length&&!session.reasons.length&&report.child.code===0&&!report.child.timed_out&&!report.child.output_overflow&&report.custody.confirmed&&report.custody.quiescent&&report.custody.root?.exact===true&&!report.custody.sample_failures&&!report.custody.errors.length&&report.post.quiescent&&!report.post.helper_processes.length&&report.sealed?.ok===true&&report.projection?.native.accepted===false&&report.projection.native.reason==='native qualification disabled'&&report.projection.exporter.accepted===false&&!report.errors.length;
  }catch(e){report.errors.push(e.message);report.pass=false;}
  save('report.json',report);save('index.json',indexFiles(out));
  console.log(JSON.stringify(report));process.exitCode=report.pass?0:1;
 }else throw Error('unexpected diagnostic mode');
}
