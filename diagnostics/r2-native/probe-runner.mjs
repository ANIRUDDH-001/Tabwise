// Prepared library, no CLI or default spawn: cannot execute by import or without an explicit launcher.
// Its fresh pipes belong solely to this read-only probe, never the native worker.
import {fileURLToPath} from 'node:url';
import {createStartupTrace} from './startup-trace.mjs';
export function runReadOnlyProbe({spawn,setTimer=setTimeout,clearTimer=clearTimeout,now=()=>performance.now(),signal=null}={}){
 if(typeof spawn!=='function')throw Error('explicit separately authorized probe launcher required');
 const trace=createStartupTrace({now});
 const deadline=now()+27000;
 return new Promise(resolve=>{
  let child,timer,cleanupTimer,done=false,stopping=false,reason=null,stdout='',total=0;
  const rows=[];
  const finish=closed=>{
   if(done)return;done=true;clearTimer(timer);clearTimer(cleanupTimer);signal?.removeEventListener('abort',cancel);trace.dispose();
   const final=rows.at(-1),complete=stdout.trim()===''&&rows.length===4&&final?.outcome==='one-owner'&&final.owner_count===1&&Number.isSafeInteger(final.owner_pid)&&final.owner_pid>0;
   if(closed&&!reason&&!complete)reason='incomplete-or-unsuccessful-output';
   resolve({schema:'tabwise-owner-query-probe-result/1',production_qualified:false,native_interaction_pass:false,pass:closed&&!reason&&complete&&trace.snapshot().close_code===0,reason,trace:trace.snapshot(),rows,
    partial_diagnostics:{parsed_rows:rows.length,unfinished_stdout_bytes:Buffer.byteLength(stdout),content:"numeric-enum rows only; raw stderr omitted"},
    cleanup:{process_close_observed:closed,physical_quiescence_verified:false,containment_required:!!child&&!closed}});
  };
  const stop=why=>{if(done||stopping)return;stopping=true;reason=why;clearTimer(timer);try{child.kill();}catch{}if(!done)cleanupTimer=setTimer(()=>finish(false),1000);};
  const cancel=()=>stop('cancelled');
  if(signal?.aborted){reason='cancelled';finish(false);return;}
  try{
   child=trace.launch(()=>spawn('powershell.exe',['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./owner-query-probe.ps1',import.meta.url))],{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']}));
   child.once('error',()=>stop('process-error'));
   child.once('close',()=>finish(true));
   // Fixed 8192 byte/4 row stdout cap. JSON output is rebuilt from numeric/enum fields only.
   child.stdout.on('data',bytes=>{
    if(done||stopping)return;trace.output('stdout',bytes);total+=Buffer.byteLength(bytes);
    if(total>8192){stop('output-cap');return;}
    stdout+=String(bytes);
    for(let index;(index=stdout.indexOf('\n'))>=0;){
     const line=stdout.slice(0,index);stdout=stdout.slice(index+1);
     try{
      const raw=JSON.parse(line);if(rows.length===4)throw Error();
      if(['powershell-entry','query-call','query-return'].includes(raw.phase)){
       if(raw.phase!==['powershell-entry','query-call','query-return'][rows.length])throw Error();
       if(Object.keys(raw).some(k=>!['phase','at_ms'].includes(k)))throw Error();
       if(raw.at_ms!==undefined&&(!Number.isFinite(raw.at_ms)||raw.at_ms<0))throw Error();
       if(raw.phase!=='powershell-entry'&&!Number.isFinite(raw.at_ms))throw Error();
       rows.push({phase:raw.phase,...(raw.at_ms===undefined?{}:{at_ms:raw.at_ms})});
      }else{
       if(raw.schema!=='tabwise-owner-query-probe/1'||!['one-owner','ambiguous-owner','query-error'].includes(raw.outcome))throw Error();
       if(rows.length!==3&&!(rows.length===2&&raw.outcome==='query-error'))throw Error();
       if(!Number.isSafeInteger(raw.pid)||raw.pid<=0)throw Error();
       const row={schema:raw.schema,outcome:raw.outcome};
       for(const key of ['pid','entry_ms','query_call_ms','query_return_ms','selection_return_ms','done_ms','owner_count','owner_pid']){
        if(raw[key]!==null&&(!Number.isFinite(raw[key])||raw[key]<0))throw Error();row[key]=raw[key];
       }
       if(raw.outcome==='one-owner'){
        const times=['entry_ms','query_call_ms','query_return_ms','selection_return_ms','done_ms'].map(k=>raw[k]);
        if(times.some((t,i)=>!Number.isFinite(t)||t<0||i>0&&t<times[i-1])||raw.query_call_ms!==rows[1].at_ms||raw.query_return_ms!==rows[2].at_ms)throw Error();
       }
       rows.push(row);
      }
     }catch{stop('invalid-output');return;}
    }
   });
   // Drain this probe's stderr without retaining or serializing any content.
   child.stderr.on('data',bytes=>{if(done||stopping)return;trace.output('stderr',bytes);if(trace.snapshot().output.truncated)stop('output-cap');});
   signal?.addEventListener('abort',cancel,{once:true});
   if(signal?.aborted)cancel();
   if(!done&&!stopping)timer=setTimer(()=>stop('deadline'),Math.max(1,deadline-now()));
  }catch{reason='launch-error';if(child)stop('launch-error');else finish(false);}
 });
}
