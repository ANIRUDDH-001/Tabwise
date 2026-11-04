// Explicit local read-only measurement CLI; never starts NVDA or occupies 6837.
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import {writeFileSync} from 'node:fs';
import {runBounded,resolveOwner,authenticateOwner,systemExecutable} from './resolver.mjs';
const output=process.argv[2];if(!output||process.platform!=='win32')throw Error('Windows and explicit fresh output required');
const samples=[];
async function identity(pid){const r=await runBounded({file:systemExecutable('WindowsPowerShell/v1.0/powershell.exe'),args:['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./identity.ps1',import.meta.url)),'-ProcessId',String(pid)],deadline:performance.now()+5000,maxBytes:4096});let value=null;try{if(r.ok)value=JSON.parse(r.stdout);}catch{}samples.push({kind:'process-identity',...r,stdout:undefined,value});return value;}
const before=await identity(process.pid);
for(const host of ['127.0.0.1','::1']){
 const server=createServer();try{
  await new Promise((yes,no)=>{server.once('error',no);server.listen({host,port:0,exclusive:true},yes);});
  const port=server.address().port;if(port===6837)throw Error('reserved port unexpectedly selected');
  const r=await resolveOwner({port,deadline:performance.now()+5000}),after=await identity(process.pid);
  samples.push({kind:'self-listener',family:host==='::1'?'IPv6':'IPv4',port,...r,authentication:authenticateOwner({pids:r.pids,before,after,expected:before})});
 }finally{if(server.listening)await new Promise(r=>server.close(r));}
 const absent=await resolveOwner({port:samples.findLast(x=>x.kind==='self-listener')?.port??65535,deadline:performance.now()+5000});
 samples.push({kind:'released-listener',...absent});
}
samples.push({kind:'relay-read-only',port:6837,...await resolveOwner({port:6837,deadline:performance.now()+5000})});
// Old query is not launched: no independently enforced Windows job object is available.
const result={schema:'tabwise-owner-local-measurement/2',at:new Date().toISOString(),platform:process.platform,node:process.version,pid:process.pid,
 samples,legacy_query:'NOT RUN: no independent pre-spawn Windows job containment; hosted deadline failure retained',native_qualified:false,physical_quiescence_verified:false,containment_required:true};
writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
if(samples.some(s=>s.kind==='self-listener'&&(s.outcome!=='unique'||s.authentication.outcome!=='authenticated'))||samples.some(s=>s.kind==='released-listener'&&s.outcome!=='absent'))process.exitCode=1;
console.log(JSON.stringify(result,null,2));
