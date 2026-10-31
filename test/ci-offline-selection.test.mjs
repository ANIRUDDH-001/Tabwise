import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {selectTests, profilePlan, runFile, fileWatchdogMs} from '../scripts/offline-tests.mjs';
import * as harness from '../scripts/offline-tests.mjs';
import {EventEmitter} from 'node:events';
import {spawn} from 'node:child_process';
const runProfile=(...args)=>harness.runProfile(...args);
const profileBudgetMs=(...args)=>harness.profileBudgetMs(...args);

// Independent test cleanup: a regression in runFile must not strand a real child.
async function checkedRealFile(args,options={}){
  let child,closed=false,outer;
  try{
    const result=await Promise.race([
      runFile(args,{...options,spawnImpl:(...argv)=>{
        child=spawn(...argv);child.once('close',()=>{closed=true;});return child;
      }}),
      new Promise((_,reject)=>{outer=setTimeout(()=>reject(Error('independent test parent deadline')),5000);}),
    ]);
    assert.equal(result.exit_confirmed,true);assert.equal(result.stdio_closed,true);
    return result;
  }finally{
    clearTimeout(outer);
    if(child&&!closed){
      if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error(`test child cleanup unconfirmed: pid ${child.pid}`)),1000);
        child.once('close',()=>{clearTimeout(timer);resolve();});
      });
    }
    if(child?.pid)assert.ok(child.exitCode!==null||child.signalCode!==null,'real direct child terminated');
  }
}

test('ordinary and every stress profile share a fail-closed offline allowlist', () => {
  const names = readdirSync('test').filter(name => name.endsWith('.test.mjs'));
  const selection = selectTests(names);
  assert.ok(selection.included.includes('r2-capture-receipts.test.mjs'));
  for (const name of ['fernway.test.mjs','tabwise-network-browser.test.mjs','tabwise-qualification-browser.test.mjs','tabwise-d73-admission.test.mjs']) {
    assert.ok(!selection.included.includes(name));
    assert.ok(selection.excluded.some(row => row.file === name));
  }
  for (const profile of profilePlan('123')) assert.deepEqual([...profile.files].sort(), selection.included);
  assert.throws(() => selectTests([...names, 'new-unknown.test.mjs']), /unclassified.*new-unknown/);
  assert.throws(() => selectTests(names.filter(name => name !== 'fernway.test.mjs')), /missing.*fernway/);
});

test('an open listener becomes a bounded named timeout, not PASS', async () => {
  const result = await checkedRealFile(['-e', `require('node:http').createServer().listen(0,'127.0.0.1')`], {timeoutMs:300});
  assert.equal(result.classification, 'TIMEOUT');
  assert.notEqual(result.code, 0);
  assert.equal(result.exit_confirmed,true);
  assert.equal(result.stdio_closed,true);
});

test('a failing child is a failure and a successful child is PASS', async () => {
  assert.equal((await checkedRealFile(['-e','process.exitCode=7'])).classification, 'FAIL');
  assert.equal((await checkedRealFile(['-e',''])).classification, 'PASS');
});

test('workflow invokes only bounded profiles and retains post-checks and diagnostics', () => {
  const workflow=readFileSync('.github/workflows/preflight.yml','utf8');
  assert.doesNotMatch(workflow, /run: npm test|test\/\*\.test\.mjs/);
  assert.match(workflow,/node scripts\/offline-tests.mjs --profile ordinary/);
  assert.match(workflow,/node scripts\/offline-tests.mjs --profile stress/);
  assert.match(workflow,/after\.json/);
  assert.match(workflow,/Upload preflight output\s+if: always\(\)/);
});


test('a file with no registered tests or only skips cannot be counted as PASS', async () => {
  const dir=mkdtempSync(join(tmpdir(),'ci-h1-counts-'));
  try {
    const files={
      empty:'// no registered tests\n',
      skipped:"import {test} from 'node:test'; test('skip',{skip:true},()=>{});\n",
      passing:"import {test} from 'node:test'; test('pass',()=>{});\n",
    };
    for(const [kind,source] of Object.entries(files)) {
      const path=join(dir,`${kind}.test.mjs`);
      writeFileSync(path,source);
      const result=await checkedRealFile(['--test-reporter=tap','--test-timeout=10000',path],
        {expectTests:true,timeoutMs:3000});
      assert.equal(result.classification,kind==='passing'?'PASS':'FAIL',`${kind}: ${JSON.stringify(result)}`);
      if(kind==='passing')assert.equal(result.test_totals?.tests,1);
      if(kind==='skipped')assert.equal(result.test_totals?.skipped,1);
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});

// D-90 / CI-H3-S explicitly amends scheduling only; all other bounds remain enforced.
test('only mixed and stall-40 speech get 120s and the profile remainder still wins', () => {
  for(const profile of profilePlan('125615')) {
    for(const file of profile.files) {
      const cap=fileWatchdogMs(profile.name,file,180000);
      assert.equal(cap,['mixed','stall-40'].includes(profile.name)&&file==='speech.test.mjs'?120000:60000,`${profile.name}/${file}`);
    }
  }
  assert.equal(fileWatchdogMs('mixed','speech.test.mjs',45000),45000);
  assert.equal(fileWatchdogMs('mixed','speech.test.mjs',120000),120000);
  assert.equal(fileWatchdogMs('mixed','sendguard.test.mjs',180000),60000);
  assert.throws(()=>fileWatchdogMs('mixed','speech.test.mjs',0),/remainder/);
});

function eventRig(){
  let clock=0,id=0;const timers=new Map(),child=new EventEmitter();
  child.pid=123;child.stdout=new EventEmitter();child.stderr=new EventEmitter();
  child.stdout.destroy=()=>{};child.stderr.destroy=()=>{};child.unref=()=>{};child.kill=()=>true;
  const advance=ms=>{clock+=ms;for(;;){const next=[...timers].find(([,t])=>t.at<=clock);if(!next)break;timers.delete(next[0]);next[1].fn();}};
  return {child,advance,options:{spawnImpl:()=>child,now:()=>clock,
    setTimer:(fn,ms)=>{timers.set(++id,{fn,at:clock+ms});return id;},clearTimer:key=>timers.delete(key)}};
}

test('CI-H3 monotonic file timing records a confirmed watchdog termination', async () => {
  const rig=eventRig();rig.child.kill=()=>{rig.child.emit('exit',null,'SIGKILL');rig.child.emit('close',null,'SIGKILL');return true;};
  const pending=runFile([], {timeoutMs:100,...rig.options});rig.advance(100);
  const result=await pending;
  assert.equal(result.classification,'TIMEOUT');
  assert.equal(result.watchdog_ms,100);
  assert.equal(result.watchdog_fired,true);
  assert.equal(result.exit_confirmed,true);
  assert.equal(result.stdio_closed,true);
  assert.equal(result.file_elapsed_ms,100);
  assert.equal(result.exit_elapsed_ms,100);assert.equal(result.stdio_close_elapsed_ms,100);
});

test('CI-H3 unconfirmed child exit is bounded and stops every later launch', async () => {
  const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();
  let kills=0;child.kill=()=>{kills++;return true;};child.unref=()=>{};
  const first=await runFile([], {timeoutMs:10,terminationGraceMs:20,spawnImpl:()=>child});
  assert.equal(first.classification,'TIMEOUT');assert.equal(first.exit_confirmed,false);
  assert.equal(first.watchdog_fired,true);assert.equal(kills,1);
  let launches=0;
  const result=await runProfile({name:'ordinary',files:['a','b','c']},{run:async()=>{launches++;return first;}});
  assert.equal(launches,1);assert.equal(result.rows.length,3);
  for(const row of result.rows.slice(1)){
    assert.equal(row.executed,false);assert.equal(row.classification,'FAIL');
    assert.equal(row.reason,'previous_process_exit_unconfirmed');
  }
  child.emit('close',0,null);
  assert.equal(first.exit_confirmed,false,'late close cannot rewrite the recorded result');
  const later=await runProfile({name:'mixed',files:['d','e']},{blocked:true,run:async()=>{throw Error('must not launch');}});
  assert.equal(later.rows.length,2);
  assert.ok(later.rows.every(row=>row.executed===false&&row.reason==='previous_process_exit_unconfirmed'));
});

test('CI-H3 profile exhaustion accounts for every unexecuted selected file', async () => {
  let clock=0,launches=0;
  const result=await runProfile({name:'ordinary',files:['a','b','c']},{now:()=>clock,run:async()=>{
    launches++;clock=180001;return {classification:'PASS',code:0,signal:null,exit_confirmed:true,stdio_closed:true};
  }});
  assert.equal(launches,1);assert.equal(result.budget_ms,180000);assert.equal(result.elapsed_ms,180001);
  assert.deepEqual(result.rows.map(r=>r.file),['a','b','c']);
  for(const row of result.rows.slice(1)){
    assert.equal(row.classification,'PROFILE_TIMEOUT');assert.equal(row.executed,false);
    assert.equal(row.reason,'profile_budget_exhausted');
  }
});

test('CI-H3 profile records nominal and granted watchdog without changing limits or faults', async () => {
  let clock=0;const calls=[];
  const env={R1T_FS_DELAY_MS:'30',R1T_STALL_MS:'60',R1T_STALL_EVERY_MS:'80'};
  const result=await runProfile({name:'mixed',files:['a','speech.test.mjs','b'],env},{now:()=>clock,run:async(args,options)=>{
    calls.push({args,options});clock+=calls.length===1?190000:50001;
    return {classification:calls.length===1?'PASS':'TIMEOUT',code:null,signal:'SIGKILL',exit_confirmed:true,stdio_closed:true};
  }});
  const row=result.rows[1];
  assert.equal(row.elapsed_before_ms,190000);assert.equal(row.remaining_at_launch_ms,50000);
  assert.equal(row.nominal_watchdog_ms,120000);assert.equal(row.watchdog_ms,50000);
  assert.equal(row.watchdog_scope,'profile_remainder');assert.equal(row.executed,true);
  assert.equal(calls[1].options.timeoutMs,50000);assert.deepEqual(calls[1].options.env,env);
  assert.ok(calls[1].args.includes('--test-timeout=10000'));
  assert.ok(calls[1].args.includes('--import'));
  assert.equal(result.rows[2].classification,'PROFILE_TIMEOUT');
  assert.equal(fileWatchdogMs('stall-40','speech.test.mjs',180000),120000);
});

test('CI-H3-S D-90 changes only the two registered profile budgets',()=>{
  for(const profile of profilePlan('426136')){
    assert.equal(profileBudgetMs(profile.name),['stall-40','mixed'].includes(profile.name)?240000:180000,profile.name);
  }
  assert.equal(profilePlan('426136').slice(1).reduce((sum,p)=>sum+profileBudgetMs(p.name),0),1560000);
  assert.match(readFileSync('.github/workflows/preflight.yml','utf8'),/timeout-minutes: 30/);
});

test('CI-H3-S both amended profiles report 240s and account for all files at exhaustion',async()=>{
  for(const name of ['stall-40','mixed']){
    let clock=0,calls=0;
    const report=await runProfile({name,files:['a','b','c']},{now:()=>clock,run:async()=>{
      calls++;clock=240001;return {classification:'PASS',exit_confirmed:true,stdio_closed:true};
    }});
    assert.equal(report.budget_ms,240000);assert.equal(report.elapsed_ms,240001);assert.equal(calls,1);
    assert.deepEqual(report.rows.map(r=>r.file),['a','b','c']);
    assert.equal(report.rows[0].remaining_at_launch_ms,240000);
    assert.ok(report.rows.slice(1).every(r=>r.classification==='PROFILE_TIMEOUT'&&r.executed===false));
  }
});

test('CI-H3-S amended speech caps still clip and fractional remainder never overruns',async()=>{
  for(const name of ['stall-40','mixed']){
    assert.equal(fileWatchdogMs(name,'speech.test.mjs',240000),120000);
    assert.equal(fileWatchdogMs(name,'speech.test.mjs',45000),45000);
    assert.equal(fileWatchdogMs(name,'vendor.test.mjs',240000),60000);
    let calls=0;
    const report=await runProfile({name,files:['speech.test.mjs']},{startedAt:0,now:()=>239999.5,run:async()=>{calls++;}});
    assert.equal(calls,0);assert.equal(report.rows[0].remaining_at_launch_ms,0.5);
    assert.equal(report.rows[0].classification,'PROFILE_TIMEOUT');
  }
});

test('F1 exited process with held pipes is bounded FAIL, never PASS even with complete TAP',async()=>{
  const rig=eventRig();const pending=runFile([], {timeoutMs:100,expectTests:true,...rig.options});
  rig.child.stdout.emit('data',Buffer.from('# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n'));
  rig.advance(20);rig.child.emit('exit',0,null);rig.advance(1000);
  const r=await pending;
  assert.equal(r.classification,'FAIL');assert.equal(r.reason,'stdio_close_unconfirmed');
  assert.equal(r.exit_confirmed,true);assert.equal(r.process_exit_observed,true);
  assert.equal(r.stdio_closed,false);assert.equal(r.stdio_close_observed,false);
  assert.equal(r.process_exit_code,0);assert.equal(r.process_exit_signal,null);
  assert.equal(r.exit_elapsed_ms,20);assert.equal(r.stdio_close_elapsed_ms,null);
  assert.equal(r.file_elapsed_ms,1020);assert.equal(r.watchdog_fired,false);
  let launches=0;const profile=await runProfile({name:'ordinary',files:['a','b']},{run:async()=>{launches++;return r;}});
  assert.equal(launches,1);assert.equal(profile.rows[1].reason,'previous_stdio_close_unconfirmed');
});

test('F1 close without exit cannot confirm termination',async()=>{
  const rig=eventRig();const pending=runFile([], {timeoutMs:100,...rig.options});
  rig.advance(10);rig.child.emit('close',0,null);rig.advance(90);rig.advance(910);
  const r=await pending;assert.equal(r.classification,'TIMEOUT');
  assert.equal(r.exit_confirmed,false);assert.equal(r.stdio_closed,true);
  assert.equal(r.reason,'process_exit_unconfirmed');assert.equal(r.process_exit_observed,false);
  assert.equal(r.stdio_close_elapsed_ms,10);assert.equal(r.exit_elapsed_ms,null);
});

test('F1 no exit and no close remain unconfirmed after one second',async()=>{
  assert.throws(()=>runFile([], {terminationGraceMs:1001,spawnImpl:()=>{throw Error('must not spawn');}}),/termination confirmation bound/);
  const rig=eventRig();const pending=runFile([], {timeoutMs:100,...rig.options});
  rig.advance(100);rig.advance(1000);const r=await pending;
  assert.equal(r.classification,'TIMEOUT');assert.equal(r.reason,'process_exit_unconfirmed');
  assert.equal(r.exit_confirmed,false);assert.equal(r.stdio_closed,false);
  assert.equal(r.file_elapsed_ms,1100);assert.equal(r.termination_grace_ms,1000);
});

test('F1 exit and close confirm PASS only with complete TAP',async()=>{
  for(const complete of [true,false]){
    const rig=eventRig();const pending=runFile([], {expectTests:true,...rig.options});
    rig.child.stdout.emit('data',Buffer.from(complete?'# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n':'# tests 1\n# pass 1\n'));
    rig.advance(3);rig.child.emit('exit',0,null);rig.advance(4);rig.child.emit('close',0,null);
    const r=await pending;assert.equal(r.classification,complete?'PASS':'FAIL');
    assert.equal(r.exit_confirmed,true);assert.equal(r.stdio_closed,true);
    assert.equal(r.exit_elapsed_ms,3);assert.equal(r.stdio_close_elapsed_ms,7);
  }
});

test('F2 missing confirmation fields fail closed and block later launches',async()=>{
  for(const confirmations of [{},{exit_confirmed:true},{stdio_closed:true},{exit_confirmed:1,stdio_closed:true},{exit_confirmed:true,stdio_closed:'true'}]){
    let launches=0;const report=await runProfile({name:'ordinary',files:['a','b']},{run:async()=>{launches++;return {classification:'PASS',...confirmations};}});
    assert.equal(launches,1);assert.equal(report.rows[0].classification,'FAIL');
    assert.equal(report.rows[1].executed,false);
    assert.equal(report.rows[1].reason,confirmations.exit_confirmed===true?'previous_stdio_close_unconfirmed':'previous_process_exit_unconfirmed');
  }
});

test('F2 failed spawn is FAIL with no invented process exit',async()=>{
  const r=await runFile([], {spawnImpl:()=>{throw Error('ENOENT fixture');}});
  assert.equal(r.classification,'FAIL');assert.equal(r.reason,'spawn_failed');
  assert.equal(r.spawned,false);assert.equal(r.process_exit_observed,false);
  assert.equal(r.stdio_close_observed,false);assert.equal(r.exit_elapsed_ms,null);
  assert.equal(r.error,'ENOENT fixture');
});

test('F3 fractional remainder below 1ms launches nothing; larger remainder rounds down',async()=>{
  let calls=0;const empty=await runProfile({name:'ordinary',files:['a','b']},{startedAt:0,now:()=>179999.5,run:async()=>{calls++;}});
  assert.equal(calls,0);assert.equal(empty.rows.length,2);
  assert.ok(empty.rows.every(r=>r.classification==='PROFILE_TIMEOUT'&&r.executed===false));
  assert.equal(empty.rows[0].remaining_at_launch_ms,0.5);
  const one=await runProfile({name:'ordinary',files:['a']},{startedAt:0,now:()=>179998.1,run:async(_,o)=>{
    calls++;assert.equal(o.timeoutMs,1);return {classification:'PASS',exit_confirmed:true,stdio_closed:true};
  }});
  assert.equal(calls,1);assert.equal(one.rows[0].watchdog_ms,1);
});
