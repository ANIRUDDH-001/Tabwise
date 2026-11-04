// Read-only timing probe against an owned disposable Node child. Not qualification or retry.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {runBounded,systemExecutable} from './resolver.mjs';
import {executableHash} from '../../scripts/tabwise/r2-nvda-lifecycle.mjs';
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{shell:false,windowsHide:true,stdio:'ignore'});
let closed=false;child.once('close',()=>closed=true);
const overall=performance.now()+60000;
try{
 for(const sample of ['cold','warm']){
  const started=performance.now(),events=[];
  const result=await runBounded({file:systemExecutable('WindowsPowerShell/v1.0/powershell.exe'),args:['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./identity.ps1',import.meta.url)),'-ProcessId',String(child.pid),'-Measure'],deadline:Math.min(overall,started+25000),spawnImpl:(...args)=>{
   const helper=spawn(...args);events.push({stage:'spawn-return',parent_ms:performance.now()-started});
   helper.once('spawn',()=>events.push({stage:'spawn-event',parent_ms:performance.now()-started}));
   helper.once('exit',()=>events.push({stage:'exit',parent_ms:performance.now()-started}));
   let buffer='';helper.stderr.on('data',b=>{buffer+=String(b);if(buffer.length>8192)buffer='';let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);const m=/^IDENTITY_TIMING ([a-z-]+) ([0-9.]+)$/.exec(line);if(m)events.push({stage:m[1],script_ms:Number(m[2]),parent_ms:performance.now()-started});}});
   return helper;
  }});
  console.log(JSON.stringify({schema:'tabwise-identity-timing/1',sample,ok:result.ok,reason:result.reason,elapsed_ms:result.elapsed_ms,exit_code:result.exit_code,close:result.cleanup.process_close_observed,events}));
  assert.equal(result.ok,true);assert.equal(result.cleanup.process_close_observed,true);
  const identity=JSON.parse(result.stdout);assert.equal(identity.pid,child.pid);assert.equal(identity.path_sha256,executableHash(process.execPath));
 }
}finally{if(!closed){const end=once(child,'close');child.kill();await end;}assert.equal(closed,true);}
