// CI-H1: explicit coverage accounting, one directly owned Node process per file.
// No --test parent process (and thus no hidden test-runner grandchildren).
import {readFileSync, readdirSync, mkdirSync, writeFileSync, appendFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';

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

// Hosted run 40927125615: mixed/speech.test.mjs passed 79/122 tests before the
// 60 s file watchdog. Allow only that combination 120 s; the 180 s profile cap,
// per-test timeout, and all frozen physical-input deadlines remain unchanged.
export function fileWatchdogMs(profileName,file,remainingMs) {
  if(!Number.isFinite(remainingMs)||remainingMs<=0)throw Error('invalid profile remainder');
  const fileCap=profileName==='mixed'&&file==='speech.test.mjs'?120000:60000;
  return Math.min(fileCap,remainingMs);
}

export function runFile(args,{timeoutMs=60000,env={},output=()=>{},expectTests=false}={}) {
  if(!Number.isInteger(timeoutMs)||timeoutMs<1)throw Error('invalid process timeout');
  return new Promise(resolveResult=>{
    const childEnv={...process.env,...env};delete childEnv.NODE_TEST_CONTEXT;
    const child=spawn(process.execPath,args,{cwd:root,env:childEnv,stdio:['ignore','pipe','pipe'],windowsHide:true});
    let timedOut=false,error,stdoutTail='';
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeoutMs);
    child.stdout.on('data',data=>{if(expectTests)stdoutTail=(stdoutTail+data.toString('utf8')).slice(-8192);output(data);});
    child.stderr.on('data',output);
    child.on('error',e=>{error=e.message;});
    child.on('close',(code,signal)=>{
      clearTimeout(timer);
      const totals=expectTests?tapTotals(stdoutTail):null;
      const complete=!expectTests||(totals&&totals.tests>0&&totals.pass===totals.tests&&
        totals.fail===0&&totals.cancelled===0&&totals.skipped===0&&totals.todo===0);
      resolveResult({classification:timedOut?'TIMEOUT':code===0&&!error&&complete?'PASS':'FAIL',code,signal,
        ...(expectTests?{test_totals:totals}:{}),...(error?{error}:{})});
    });
  });
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
  for(const profile of profiles) {
    const rows=[],started=Date.now(),log=join(options.out,`test-${profile.name}.txt`);
    writeFileSync(log,`profile=${profile.name}; file watchdog=60000ms (mixed/speech.test.mjs: 120000ms); profile budget=180000ms\n`);
    for(const file of profile.files) {
      const remaining=180000-(Date.now()-started);
      if(remaining<=0){rows.push({file,classification:'PROFILE_TIMEOUT'});failed=true;break;}
      const flags=profile.env?['--import',new URL('../test/helpers/faults.mjs',import.meta.url).href]:[];
      const result=await runFile([...flags,'--test-reporter=tap','--test-timeout=10000',...(profile.flags??[]),`test/${file}`],
        {timeoutMs:fileWatchdogMs(profile.name,file,remaining),env:profile.env,expectTests:true,
          output:data=>appendFileSync(log,data)});
      rows.push({file,...result});failed ||= result.classification!=='PASS';
      console.log(`${profile.name}: ${result.classification} ${file}`);
      writeFileSync(join(options.out,`results-${profile.name}.json`),JSON.stringify({profile:profile.name,partial:true,selection,rows},null,2)+'\n');
      if(result.classification!=='PASS')console.error(`::error::${profile.name}/${file}: ${result.classification}; diagnostic: ${log}`);
    }
    writeFileSync(join(options.out,`results-${profile.name}.json`),JSON.stringify({profile:profile.name,partial:true,selection,rows},null,2)+'\n');
  }
  process.exitCode=failed?1:0;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(`OFFLINE_REFUSAL: ${error.message}`);process.exitCode=2;});
