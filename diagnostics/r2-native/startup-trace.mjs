// External supervisor observation only. NEVER install hooks in the native worker.
// No global mutation, stream subscriptions, raw output retention, input or runtime imports.
export function createStartupTrace({now=()=>performance.now()}={}) {
 const record={schema:'tabwise-startup-trace/2',scope:'supervisor-owned worker; not owner-query subprocess',spawn_call_ms:null,spawn_return_ms:null,pid:null,exit_ms:null,close_ms:null,exit_code:null,close_code:null,spawn_threw:false,
  owner_query:{spawn_call_ms:null,spawn_return_ms:null,exit_ms:null,close_ms:null,reason:'unobserved: frozen worker is not instrumented; consult OS custody and separate probe'},
  output:{stdout_bytes:0,stderr_bytes:0,truncated:false,content:'omitted'},cleanup:null,degraded:false,disposed:false};
 const safe=fn=>{try{return fn();}catch{record.degraded=true;}};
 const time=()=>safe(()=>{const t=now();return Number.isFinite(t)&&t>=0?t:null;})??null;
 let child=null,onExit,onClose;
 return Object.freeze({
  launch(launch,thisArg,args=[]) {
   if(record.disposed||child||record.spawn_call_ms!==null)throw Error('external trace launch already used');
   record.spawn_call_ms=time();
   let result;
   try {result=Reflect.apply(launch,thisArg,args);}catch(error){record.spawn_threw=true;throw error;}
   record.spawn_return_ms=time();child=result;
   safe(()=>{
    record.pid=Number.isSafeInteger(result.pid)&&result.pid>0?result.pid:null;
    onExit=code=>safe(()=>{record.exit_ms=time();record.exit_code=Number.isSafeInteger(code)?code:null;});
    onClose=code=>safe(()=>{record.close_ms=time();record.close_code=Number.isSafeInteger(code)?code:null;});
    // Process events only; existing coordinator owns error handling and every stream listener.
    child.once('exit',onExit);child.once('close',onClose);
   });
   return result;
  },
  output(lane,chunk) {safe(()=>{
   if(record.disposed||!['stdout','stderr'].includes(lane))return;
   const n=Buffer.isBuffer(chunk)?chunk.length:typeof chunk==='string'?Buffer.byteLength(chunk):0,key=lane+'_bytes';
   if(record.output[key]+n>1048576)record.output.truncated=true;
   record.output[key]=Math.min(1048576,record.output[key]+n);
  });},
  cleanup(custody) {safe(()=>{record.cleanup={confirmed:custody?.confirmed===true,quiescent:custody?.quiescent===true,residue_count:Array.isArray(custody?.residue)?custody.residue.length:null,error_count:Array.isArray(custody?.errors)?custody.errors.length:null,physical_quiescence_verified:false};});},
  dispose(){if(record.disposed)return;record.disposed=true;safe(()=>{if(onExit)child?.removeListener('exit',onExit);if(onClose)child?.removeListener('close',onClose);});},
  snapshot(){return structuredClone(record);},
 });
}
