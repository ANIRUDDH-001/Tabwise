// Read-only candidate. No native runtime, desktop input, retry or qualification authority.
import {spawn} from 'node:child_process';
import {isIP} from 'node:net';
import {join} from 'node:path';
export const LIMITS=Object.freeze({timeout_ms:5000,cleanup_ms:1000,stdout_bytes:1048576,stderr_bytes:8192});
export const NETSTAT_ARGS=Object.freeze(['-a','-n','-o']);
const pidOk=p=>Number.isInteger(p)&&p>0&&p<=0xffffffff;
function endpoint(s){
 const m=/^(?:\[([^\]]+)\]|([^:]+)):(0|[1-9][0-9]{0,4})$/.exec(s);
 if(!m||Number(m[3])>65535)throw Error('invalid endpoint');
 const address=m[1]??m[2],base=address.split('%')[0];
 if(!isIP(base)||m[1]&&isIP(base)!==6||!m[1]&&isIP(base)!==4||address.includes('%')&&!/^[^%]+%[0-9]+$/.test(address))throw Error('invalid address');
 return Number(m[3]);
}
export function parseNetstat(text,port){
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('invalid port');
 if(typeof text!=='string'||Buffer.byteLength(text)>LIMITS.stdout_bytes||!text.endsWith('\n'))throw Error('empty, partial or oversized table');
 const lines=text.replaceAll('\r\n','\n').split('\n'),pids=new Set();let header=false,rows=0;
 const states=new Set(['LISTENING','ESTABLISHED','SYN_SENT','SYN_RECEIVED','FIN_WAIT_1','FIN_WAIT_2','TIME_WAIT','CLOSE_WAIT','CLOSED','LAST_ACK','CLOSING','DELETE_TCB']);
 for(const line of lines){
  const s=line.trim();if(!s||s==='Active Connections')continue;
  if(/^Proto\s+Local Address\s+Foreign Address\s+State\s+PID$/.test(s)){if(header)throw Error('duplicate header');header=true;continue;}
  if(!header)throw Error('unrecognized table header');
  const fields=s.split(/\s+/);
  if(fields[0]==='UDP'){
   if(fields.length!==4||!pidOk(Number(fields[3]))||!/^[1-9][0-9]*$/.test(fields[3]))throw Error('invalid UDP row');
   endpoint(fields[1]);if(fields[2]!=='*:*')endpoint(fields[2]);continue;
  }
  if(fields.length!==5||fields[0]!=='TCP'||!states.has(fields[3])||!/^(0|[1-9][0-9]*)$/.test(fields[4])||!Number.isInteger(Number(fields[4]))||Number(fields[4])>0xffffffff||fields[3]==='LISTENING'&&!pidOk(Number(fields[4])))throw Error('invalid TCP row');
  const local=endpoint(fields[1]);endpoint(fields[2]);
  if(local===port&&fields[3]==='LISTENING'){pids.add(Number(fields[4]));rows++;}
 }
 if(!header)throw Error('missing header');
 return {outcome:pids.size===0?'absent':pids.size===1?'unique':'ambiguous',pids:[...pids].sort((a,b)=>a-b),rows};
}
export function runBounded({file,args,deadline,signal,spawnImpl=spawn,maxBytes=LIMITS.stdout_bytes,stderrBytes=LIMITS.stderr_bytes,cleanupMs=LIMITS.cleanup_ms}){
 if(typeof file!=='string'||!Array.isArray(args)||!Number.isFinite(deadline)||!Number.isSafeInteger(maxBytes)||maxBytes<1||!Number.isSafeInteger(cleanupMs)||cleanupMs<1)throw Error('invalid bounded command');
 const started=performance.now();
 return new Promise(resolve=>{
  let child,timer,reaper,reason=null,done=false,stopping=false,size=0,errSize=0,parts=[];
  const finish=(closed,code=null,sig=null)=>{
   if(done)return;done=true;clearTimeout(timer);clearTimeout(reaper);signal?.removeEventListener('abort',cancel);
   if(!reason&&performance.now()>=deadline)reason='deadline';
   if(!reason&&(!closed||code!==0||sig))reason='exit';
   const ok=!reason;
   resolve({ok,reason,exit_code:code,signal:sig,elapsed_ms:performance.now()-started,stdout:ok?Buffer.concat(parts).toString('utf8'):'',
    stdout_bytes:size,stderr_bytes:errSize,cleanup:{process_close_observed:closed,direct_child_pid:child?.pid??null,physical_quiescence_verified:false,containment_required:!!child}});
   parts=[];
  };
  const stop=why=>{if(done||stopping)return;reason=why;stopping=true;clearTimeout(timer);try{child?.kill();}catch{}if(!done)reaper=setTimeout(()=>finish(false),cleanupMs);};
  const cancel=()=>stop('cancelled');
  if(signal?.aborted){reason='cancelled';finish(false);return;}
  if(started>=deadline){reason='deadline';finish(false);return;}
  try{
   // spawn itself may synchronously stall; the hosted job / external supervisor is the outer boundary.
   child=spawnImpl(file,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],env:commandEnv(process.env)});
   child.once('error',()=>stop('launch-error'));
   child.once('close',(code,sig)=>finish(true,code,sig));
   child.stdout.on('data',b=>{if(done||stopping)return;size+=Buffer.byteLength(b);if(size>maxBytes){stop('output-cap');return;}parts.push(Buffer.from(b));});
   child.stderr.on('data',b=>{if(done||stopping)return;errSize+=Buffer.byteLength(b);if(errSize>Math.min(maxBytes,stderrBytes))stop('output-cap');});
   signal?.addEventListener('abort',cancel,{once:true});
   if(signal?.aborted)cancel();
   if(!done&&!stopping)timer=setTimeout(()=>stop('deadline'),Math.max(1,deadline-performance.now()));
  }catch{if(child)stop('launch-error');else{reason='launch-error';finish(false);}}
 });
}
export function commandEnv(env){const out={};for(const [k,v]of Object.entries(env))if(/^(SYSTEMROOT|WINDIR|TEMP|TMP)$/i.test(k)&&typeof v==='string')out[k]=v;return out;}
export function systemExecutable(name){if(!['netstat.exe','WindowsPowerShell/v1.0/powershell.exe'].includes(name)||!process.env.SystemRoot||!/^([a-z]:)[\\/]/i.test(process.env.SystemRoot))throw Error('trusted Windows system root required');return join(process.env.SystemRoot,'System32',name);}
const validIdentity=x=>x&&pidOk(x.pid)&&typeof x.created==='string'&&/^[1-9][0-9]{10,19}$/.test(x.created)&&/^[a-f0-9]{64}$/.test(x.path_sha256??'');
export function authenticateOwner({pids,before,after,expected}){
 if(!Array.isArray(pids)||pids.length!==1||![before,after,expected].every(validIdentity))return {outcome:'identity-unverified'};
 return {outcome:[before,after,expected].every(x=>x.pid===pids[0]&&x.created===expected.created&&x.path_sha256===expected.path_sha256)?'authenticated':'identity-mismatch'};
}
export async function resolveOwner({port,deadline,signal,run=runBounded}){
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('invalid port');
 const measurement=await run({file:systemExecutable('netstat.exe'),args:[...NETSTAT_ARGS],deadline,signal});
 const common={schema:'tabwise-owner-resolver/2',query_completed:false,native_qualified:false,identity_authenticated:false,measurement:{...measurement,stdout:undefined}};
 if(!measurement.ok)return {...common,outcome:'failed'};
 try{return {...common,...parseNetstat(measurement.stdout,port),query_completed:true};}catch{return {...common,outcome:'malformed'};}
}
