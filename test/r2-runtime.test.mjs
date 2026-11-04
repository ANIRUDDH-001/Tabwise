import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createLifecycle} from '../scripts/tabwise/r2-nvda-lifecycle.mjs';
const identity={pid:123,created:'133000000000000000',path_sha256:'a'.repeat(64)};
function setup({owners=[123],after=identity,identityValue=identity,stopped=false}={}){
 const child=new EventEmitter();child.pid=123;child.exitCode=null;child.kill=()=>{started=false;child.exitCode=0;child.emit('exit',0);child.emit('close',0);return true;};
 let started=false,queries=0,kills=0;const gate={isStopped:()=>stopped};
 const lifecycle=createLifecycle({gate,executable:()=> 'C:\\nvda.exe',configPath:()=> 'config',pathHash:()=>identity.path_sha256,
 spawn:()=>{started=true;return child;},running:async()=>started,
 query:async()=>{queries++;return {query_completed:true,outcome:started&&child.exitCode===null?(owners.length===1?'unique':'ambiguous'):'absent',pids:started&&child.exitCode===null?owners:[],measurement:{cleanup:{process_close_observed:true}}};},
 identify:async()=>queries>1?after:identityValue,quit:async()=>{kills++;child.kill();return {listener_stopped:true};}});
 return {lifecycle,child,counts:()=>({queries,kills})};
}
test('internal startup and subsequent owner checks use authenticated resolver',async()=>{const s=setup();const owned=await s.lifecycle.start();assert.equal(owned.pid,123);assert.equal(await s.lifecycle.relayOwnerPid(),123);assert.ok(s.counts().queries>=3);assert.equal((await s.lifecycle.quit({owned})).listener_stopped,true);});
for(const [label,options] of [['competing',{owners:[123,456]}],['foreign',{owners:[456]}],['PID reuse',{after:{...identity,created:'133000000000000001'}}],['wrong executable',{identityValue:{...identity,path_sha256:'b'.repeat(64)}}],['stale',{identityValue:null}],['stopped',{stopped:true}]])test('refuses '+label,async()=>{const s=setup(options);await assert.rejects(async()=>{await s.lifecycle.start();await s.lifecycle.relayOwnerPid();});});
test('unstarted owner cannot fall back to legacy discovery',async()=>{await assert.rejects(setup().lifecycle.relayOwnerPid(),/owned/);});
test('unavailable executable refuses before spawn',async()=>{const l=createLifecycle({gate:{isStopped:()=>false},executable:()=>null});await assert.rejects(l.start(),/installed/);});

test('dead owned process never invokes global quit',async()=>{const s=setup();const owned=await s.lifecycle.start();s.child.kill();assert.deepEqual(await s.lifecycle.quit({owned}),{listener_stopped:true});assert.equal(s.counts().kills,0);});
for(const phase of ['identity','listener'])test('cancellation during '+phase+' query bounds uncooperative helper',async()=>{
 let stopped=false,alive=false,count=0;const child=new EventEmitter();child.pid=123;child.exitCode=null;child.kill=()=>{alive=false;child.exitCode=0;child.emit('exit');child.emit('close');return true;};
 const gate={isStopped:()=>stopped};
 const lifecycle=createLifecycle({gate,executable:()=> 'C:\\nvda.exe',configPath:()=> 'config',pathHash:()=>identity.path_sha256,spawn:()=>{alive=true;return child;},running:async()=>alive,
 identify:async()=>{if(phase==='identity'){setTimeout(()=>{stopped=true;},10);return new Promise(()=>{});}return identity;},
 query:async()=>{if(phase==='listener'&&++count===2){setTimeout(()=>{stopped=true;},10);return new Promise(()=>{});}return {query_completed:true,outcome:alive?'unique':'absent',pids:alive?[123]:[],measurement:{cleanup:{process_close_observed:true}}};}});
 const began=performance.now();await assert.rejects(lifecycle.start(),/cannot be started/);assert.ok(performance.now()-began<1000);assert.equal(child.exitCode,0);
});
test('hung direct child cleanup refuses physical quiescence',async()=>{const s=setup();await s.lifecycle.start();s.child.kill=()=>true;await assert.rejects(s.lifecycle.quit({deadlineMs:performance.now()+30}),/close unconfirmed/);});
test('expired startup deadline launches nothing',async()=>{const s=setup();await assert.rejects(s.lifecycle.start({deadlineMs:performance.now()-1}),/deadline/);assert.equal(s.counts().queries,0);});

test('source pins refuse changed lifecycle bytes and preserve frozen vendor isolation',async()=>{const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');const {runtimeIntegrity}=await import('../scripts/tabwise/r2-runtime-integrity.mjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tw-r2-pin-test-')),pins=JSON.parse(fs.readFileSync('scripts/tabwise/r2-runtime-pins.json'));for(const name of [...Object.keys(pins.files),'scripts/tabwise/r2-runtime-pins.json']){const target=path.join(dir,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(name,target);}assert.deepEqual(runtimeIntegrity(dir),[]);fs.appendFileSync(path.join(dir,'scripts/tabwise/r2-nvda-lifecycle.mjs'),'\n// tampered');assert.match(runtimeIntegrity(dir).join(),/runtime source changed/);});

test('dead child exit without close retains cleanup uncertainty',async()=>{const s=setup();await s.lifecycle.start();s.child.exitCode=0;s.child.emit('exit');await assert.rejects(s.lifecycle.quit({deadlineMs:performance.now()+25}),/close unconfirmed/);assert.equal(s.counts().kills,0);});
