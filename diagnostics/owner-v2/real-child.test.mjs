import test from 'node:test';import assert from 'node:assert/strict';
import {runBounded} from './resolver.mjs';
const run=(code,options={})=>runBounded({file:process.execPath,args:['-e',code],deadline:performance.now()+2000,...options});
test('real child complete, nonzero and missing executable',async()=>{
 const complete=await run("process.stdout.write('complete')");assert.equal(complete.ok,true);assert.equal(complete.stdout,'complete');
 const bad=await run("process.stdout.write('partial');process.exitCode=7");assert.equal(bad.reason,'exit');assert.equal(bad.exit_code,7);assert.equal(bad.stdout,'');
 const missing=await runBounded({file:'Z:/does-not-exist/tabwise.exe',args:[],deadline:performance.now()+1000});assert.equal(missing.reason,'launch-error');
});
test('real partial output and hung child deadline is not completion',async()=>{
 const r=await run("process.stdout.write('partial');setInterval(()=>{},1000)",{deadline:performance.now()+200});
 assert.equal(r.reason,'deadline');assert.equal(r.stdout,'');assert.equal(r.cleanup.process_close_observed,true);assert.equal(r.cleanup.physical_quiescence_verified,false);assert.equal(r.cleanup.containment_required,true);
});
test('real cancellation is observed and child close stays distinct from physical quiet',async()=>{
 const a=new AbortController(),timer=setTimeout(()=>a.abort(),200);
 try{const r=await run("setInterval(()=>{},1000)",{signal:a.signal});assert.equal(r.reason,'cancelled');assert.equal(r.cleanup.process_close_observed,true);assert.equal(r.cleanup.physical_quiescence_verified,false);}finally{clearTimeout(timer);}
});
test('real output cap discards partial content',async()=>{const r=await run("process.stdout.write('x'.repeat(100000));setInterval(()=>{},1000)",{maxBytes:64});assert.equal(r.reason,'output-cap');assert.equal(r.stdout,'');});
