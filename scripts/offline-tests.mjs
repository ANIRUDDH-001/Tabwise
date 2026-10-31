// CI-H1: explicit coverage accounting, one directly owned Node process per file.
// No --test parent process (and thus no hidden test-runner grandchildren).
import {readFileSync, readdirSync, mkdirSync, writeFileSync, appendFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';

const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(readFileSync(new URL('../ci/offline-tests.json',import.meta.url),'utf8'));
export function selectTests(names=readdirSync(join(root,'test')).filter(n=>n.endsWith('.test.mjs'))) {
  const unknown=names.filter(name=>!Object.hasOwn(manifest,name));
  const missing=Object.keys(manifest).filter(name=>!names.includes(name));
  if(unknown.length)throw Error(`unclassified test files: ${unknown.join(', ')}`);
  if(missing.length)throw Error(`classified files missing: ${missing.join(', ')}`);
  const included=[],excluded=[];
  for(const file of [...names].sort()) {
    const entry=manifest[file];
    if(!['offline','harness','browser','process'].includes(entry.kind)||!entry.reason)throw Error(`invalid classification: ${file}`);
    if(['offline','harness'].includes(entry.kind))included.push(file);
    else excluded.push({file,...entry});
  }
  return {included,excluded};
}

export function profilePlan(seed='1') {
  if(!/^\d{1,9}$/.test(seed))throw Error('seed must be 1-9 decimal digits');
  const {included}=selectTests();
  let state=Number(seed)||1;
  const random=[...included];
  for(let i=random.length-1;i>0;i--){state=(Math.imul(state,1664525)+1013904223)>>>0;const j=state%(i+1);[random[i],random[j]]=[random[j],random[i]];}
  return [
    {name:'ordinary'}, {name:'repeat-1'}, {name:'repeat-2'}, {name:'serial'},
    {name:`random-${seed}`,files:random,flags:['--test-randomize',`--test-random-seed=${seed}`]},
    {name:'slow-fs-30',env:{R1T_FS_DELAY_MS:'30'}},
    {name:'slow-fs-100',env:{R1T_FS_DELAY_MS:'100'}},
    {name:'stall-40',env:{R1T_STALL_MS:'40',R1T_STALL_EVERY_MS:'50'}},
    {name:'mixed',env:{R1T_FS_DELAY_MS:'30',R1T_STALL_MS:'60',R1T_STALL_EVERY_MS:'80'}},
  ].map(p=>({...p,files:p.files??[...included]}));
}

function tapTotals(text) {
  const totals={};
  for(const match of text.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\r?$/gm)) {
    totals[match[1]]=Number(match[2]);
  }
  return ['tests','pass','fail','cancelled','skipped','todo'].every(key=>Number.isSafeInteger(totals[key])) ? totals : null;
}

// D-90 / CI-H3-S: explicitly amended CI scheduling ceilings, not functional deadlines.
export function profileBudgetMs(profileName) {
  return ['stall-40','mixed'].includes(profileName)?240000:180000;
}

// CI-H2 first allowed mixed speech 120s; D-90 also allows stall-40 speech 120s.
// All other files retain 60s; the current profile remainder always wins.
export function fileWatchdogMs(profileName,file,remainingMs) {
  if(!Number.isFinite(remainingMs)||remainingMs<=0)throw Error('invalid profile remainder');
  const fileCap=['mixed','stall-40'].includes(profileName)&&file==='speech.test.mjs'?120000:60000;
  return Math.min(fileCap,remainingMs);
}

export function runFile(args,{timeoutMs=60000,env={},output=()=>{},expectTests=false,terminationGraceMs=1000,spawnImpl=spawn,
  now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  if(!Number.isInteger(timeoutMs)||timeoutMs<1)throw Error('invalid process timeout');
  if(!Number.isInteger(terminationGraceMs)||terminationGraceMs<1||terminationGraceMs>1000)throw Error('invalid termination confirmation bound');
  return new Promise(resolveResult=>{
    const childEnv={...process.env,...env};delete childEnv.NODE_TEST_CONTEXT;
    const started=now();
    let timedOut=false,error,stdoutTail='',settled=false,timer,confirmation,child,spawned=true,spawnObserved=false;
    let exitObserved=false,closeObserved=false,exitAt=null,closeAt=null,exitCode=null,exitSignal=null,closeCode=null,closeSignal=null;
    const finish=()=>{
      if(settled)return;settled=true;clearTimer(timer);clearTimer(confirmation);
      const exitConfirmed=!spawned||exitObserved,stdioClosed=!spawned||closeObserved;
      const totals=expectTests?tapTotals(stdoutTail):null;
      const complete=!expectTests||(totals&&totals.tests>0&&totals.pass===totals.tests&&
        totals.fail===0&&totals.cancelled===0&&totals.skipped===0&&totals.todo===0);
      const code=exitObserved?exitCode:closeCode,signal=exitObserved?exitSignal:closeSignal;
      const reason=!spawned?'spawn_failed':!exitConfirmed?'process_exit_unconfirmed':!stdioClosed?'stdio_close_unconfirmed':null;
      resolveResult({classification:timedOut?'TIMEOUT':spawned&&exitConfirmed&&stdioClosed&&code===0&&!error&&complete?'PASS':'FAIL',code,signal,
        spawned,process_exit_observed:exitObserved,process_exit_code:exitCode,process_exit_signal:exitSignal,exit_elapsed_ms:exitAt,
        stdio_close_observed:closeObserved,close_code:closeCode,close_signal:closeSignal,stdio_close_elapsed_ms:closeAt,
        file_elapsed_ms:now()-started,watchdog_ms:timeoutMs,watchdog_fired:timedOut,exit_confirmed:exitConfirmed,stdio_closed:stdioClosed,
        ...(reason?{reason}:{}),
        termination_grace_ms:terminationGraceMs,...(expectTests?{test_totals:totals}:{}),...(error?{error}:{})});
    };
    // One bounded window from the first exit/close observation or watchdog action; never extended by later events.
    const confirm=()=>{
      if(settled||confirmation!==undefined)return;
      confirmation=setTimer(()=>{
        error=error??(!exitObserved?'process exit unconfirmed':'stdio close unconfirmed');
        child.unref?.();child.stdout.destroy?.();child.stderr.destroy?.();
        finish();
      },terminationGraceMs);
    };
    try { child=spawnImpl(process.execPath,args,{cwd:root,env:childEnv,stdio:['ignore','pipe','pipe'],windowsHide:true}); }
    catch(e){spawned=false;error=e.message;finish();return;}
    timer=setTimer(()=>{
      timedOut=true;
      try { child.kill('SIGKILL'); } catch(e){error=e.message;}
      confirm();
    },timeoutMs);
    child.stdout.on('data',data=>{if(settled)return;if(expectTests)stdoutTail=(stdoutTail+data.toString('utf8')).slice(-8192);output(data);});
    child.stderr.on('data',data=>{if(!settled)output(data);});
    child.on('spawn',()=>{spawnObserved=true;});
    child.on('error',e=>{
      if(settled)return;error=e.message;
      // Node reports spawn failure with no pid and no exit event; no process/pipes exist to confirm.
      if(!spawnObserved&&child.pid===undefined&&!exitObserved){spawned=false;finish();}
    });
    child.on('exit',(code,signal)=>{
      if(settled)return;exitObserved=true;exitCode=code;exitSignal=signal;exitAt=now()-started;
      clearTimer(timer);if(closeObserved)finish();else confirm();
    });
    child.on('close',(code,signal)=>{
      if(settled)return;closeObserved=true;closeCode=code;closeSignal=signal;closeAt=now()-started;
      if(exitObserved)finish();else confirm();
    });
  });
}

// Testable orchestration only: the production main supplies the unchanged classified profile plan.
export async function runProfile(profile,{run=runFile,now=()=>performance.now(),output=()=>{},onRow=()=>{},blocked=false,startedAt=now()}={}) {
  const budget=profileBudgetMs(profile.name),started=startedAt,rows=[];
  let unconfirmed=blocked===true?'process_exit_unconfirmed':blocked;
  for(const file of profile.files){
    const elapsed=now()-started,remaining=Math.max(0,budget-elapsed);
    const nominal=fileWatchdogMs(profile.name,file,budget);
    let row;
    if(unconfirmed||remaining<1){
      row={file,classification:unconfirmed?'FAIL':'PROFILE_TIMEOUT',executed:false,
        reason:unconfirmed?`previous_${unconfirmed}`:'profile_budget_exhausted',
        elapsed_before_ms:elapsed,remaining_at_launch_ms:remaining,nominal_watchdog_ms:nominal,watchdog_ms:null};
    }else{
      const allowance=fileWatchdogMs(profile.name,file,remaining);
      const flags=profile.env?['--import',new URL('../test/helpers/faults.mjs',import.meta.url).href]:[];
      const result=await run([...flags,'--test-reporter=tap','--test-timeout=10000',...(profile.flags??[]),`test/${file}`],
        {timeoutMs:Math.max(1,Math.floor(allowance)),env:profile.env,expectTests:true,output});
      unconfirmed=result.exit_confirmed!==true?'process_exit_unconfirmed':result.stdio_closed!==true?'stdio_close_unconfirmed':false;
      row={file,...result,...(unconfirmed?{classification:result.classification==='PASS'?'FAIL':result.classification,reason:unconfirmed}:{}),executed:true,elapsed_before_ms:elapsed,remaining_at_launch_ms:remaining,
        nominal_watchdog_ms:nominal,watchdog_ms:Math.max(1,Math.floor(allowance)),
        watchdog_scope:allowance<nominal?'profile_remainder':'file'};
    }
    rows.push(row);onRow(row,rows);
  }
  return {profile:profile.name,budget_ms:budget,elapsed_ms:now()-started,rows};
}

async function main() {
  const args=process.argv.slice(2),options={profile:'ordinary',seed:'1',out:'cache/ci-h1'};
  while(args.length){const key=args.shift();if(!['--profile','--seed','--out'].includes(key)||!args.length)throw Error('usage: --profile ordinary|stress|list --seed digits --out directory');options[key.slice(2)]=args.shift();}
  const selection=selectTests(),plan=profilePlan(options.seed);
  if(!['ordinary','stress','list'].includes(options.profile))throw Error('invalid profile');
  mkdirSync(options.out,{recursive:true});
  writeFileSync(join(options.out,'selection.json'),JSON.stringify(selection,null,2)+'\n');
  console.log(`PARTIAL SUITE: ${selection.included.length} selected files; ${selection.excluded.length} excluded files (see selection.json)`);
  if(options.profile==='list')return;
  const profiles=options.profile==='ordinary'?plan.slice(0,1):plan.slice(1);
  let failed=false;
  let exitUnconfirmed=false;
  for(const profile of profiles) {
    const startedAt=performance.now(),budget=profileBudgetMs(profile.name),log=join(options.out,`test-${profile.name}.txt`);
    writeFileSync(log,`profile=${profile.name}; file watchdog=60000ms (mixed/stall-40 speech.test.mjs: 120000ms); profile budget=${budget}ms\n`);
    const report=await runProfile(profile,{startedAt,blocked:exitUnconfirmed,output:data=>appendFileSync(log,data),onRow:(row,rows)=>{
      failed ||= row.classification!=='PASS';
      if(row.executed)exitUnconfirmed ||= row.exit_confirmed!==true?'process_exit_unconfirmed':row.stdio_closed!==true?'stdio_close_unconfirmed':false;
      console.log(`${profile.name}: ${row.classification} ${row.file}`);
      writeFileSync(join(options.out,`results-${profile.name}.json`),JSON.stringify({profile:profile.name,partial:true,selection,budget_ms:budget,rows},null,2)+'\n');
      if(row.classification!=='PASS')console.error(`::error::${profile.name}/${row.file}: ${row.classification}; diagnostic: ${log}`);
    }});
    writeFileSync(join(options.out,`results-${profile.name}.json`),JSON.stringify({...report,partial:true,selection},null,2)+'\n');
  }
  process.exitCode=failed?1:0;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(`OFFLINE_REFUSAL: ${error.message}`);process.exitCode=2;});
