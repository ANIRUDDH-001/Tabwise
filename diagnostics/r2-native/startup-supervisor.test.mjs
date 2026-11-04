import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {superviseStartup} from './startup-supervisor.mjs';
import {wallMicros} from '../../scripts/tabwise/r2-proctree.mjs';
function fixture(kind){
 let alive=false,created,launches=0;const timers=[],child=Object.assign(new EventEmitter(),{pid:777,stdout:new PassThrough(),stderr:new PassThrough()});
 const end=(code=0)=>{alive=false;child.emit('exit',code,null);child.emit('close',code,null);};
 child.kill=()=>{end(1);return true;};
 child.send=()=>{if(kind==='timeout'){timers[0]();return;}setImmediate(()=>{
  const result={schema:'tabwise-startup-only/1',startup_pass:true,production_qualified:false,native_interaction_pass:false,physical_quiescence_verified:false,sends:0,error:null,cleanup_error:false,receipt:{pid:88,relay_pid:88,reset_confirmed:true}};
  const text=kind==='overflow'?'A'.repeat(9000):kind==='malformed'?'PRIVATE':JSON.stringify({...result,...kind==='sends'?{sends:1}:{}})+'\n';
  child.stdout.emit('data',Buffer.from(text));if(alive)end(kind==='failed'?1:0);
 });};
 const tools={snapshot:async()=>({now:wallMicros(Date.now),processes:kind==='foreign'?[{pid:88,ppid:1,name:'nvda.exe',created:wallMicros(Date.now)}]:alive?[{pid:777,ppid:555,name:'node.exe',created:kind==='identity'?null:created}]:[],nvda_listeners:[]}),terminate:async()=>[]};
 return {input:{tools,launch:()=>{launches++;alive=true;created=wallMicros(Date.now);return child;},setTimer:fn=>{timers.push(fn);return timers.length;},clearTimer:()=>{},setSampler:()=>1,clearSampler:()=>{}},launches:()=>launches};
}
test('supervisor requires quiescent baseline before launch',async()=>{const f=fixture('foreign'),r=await superviseStartup(f.input);assert.equal(f.launches(),0);assert.equal(r.startup_pass,false);});
test('supervisor accepts only zero-key result after exact root custody and independent cleanup',async()=>{const f=fixture('ok'),r=await superviseStartup(f.input);assert.equal(r.startup_pass,true);assert.equal(r.custody.root.exact,true);assert.equal(r.custody.confirmed,true);assert.equal(r.physical_quiescence_verified,false);});
for(const kind of ['failed','malformed','sends','overflow','identity','timeout'])test(`supervisor refuses ${kind}; no outcome promotes qualification`,async()=>{const f=fixture(kind),r=await superviseStartup(f.input);assert.equal(r.startup_pass,false);assert.equal(r.native_interaction_pass,false);assert.equal(r.production_qualified,false);assert.doesNotMatch(JSON.stringify(r),/PRIVATE|AAAA/);});
test('asynchronous spawn failure with no PID is handled without unhandled process errors',async()=>{
 const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),kill:()=>false});
 const r=await superviseStartup({tools:{snapshot:async()=>({processes:[],nvda_listeners:[]}),terminate:async()=>[]},launch:()=>{setImmediate(()=>{child.emit('error',Error('PRIVATE'));child.emit('close',-1,null);});return child;},setSampler:()=>1,clearSampler:()=>{}});
 assert.equal(r.startup_pass,false);assert.doesNotMatch(JSON.stringify(r),/PRIVATE/);
});
test('cancellation before admission refuses launch; cancellation after launch still reaps custody',async()=>{
 const before=fixture('ok'),cancelled=new AbortController();cancelled.abort();const a=await superviseStartup({...before.input,signal:cancelled.signal});assert.equal(before.launches(),0);assert.equal(a.startup_pass,false);
 const f=fixture('ok'),controller=new AbortController(),launch=f.input.launch;
 f.input.launch=()=>{const child=launch();child.send=()=>controller.abort();return child;};
 const b=await superviseStartup({...f.input,signal:controller.signal});assert.equal(b.startup_pass,false);assert.equal(b.custody.confirmed,true);assert.equal(b.reason,'cancelled');
});

test('surviving NVDA helper cannot be labelled complete containment',async()=>{const f=fixture('ok'),snapshot=f.input.tools.snapshot;f.input.tools.snapshot=async()=>{const s=await snapshot();return {...s,processes:[...s.processes,{pid:999,ppid:1,name:'nvdaHelperRemoteLoader.exe',created:wallMicros(Date.now)}]};};const r=await superviseStartup(f.input);assert.equal(r.startup_pass,false);assert.equal(r.post.helper_count,1);assert.deepEqual(r.containment_diagnostic,{stage:'supervisor-containment',code:'unconfirmed'});});
