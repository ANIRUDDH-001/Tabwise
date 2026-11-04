import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {parseNetstat,runBounded,resolveOwner,authenticateOwner} from './resolver.mjs';
const header='Active Connections\r\n\r\n  Proto  Local Address  Foreign Address  State  PID\r\n';
const row=(addr='127.0.0.1:6837',pid=42,state='LISTENING')=>'  TCP  '+addr+'  0.0.0.0:0  '+state+'  '+pid+'\r\n';
test('IPv4/IPv6 exact listener port; repeated same owner deduplicated',()=>assert.deepEqual(parseNetstat(header+row()+row('[::]:6837')+row('0.0.0.0:16837',88)+row('0.0.0.0:6837',9,'ESTABLISHED'),6837),{outcome:'unique',pids:[42],rows:2}));
test('distinct owners remain ambiguous',()=>assert.equal(parseNetstat(header+row()+row('[::]:6837',43),6837).outcome,'ambiguous'));
test('completed empty table means absent',()=>assert.equal(parseNetstat(header,6837).outcome,'absent'));
test('Windows TIME_WAIT PID zero is ignored; listener PID zero remains refused',()=>assert.equal(parseNetstat(header+row('127.0.0.1:1234',0,'TIME_WAIT'),6837).outcome,'absent'));
test('Windows connected UDP endpoint is irrelevant to TCP discovery',()=>assert.equal(parseNetstat(header+'UDP  127.0.0.1:1234  127.0.0.1:443  42\n',6837).outcome,'absent'));
for(const value of ['',header+'garbage',header+row('bad:6837'),header+row('127.0.0.1:6837',0),header+row('127.0.0.1:6837','4x'),header+row('127.0.0.1:6837',4294967296),header+row('127.0.0.1:6837',2,'UNKNOWN'),header+row().trimEnd().slice(0,-1)])test('malformed output refused '+JSON.stringify(value.slice(-25)),()=>assert.throws(()=>parseNetstat(value,6837)));
test('partial final row refused',()=>assert.throws(()=>parseNetstat(header+row().trimEnd(),6837)));
test('scoped IPv6 accepted',()=>assert.equal(parseNetstat(header+row('[fe80::1%12]:6837'),6837).outcome,'unique'));
for(const port of [0,65536,1.5,'6837'])test('invalid port '+port,()=>assert.throws(()=>parseNetstat(header,port)));
function fake(action){return ()=>{const c=new EventEmitter();c.pid=123;c.stdout=new PassThrough();c.stderr=new PassThrough();c.kill=()=>{queueMicrotask(()=>c.emit('close',null,'SIGTERM'));return true;};queueMicrotask(()=>action(c));return c;};}
test('successful complete child output',async()=>{const r=await runBounded({file:'test',args:[],spawnImpl:fake(c=>{c.stdout.write('ok');c.emit('close',0,null);}),deadline:performance.now()+100});assert.equal(r.ok,true);assert.equal(r.stdout,'ok');assert.equal(r.cleanup.physical_quiescence_verified,false);assert.equal(r.cleanup.containment_required,true);});
for(const [name,action,reason] of [
 ['nonzero',c=>c.emit('close',1,null),'exit'],
 ['partial then hung',c=>c.stdout.write('part'),'deadline'],
 ['overflow',c=>c.stdout.write('x'.repeat(65)),'output-cap'],
 ['stderr overflow',c=>c.stderr.write('x'.repeat(65)),'output-cap'],
 ['launch event',c=>c.emit('error',new Error('private')),'launch-error'],
])test(name,async()=>{const r=await runBounded({file:'test',args:[],spawnImpl:fake(action),deadline:performance.now()+30,maxBytes:64,cleanupMs:20});assert.equal(r.ok,false);assert.equal(r.reason,reason);assert.equal(r.stdout,'');});
test('synchronous launch failure',async()=>assert.equal((await runBounded({file:'test',args:[],spawnImpl:()=>{throw Error('secret');},deadline:performance.now()+50})).reason,'launch-error'));
test('missing close keeps containment uncertainty',async()=>{const r=await runBounded({file:'test',args:[],spawnImpl:()=>{const c=fake(()=>{})();c.kill=()=>false;return c;},deadline:performance.now()+10,cleanupMs:10});assert.equal(r.cleanup.process_close_observed,false);assert.equal(r.cleanup.containment_required,true);});
test('pre-cancellation does not spawn',async()=>{const a=new AbortController();a.abort();const r=await runBounded({file:'test',args:[],signal:a.signal,spawnImpl:()=>{throw Error('must not launch');},deadline:performance.now()+30});assert.equal(r.reason,'cancelled');});
test('midflight cancellation',async()=>{const a=new AbortController();const p=runBounded({file:'test',args:[],signal:a.signal,spawnImpl:fake(()=>a.abort()),deadline:performance.now()+100});assert.equal((await p).reason,'cancelled');});
test('late successful close cannot beat expired deadline',async()=>{const r=await runBounded({file:'test',args:[],spawnImpl:fake(c=>{const end=performance.now()+15;while(performance.now()<end){}c.emit('close',0,null);}),deadline:performance.now()+5});assert.equal(r.ok,false);});
const identity={pid:42,created:'134000000000000000',path_sha256:'a'.repeat(64)};
test('authenticated stable exact identity',()=>assert.equal(authenticateOwner({pids:[42],before:identity,after:identity,expected:identity}).outcome,'authenticated'));
for(const changes of [{pid:43},{created:'134000000000000001'},{path_sha256:'b'.repeat(64)}])test('PID/creation/path substitution refused '+Object.keys(changes),()=>assert.equal(authenticateOwner({pids:[42],before:identity,after:{...identity,...changes},expected:identity}).outcome,'identity-mismatch'));
test('unique PID alone is not authentication',()=>assert.equal(authenticateOwner({pids:[42]}).outcome,'identity-unverified'));
test('resolver exposes absence as completed query, never native qualification',async()=>{const r=await resolveOwner({port:6837,deadline:performance.now()+100,run:async()=>({ok:true,stdout:header,elapsed_ms:1,cleanup:{}})});assert.equal(r.query_completed,true);assert.equal(r.outcome,'absent');assert.equal(r.native_qualified,false);});
