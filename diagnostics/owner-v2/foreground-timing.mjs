// Hosted read-only probe of the unchanged foreground helper, no key/focus operation and no window text output.
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {R2_FOREGROUND_BOOTSTRAP} from '../../scripts/tabwise/r2-loader.mjs';
import {PROBE_PS} from '../../src/speech/foreground.mjs';
import {runBounded,systemExecutable} from './resolver.mjs';
import {r2ChildEnv} from '../../scripts/tabwise/r2-run.mjs';
const mark=s=>`[Console]::Error.WriteLine('FG_TIMING ${s}')\n`;
const code=mark('script-entry')+mark('utility-import-start')+R2_FOREGROUND_BOOTSTRAP+mark('utility-ready')+PROBE_PS
 .replace('Add-Type -TypeDefinition',mark('type-start')+'Add-Type -TypeDefinition')
 .replace('while ($null',mark('type-ready')+'while ($null')
 .replace('  $request =',mark('request-start')+'  $request =')
 .replace('  $h =',mark('request-parsed')+'  $h =')
 .replace('  [Console]::Out.WriteLine',mark('window-read')+'  [Console]::Out.WriteLine')
 .replace('  [Console]::Out.Flush()',mark('serialized')+'  [Console]::Out.Flush()');
const began=performance.now(),events=[];
const result=await runBounded({file:systemExecutable('WindowsPowerShell/v1.0/powershell.exe'),args:['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],deadline:began+25000,maxBytes:65536,spawnImpl:(file,args,options)=>{
 const helper=spawn(file,args,{...options,stdio:['pipe','pipe','pipe'],env:r2ChildEnv(process.env)});
 let buffer='';helper.stderr.on('data',b=>{buffer+=String(b);let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i).trim();buffer=buffer.slice(i+1);const m=/^FG_TIMING ([a-z-]+)$/.exec(line);if(m)events.push({stage:m[1],elapsed_ms:performance.now()-began});}if(buffer.length>8192)buffer='';});
 helper.stdin.end('{"id":1}\n');return helper;
}});
console.log(JSON.stringify({schema:'tabwise-foreground-timing/1',ok:result.ok,reason:result.reason,elapsed_ms:result.elapsed_ms,close:result.cleanup.process_close_observed,events,window_text:'omitted',sends:0}));
assert.equal(result.ok,true);assert.equal(result.cleanup.process_close_observed,true);const value=JSON.parse(result.stdout.trim());assert.equal(value.request_id,1);assert(Number.isInteger(value.pid));assert.equal(typeof value.title,'string');
