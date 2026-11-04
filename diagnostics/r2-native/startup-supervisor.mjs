// External containment only. No runtime/native input imports; injected launch and OS custody tools.
import {processBaseline,createPageCustody,wallMicros,quiescenceOf} from '../../scripts/tabwise/r2-proctree.mjs';
import {createStartupTrace} from './startup-trace.mjs';
import {parseUniqueJson} from '../../src/r2/strict-json.mjs';
export async function superviseStartup({launch,tools,protect=[],signal=null,setTimer=setTimeout,clearTimer=clearTimeout,setSampler=setInterval,clearSampler=clearInterval}){
 const report={schema:'tabwise-startup-custody/1',startup_pass:false,production_qualified:false,native_interaction_pass:false,physical_quiescence_verified:false,baseline:await processBaseline(tools),custody:null,post:null,worker:null,reason:null};
 if(!report.baseline.quiescent){report.reason='baseline-refused';return report;}
 if(signal?.aborted){report.reason='cancelled';return report;}
 const trace=createStartupTrace();let child,custody,timer,grace,sampler,closed=false,code=null,output='',bytes=0,stderr=0,finish;
 const ended=new Promise(resolve=>{finish=resolve;});
 const stop=reason=>{if(report.reason)return;report.reason=reason;try{child?.kill();}catch{}if(!closed)grace=setTimer(finish,5000);};
 const cancel=()=>stop('cancelled');signal?.addEventListener('abort',cancel,{once:true});
 try{
  const born=wallMicros(Date.now);child=trace.launch(launch);
  child.once('exit',()=>custody?.exited());child.once('error',()=>stop('worker-error'));child.once('close',c=>{closed=true;code=c;finish();});
  custody=createPageCustody({tools,pid:child.pid??null,spawnedAfter:born,protect});
  child.stdout.on('data',data=>{trace.output('stdout',data);bytes+=Buffer.byteLength(data);if(bytes>8192)stop('worker-output-cap');else output+=String(data);});
  child.stderr.on('data',data=>{trace.output('stderr',data);stderr+=Buffer.byteLength(data);if(stderr>8192)stop('worker-stderr-cap');});
  timer=setTimer(()=>stop('worker-deadline'),90000);sampler=setSampler(()=>{void custody.sample();},5000);
  // Admission is sent only after an OS snapshot identifies this newly created worker.
  const initial=await tools.snapshot();const root=initial.processes.find(p=>p.pid===child.pid&&p.created!==null&&BigInt(p.created)>=BigInt(born));
  if(!root)stop('worker-identity-unconfirmed');
  else{await custody.sample();if(!report.reason&&!closed)child.send({schema:'tabwise-startup-custody-admitted/1'});}
  await ended;
  if(!closed)report.reason??='worker-close-unconfirmed';
  if(code!==0)report.reason??='worker-failed';
  try{
   if(!output.endsWith('\n')||output.trim().includes('\n'))throw Error();
   const value=parseUniqueJson(output);if(value.schema!=='tabwise-startup-only/1'||value.production_qualified!==false||value.native_interaction_pass!==false||value.physical_quiescence_verified!==false||value.sends!==0)throw Error();
   // Do not forward arbitrary child properties or error strings into the artifact.
   report.worker={startup_pass:value.startup_pass===true,sends:0,cleanup_error:value.cleanup_error===true,error:value.error===null?null:'worker-refused',receipt:value.receipt&&Number.isSafeInteger(value.receipt.pid)&&value.receipt.pid>0&&value.receipt.relay_pid===value.receipt.pid&&value.receipt.reset_confirmed===true?{pid:value.receipt.pid,relay_pid:value.receipt.pid,reset_confirmed:true}:null};
   const observed=value.observed_process;
   if(observed&&observed.pid===report.worker.receipt?.pid&&/^[1-9][0-9]{10,19}$/.test(observed.created??'')&&/^[a-f0-9]{64}$/.test(observed.path_sha256??''))report.worker.observed_process={pid:observed.pid,created:observed.created,path_sha256:observed.path_sha256,physical_quiescence_verified:false};
  }catch{report.reason??='worker-result-refused';}
 }catch{stop('supervisor-error');if(child)await ended;}
 finally{
  clearTimer(timer);clearTimer(grace);clearSampler(sampler);
  signal?.removeEventListener('abort',cancel);
  if(custody)report.custody=await custody.reap();
  try{const snapshot=await tools.snapshot();report.post={...quiescenceOf(snapshot),helper_count:snapshot.processes.filter(p=>/^nvdahelperremoteloader\.exe$/i.test(p.name)).length};}catch{report.reason??='post-snapshot-refused';}
  trace.cleanup(report.custody);trace.dispose();report.trace=trace.snapshot();
 }
 report.startup_pass=!report.reason&&report.worker?.startup_pass===true&&report.worker.receipt!==null&&!report.worker.cleanup_error&&report.worker.error===null&&report.custody?.confirmed===true&&report.custody.root?.exact===true&&report.custody.quiescent===true&&report.custody.sample_failures===0&&report.custody.errors.length===0&&report.custody.residue.length===0&&report.post?.quiescent===true&&report.post.helper_count===0;
 return report;
}
