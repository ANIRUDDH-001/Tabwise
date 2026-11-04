import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import childProcess from 'node:child_process';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createStartupTrace} from './startup-trace.mjs';
import {runReadOnlyProbe} from './probe-runner.mjs';
const fake=()=>Object.assign(new EventEmitter(),{pid:2112,stdout:new PassThrough(),stderr:new PassThrough()});
test('external launch preserves receiver, arguments, options and returned process identity; no global hooks',()=>{
 const original=childProcess.spawn,trace=createStartupTrace(),child=fake(),receiver={},argv=['literal'],opts={stdio:['ignore','pipe','pipe']};let seen;
 function launch(...args){seen=[this,...args];return child;}
 assert.equal(trace.launch(launch,receiver,[argv,opts]),child);assert.equal(seen[0],receiver);assert.equal(seen[1],argv);assert.equal(seen[2],opts);assert.equal(childProcess.spawn,original);
 assert.equal(child.stdout.listenerCount('data'),0);assert.equal(child.stderr.listenerCount('data'),0);assert.equal(child.listenerCount('error'),0);
 assert.equal(Object.hasOwn(child,'emit'),false);assert.equal(Object.hasOwn(child.stdout,'emit'),false);trace.dispose();assert.equal(child.listenerCount('close'),0);
});
test('event ordering, separate timestamps, bounded counters and cleanup remain observational',()=>{
 let t=0;const trace=createStartupTrace({now:()=>++t}),child=fake(),events=[];
 child.on('exit',(...a)=>events.push(['exit',...a]));child.on('close',(...a)=>events.push(['close',...a]));trace.launch(()=>child);
 assert.equal(child.emit('exit',0,null),true);assert.equal(trace.snapshot().close_ms,null);child.emit('close',0,null);
 assert.deepEqual(events,[['exit',0,null],['close',0,null]]);
 trace.output('stderr',Buffer.alloc(2000000,65));trace.output('stdout','secret-token');trace.cleanup({confirmed:true,quiescent:true,residue:[],errors:[]});trace.dispose();
 const r=trace.snapshot();assert.deepEqual([r.spawn_call_ms,r.spawn_return_ms,r.exit_ms,r.close_ms],[1,2,3,4]);assert.equal(r.output.stderr_bytes,1048576);assert.equal(r.output.truncated,true);
 assert.equal(r.cleanup.physical_quiescence_verified,false);assert.equal(r.owner_query.spawn_call_ms,null);assert.doesNotMatch(JSON.stringify(r),/secret-token|AAAA/);
 assert.ok(JSON.stringify(r).length<2048);
});
test('original errors and rejected promises retain identity; observer clock failure cannot replace outcome',async()=>{
 const error=Error('secret'),trace=createStartupTrace({now:()=>{throw error;}});
 assert.throws(()=>trace.launch(()=>{throw error;}),e=>e===error);assert.equal(trace.snapshot().degraded,true);
 const child=fake(),t=createStartupTrace();t.launch(()=>child);const p=new Promise((_,reject)=>child.once('error',reject));child.emit('error',error);await assert.rejects(p,e=>e===error);t.dispose();
});
test('paused/unread streams retain buffering and backpressure without subscriptions',()=>{
 const exercise=traced=>{const child=fake(),trace=traced?createStartupTrace():null;trace?.launch(()=>child);child.stdout.pause();const data=Buffer.alloc(1048576,42),writable=child.stdout.write(data);const before={writable,flow:child.stdout.readableFlowing,len:child.stdout.readableLength,needDrain:child.stdout.writableNeedDrain,listeners:child.stdout.listenerCount('data')};const read=child.stdout.read();trace?.dispose();return {before,read};};
 assert.deepEqual(exercise(true),exercise(false));
});
test('real synthetic worker preserves streams and exit/close order; tracing outside child only',async()=>{
 async function exercise(traced){const trace=traced?createStartupTrace():null;const launch=()=>childProcess.spawn(process.execPath,['-e',"process.stdout.write('synthetic');process.stderr.write('secret');"],{stdio:['ignore','pipe','pipe']});const child=trace?trace.launch(launch):launch();let out='',err='';const events=[];child.stdout.on('data',b=>{trace?.output('stdout',b);out+=b;});child.stderr.on('data',b=>{trace?.output('stderr',b);err+=b;});child.on('exit',()=>events.push('exit'));await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});events.push('close');trace?.dispose();return {out,err,events};}
 assert.deepEqual(await exercise(true),await exercise(false));
});
const vendor=readFileSync(new URL('../../vendor/guidepup-0.36.4-r1/lib/windows/NVDA/start.js',import.meta.url),'utf8');
test('deadline boundary regression: external tracing never intercepts the frozen owner-query spawn',async()=>{
 async function exercise(external){let workerTime=26999,timer;const child=fake(),cp={spawn:()=>child};child.kill=()=>{};
 const context={exports:{},Buffer,performance:{now:()=>workerTime},setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{},require:n=>n==='node:child_process'?cp:{}};
 vm.runInNewContext(vendor,context);const spawnBefore=cp.spawn;const trace=external?createStartupTrace({now:()=>1000000}):null;trace?.launch(()=>fake());
 const p=context.exports.relayOwnerPid({deadlineMs:27000});child.stdout.emit('data','2112\n');child.emit('close',0,null);const result=await p;trace?.dispose();assert.equal(cp.spawn,spawnBefore);assert.equal(workerTime,26999);assert.equal(typeof timer,'function');return result;}
 assert.equal(await exercise(false),2112);assert.equal(await exercise(true),2112);
});
test('worker remains uninstrumented; source inventory includes each executable diagnostic',async()=>{
 const {SOURCE_FILES}=await import('./policy.mjs');for(const f of ['startup-trace.mjs','external-trace.test.mjs','owner-query-probe.ps1','probe-runner.mjs'])assert.ok(SOURCE_FILES.includes('diagnostics/r2-native/'+f));
 const code=readFileSync(new URL('./run.mjs',import.meta.url),'utf8'),worker=code.slice(code.indexOf("process.argv[2]==='--worker'"),code.indexOf('process.argv.length===2'));
 assert.doesNotMatch(worker,/trace|installStartupTrace|createRequire/);assert.doesNotMatch(readFileSync(new URL('./startup-trace.mjs',import.meta.url),'utf8'),/\.stdout\.|\.stderr\.|\.emit\s*=/);
});
function probeFixture(kind){let killed=0;const child=fake();child.kill=()=>{killed++;return true;};const timers=[];let passed;
 const promise=runReadOnlyProbe({spawn:(...args)=>{passed=args;return child;},setTimer:fn=>{timers.push(fn);return timers.length;},clearTimer:()=>{},now:()=>1});
 if(kind==='valid'){child.stdout.emit('data',Buffer.from('{"phase":"powershell-entry"}\n'));child.emit('exit',1,null);child.emit('close',1,null);}
 if(kind==='overflow')child.stdout.emit('data',Buffer.alloc(10000,65));
 if(kind==='timeout'||kind==='overflow'){timers[0]();timers.at(-1)();}
 return {promise,killed:()=>killed,passed};
}
test('probe has fixed read-only command and bounded result, never forwards raw stderr',async()=>{
 const f=probeFixture('valid'),r=await f.promise;assert.equal(f.passed[0],'powershell.exe');assert.ok(f.passed[1].at(-1).endsWith('owner-query-probe.ps1'));assert.equal(r.trace.pid,2112);assert.equal(r.cleanup.process_close_observed,true);assert.equal(r.trace.close_code,1);
});
for(const kind of ['timeout','overflow'])test(`probe ${kind} kills only owned handle and reports unconfirmed cleanup without close`,async()=>{
 const f=probeFixture(kind),r=await f.promise;assert.ok(f.killed()>0);assert.equal(r.cleanup.process_close_observed,false);assert.equal(r.pass,false);assert.ok(JSON.stringify(r).length<4096);assert.doesNotMatch(JSON.stringify(r),/AAAA/);
});
test('probe refuses exit zero with missing, partial, reordered or credential-shaped output',async()=>{
 for(const text of ['', '{"phase":"query-call","at_ms":1}\n','{"token":"PRIVATE"}\n','{"phase":"powershell-entry"}']){
  const child=fake(),timers=[];child.kill=()=>true;
  const p=runReadOnlyProbe({spawn:()=>child,setTimer:fn=>{timers.push(fn);return 1;},clearTimer:()=>{}});
  child.stdout.emit('data',Buffer.from(text));child.stderr.emit('data',Buffer.from('PRIVATE'));child.emit('exit',0,null);child.emit('close',0,null);
  const r=await p;assert.equal(r.pass,false);assert.doesNotMatch(JSON.stringify(r),/PRIVATE/);
 }
});
test('complete read-only probe result succeeds only for one numeric owner, with no qualification',async()=>{
 const child=fake();child.kill=()=>true;const p=runReadOnlyProbe({spawn:()=>child,setTimer:()=>1,clearTimer:()=>{}});
 const final={schema:'tabwise-owner-query-probe/1',outcome:'one-owner',pid:2112,entry_ms:0,query_call_ms:1,query_return_ms:2,selection_return_ms:3,done_ms:4,owner_count:1,owner_pid:1234};
 for(const row of [{phase:'powershell-entry'},{phase:'query-call',at_ms:1},{phase:'query-return',at_ms:2},final])child.stdout.emit('data',Buffer.from(JSON.stringify(row)+'\n'));
 child.emit('exit',0,null);child.emit('close',0,null);const r=await p;assert.equal(r.pass,true);assert.equal(r.production_qualified,false);assert.equal(r.native_interaction_pass,false);
});
test('synchronous close during probe kill does not arm a post-finish timer',async()=>{
 const child=fake(),timers=[];child.kill=()=>{child.emit('exit',1,null);child.emit('close',1,null);};
 const p=runReadOnlyProbe({spawn:()=>child,setTimer:fn=>{timers.push(fn);return 1;},clearTimer:()=>{}});timers[0]();await p;assert.equal(timers.length,1);
});
test('probe rejects final-first and null successful timing records',async()=>{
 const final={schema:'tabwise-owner-query-probe/1',outcome:'one-owner',pid:2112,entry_ms:0,query_call_ms:1,query_return_ms:2,selection_return_ms:3,done_ms:4,owner_count:1,owner_pid:1234};
 const entry={phase:'powershell-entry'},call={phase:'query-call',at_ms:1},returned={phase:'query-return',at_ms:2};
 for(const rows of [[final,call,returned,final],[entry,call,returned,{...final,pid:null,query_return_ms:null}]]){
  const child=fake();child.kill=()=>true;const p=runReadOnlyProbe({spawn:()=>child,setTimer:()=>1,clearTimer:()=>{}});
  for(const row of rows)child.stdout.emit('data',Buffer.from(JSON.stringify(row)+'\n'));child.emit('close',0,null);assert.equal((await p).pass,false);
 }
});
