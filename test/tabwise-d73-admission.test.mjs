import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,existsSync,readdirSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {checkQualificationApproval,qualificationDigest,QUALIFICATION_FILES} from '../scripts/tabwise/qualification-policy.mjs';
import {variableAbsent,variableReadBack,observe,remotePreflight,dispatchRunId,VARIABLE} from '../scripts/tabwise/observer-dispatch.mjs';

const head='b'.repeat(40),owner='test-owner';
const status=Object.freeze({enabled:true,verdict:'PASS',reviewer:'independent-test-reviewer',review_ref:'synthetic-offline-review',owner_approval_ref:'D-73',actor:owner,reviewed_files:[...QUALIFICATION_FILES],reviewed_sha256:qualificationDigest()});
const env=Object.freeze({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows',GITHUB_SHA:head,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'ANIRUDDH-001/Tabwise',GITHUB_REF:'refs/heads/main',GITHUB_WORKFLOW_REF:'ANIRUDDH-001/Tabwise/.github/workflows/tabwise-observer.yml@refs/heads/main',GITHUB_ACTOR:owner,GITHUB_RUN_ID:'7',GITHUB_RUN_ATTEMPT:'1',RUNNER_TEMP:'synthetic-d73-fixture',TABWISE_QUALIFICATION_ENABLED:'true',TABWISE_OBSERVER_OWNER_APPROVAL:'D-73',TABWISE_OBSERVER_APPROVED_REVISION:head});
const approve=(change={},statusChange={})=>checkQualificationApproval({env:{...env,...change},head,status:{...status,...statusChange},platform:'win32'});
const run=(id,change={})=>({id,head_sha:head,head_branch:'main',event:'workflow_dispatch',run_attempt:1,status:'queued',conclusion:null,actor:{login:owner},triggering_actor:{login:owner},...change});
const ok=body=>({code:0,body:JSON.stringify(body)});
const runs=(...list)=>ok({total_count:list.length,workflow_runs:list});
const jobs=(...list)=>ok({total_count:list.length,jobs:list});

test('D73 runner policy still admits only the exact owner-bound initial dispatch',()=>{
 assert.deepEqual(approve(),{ok:true,errors:[]});
 for(const [change,label] of [[{GITHUB_ACTOR:'someone-else'},'unauthorized dispatcher'],[{GITHUB_EVENT_NAME:'push'},'event'],[{TABWISE_OBSERVER_APPROVED_REVISION:'c'.repeat(40)},'approved SHA'],[{GITHUB_SHA:'c'.repeat(40)},'checkout SHA'],[{TABWISE_OBSERVER_APPROVED_REVISION:''},'missing authorization'],[{TABWISE_QUALIFICATION_ENABLED:'false'},'opt-in'],[{TABWISE_OBSERVER_OWNER_APPROVAL:'D-72'},'retired D72'],[{GITHUB_RUN_ATTEMPT:'2'},'rerun']])assert.equal(approve(change).ok,false,label);
 assert.equal(approve({},{reviewed_sha256:'0'.repeat(64)}).ok,false,'changed digest');
});

test('workflow reads the approval variable only in the job condition and job env',()=>{
 const workflow=readFileSync('.github/workflows/tabwise-observer.yml','utf8').replace(/\r\n/g,'\n');
 assert.deepEqual([...workflow.matchAll(/vars\.[A-Z_]+/g)].map(match=>match[0]),[`vars.${VARIABLE}`,`vars.${VARIABLE}`]);
 assert.match(workflow,/\n    if: inputs\.enable_qualification && github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main' && vars\.TABWISE_OBSERVER_APPROVED_REVISION == github\.sha && github\.run_attempt == 1\n/);
 assert.ok(workflow.lastIndexOf('vars.')<workflow.indexOf('    steps:'));
});

test('absence requires an authenticated complete listing; error text is never absence',()=>{
 assert.equal(variableAbsent(ok({total_count:1,variables:[{name:'OTHER'}]})),true);
 assert.equal(variableAbsent(ok({total_count:1,variables:[{name:VARIABLE.toLowerCase()}]})),false,'present (case-insensitive)');
 assert.equal(variableAbsent(ok({total_count:31,variables:[]})),false,'incomplete page');
 for(const [code,body] of [[1,'executable Not Found'],[1,'gh: Not Found (HTTP 404)'],[1,'HTTP 403'],[-1,''],[0,'not json']])assert.equal(variableAbsent({code,body}),false,body);
 assert.equal(variableReadBack({...ok({name:VARIABLE,value:head}),value:head}),true);
 assert.equal(variableReadBack({...ok({name:VARIABLE,value:'c'.repeat(40)}),value:head}),false);
});

test('remote preflight refuses pending observer runs and unbound revisions before any write',()=>{
 const base={revision:head,actor:owner,lsRemote:{code:0,out:`${head}\trefs/heads/main\n`},commit:ok({sha:head}),user:ok({login:owner}),variables:ok({total_count:0,variables:[]}),runs:runs(run(1,{status:'completed'}))};
 assert.deepEqual(remotePreflight(base),{ok:true,errors:[],known:['1']});
 assert.equal(remotePreflight({...base,runs:runs(run(1,{status:'completed'}),run(2,{head_branch:'other'}))}).ok,false,'pending run on any branch');
 assert.equal(remotePreflight({...base,lsRemote:{code:0,out:`${'c'.repeat(40)}\trefs/heads/main`}}).ok,false);
 assert.equal(remotePreflight({...base,user:ok({login:'other'})}).ok,false);
 assert.equal(remotePreflight({...base,variables:ok({total_count:1,variables:[{name:VARIABLE}]})}).ok,false);
});

test('observation binds exactly one new owner run and classifies every other new run',()=>{
 const o=change=>observe({known:['1'],revision:head,actor:owner,runId:null,dispatchRunId:null,jobs:null,...change});
 assert.equal(o({runs:runs(run(1,{status:'completed'}),run(5))}).run_id,'5');
 assert.equal(o({runs:runs(run(5),run(6))}).ambiguous,true);
 assert.equal(o({runs:runs(run(5)),dispatchRunId:'9'}).ambiguous,true,'dispatch output names another run');
 assert.deepEqual(o({runs:runs(run(5),run(6,{head_branch:'other',head_sha:'c'.repeat(40)})),runId:'5'}).extras,[{id:'6',qualifying:false,terminal:false}]);
 assert.equal(o({runs:runs(run(5,{triggering_actor:{login:'other'}}))}).run_id,null,'other actor is not ours');
 assert.equal(o({runs:runs(run(5,{run_attempt:2})),runId:'5',jobs:jobs({name:'qualify',status:'in_progress'})}).admission,'invalid');
 assert.equal(o({runs:runs(run(5)),runId:'5',jobs:jobs({name:'qualify',status:'queued'})}).admission,'wait');
 assert.equal(o({runs:runs(run(5,{status:'in_progress'})),runId:'5',jobs:jobs({name:'qualify',status:'in_progress',started_at:'t'})}).admission,'admitted');
 assert.equal(o({runs:runs(run(5,{status:'completed',conclusion:'skipped'})),runId:'5',jobs:jobs({name:'qualify',status:'completed',conclusion:'skipped',started_at:null})}).admission,'not-admitted','D72 shape');
 assert.equal(o({runs:runs(run(5)),runId:'5',jobs:jobs({name:'qualify'},{name:'other'})}).admission,'invalid');
 assert.equal(dispatchRunId('https://github.com/o/r/actions/runs/123'),'123');assert.equal(dispatchRunId(''),null);
});

// ---- Orchestration: the real PowerShell script against local mocked gh/git/node commands. ----
const REPO=process.cwd(),SCRIPT=resolve('scripts/tabwise/d73-observer-dispatch.ps1'),REV='d'.repeat(40),OWNER='ANIRUDDH-001';
const FAKE_GH=String.raw`import {readFileSync,writeFileSync,appendFileSync,existsSync,rmSync,renameSync} from 'node:fs';
import {join} from 'node:path';
const sim=process.env.TW_SIM,scenario=process.env.TW_SCENARIO,REV=process.env.TW_REV,OWNER=process.env.TW_OWNER,args=process.argv.slice(2);
const statePath=join(sim,'state.json'),s=JSON.parse(readFileSync(statePath,'utf8'));
const run=(id,c={})=>({id,head_sha:REV,head_branch:'main',event:'workflow_dispatch',run_attempt:1,status:'queued',conclusion:null,actor:{login:OWNER},triggering_actor:{login:OWNER},...c});
const find=id=>s.runs.find(r=>String(r.id)===String(id));
let out='',err='',code=0,served=null;const fail=(text,c=1)=>{err=text;code=c;};
const sleep=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);
const path=args.find(a=>a.startsWith('repos/'))??'',method=args.includes('-X')?args[args.indexOf('-X')+1]:'GET';
const PHASES={pass:['queued','running','success'],'run-failure':['queued','running','failure'],'completion-timeout':['queued','running'],'hang-before-admission':['queued'],skip:['skipped']};
function step(){
 s.k++;const list=PHASES[scenario]??PHASES.pass,phase=list[Math.min(s.k,list.length)-1],r=find(200);
 if(r.status==='completed')return;
 if(scenario==='duplicate-after-admission'&&s.k===2)s.runs.unshift(run(202));
 if(scenario==='rerun'&&s.k===2)r.run_attempt=2;
 if(phase==='running'){r.status='in_progress';s.job={name:'qualify',status:'in_progress',conclusion:null,started_at:'2026-10-29T06:01:00Z'};}
 else if(phase==='success'||phase==='failure'){r.status='completed';r.conclusion=phase;s.job={name:'qualify',status:'completed',conclusion:phase,started_at:'2026-10-29T06:01:00Z'};}
 else if(phase==='skipped'){r.status='completed';r.conclusion='skipped';s.job={name:'qualify',status:'completed',conclusion:'skipped',started_at:null};}
 else s.job={name:'qualify',status:'queued',conclusion:null,started_at:null};
}
if(args[0]==='api'&&args[1]==='user')out=JSON.stringify({login:OWNER});
else if(path.endsWith('/commits/main'))out=JSON.stringify({sha:REV});
else if(path.endsWith('/actions/variables')&&method==='GET'){
 if(scenario==='not-found-text'&&s.dispatched)fail('executable Not Found');
 else{const vars=s.variable?[{name:'${VARIABLE}',value:s.variable}]:[];out=JSON.stringify({total_count:vars.length,variables:vars});}
}else if(path.endsWith('/actions/variables')&&method==='POST'){if(s.variable)fail('HTTP 409');else s.variable=args[args.indexOf('-f')+1].split('=')[1]&&args[args.lastIndexOf('-f')+1].split('=')[1];}
else if(path.endsWith('/actions/variables/${VARIABLE}')&&method==='GET'){if(s.variable)out=JSON.stringify({name:'${VARIABLE}',value:s.variable});else fail('gh: Not Found (HTTP 404)');}
else if(path.endsWith('/actions/variables/${VARIABLE}')&&method==='DELETE'){s.deletes++;if(scenario==='log-fail'&&s.deletes===1)fail('HTTP 500');else s.variable=null;}
else if(path.endsWith('/runs')&&path.includes('/workflows/'))out=JSON.stringify({total_count:s.runs.length,workflow_runs:s.runs});
else if(/\/actions\/runs\/\d+\/jobs$/.test(path)){if(scenario==='gh-hangs')sleep(60000);step();served=s.job.status;out=JSON.stringify({total_count:1,jobs:[s.job]});}
else if(/\/actions\/runs\/\d+\/cancel$/.test(path)){const r=find(path.split('/')[5]);s.cancels.push(String(r.id));if(r.status!=='completed'){r.status='completed';r.conclusion='cancelled';}}
else if(/\/actions\/runs\/\d+$/.test(path))out=JSON.stringify(find(path.split('/').pop()));
else if(args[0]==='workflow'&&args[1]==='run'){
 s.dispatched++;s.variable_at_dispatch=s.variable;s.runs.unshift(run(200));
 if(scenario==='ambiguous')s.runs.unshift(run(201));
 if(scenario==='other-branch')s.runs.unshift(run(203,{head_branch:'feature',head_sha:'e'.repeat(40)}));
 if(scenario==='log-fail'){const ev=process.env.TW_EVIDENCE;renameSync(ev,ev+'-moved');writeFileSync(ev,'evidence path replaced by a file');}
 if(scenario==='dispatch-timeout'){writeFileSync(statePath,JSON.stringify(s));sleep(60000);}
}else if(args[0]==='run'&&args[1]==='download'){
 if(scenario==='missing-evidence')fail('no artifact matches');
 else{const {createQualificationWriter}=await import(process.env.TW_EVIDENCE_MODULE),w=createQualificationWriter(args[args.indexOf('--dir')+1],{fake:true});
  w.finish({candidate_pass:scenario!=='candidate-fail',reasons:[]});
  if(scenario==='bad-artifact')writeFileSync(join(args[args.indexOf('--dir')+1],'result.json'),'{"candidate_pass":true}');}
}else fail('unexpected gh call: '+args.join(' '));
appendFileSync(join(sim,'calls.jsonl'),JSON.stringify({t:Date.now(),args,code,variable:s.variable,served})+'\n');
writeFileSync(statePath,JSON.stringify(s));process.stdout.write(out);process.stderr.write(err);process.exitCode=code;
`;
const FAKE_NODE=String.raw`import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
const [decider,command]=process.argv.slice(2),sim=process.env.TW_SIM;
if(command==='preflight'){process.stdout.write(JSON.stringify({ok:true,errors:[],actor:process.env.TW_OWNER}));process.exit(0);}
const raw=readFileSync(0,'utf8'),kind=JSON.parse(Buffer.from(raw.trim(),'base64').toString('utf8')).kind;
if(process.env.TW_SCENARIO==='script-error'&&kind==='observe'){
 const p=join(sim,'observe-count'),n=(existsSync(p)?Number(readFileSync(p,'utf8')):0)+1;writeFileSync(p,String(n));
 if(n===3){process.stdout.write('{"ok":true,"value":{"ok":true}}');process.exit(0);}
}
const r=spawnSync(process.env.TW_REAL_NODE,[decider,command],{input:raw,encoding:'utf8'});process.stdout.write(r.stdout);process.exit(r.status??1);
`;
const scenarios={
 pass:{exit:0,outcome:'PASS'},
 'preflight-only':{exit:0,outcome:'PREFLIGHT-OK',flags:['-PreflightOnly']},
 'confirm-mismatch':{exit:1,outcome:'FAILED',confirm:'AUTHORIZE AND DISPATCH ONCE D-73'},
 'pending-before':{exit:1,outcome:'FAILED'},
 'hang-before-admission':{exit:1,outcome:'FAILED',cancels:['200']},
 'gh-hangs':{exit:1,outcome:'FAILED',cancels:['200']},
 'dispatch-timeout':{exit:1,outcome:'FAILED',cancels:['200']},
 'log-fail':{exit:1,outcome:null},
 'script-error':{exit:1,outcome:'FAILED',cancels:['200']},
 ambiguous:{exit:3,outcome:'UNRESOLVED',cancels:['200','201']},
 'duplicate-after-admission':{exit:3,outcome:'UNRESOLVED',cancels:['200','202']},
 'other-branch':{exit:3,outcome:'UNRESOLVED',cancels:['200']},
 rerun:{exit:3,outcome:'UNRESOLVED',cancels:['200']},
 skip:{exit:1,outcome:'FAILED',cancels:[]},
 'run-failure':{exit:1,outcome:'FAILED',cancels:[]},
 'completion-timeout':{exit:1,outcome:'FAILED',cancels:['200'],completion:6},
 'missing-evidence':{exit:1,outcome:'FAILED',cancels:[]},
 'bad-artifact':{exit:1,outcome:'FAILED',cancels:[]},
 'candidate-fail':{exit:1,outcome:'FAILED',cancels:[]},
 'not-found-text':{exit:3,outcome:'UNRESOLVED',cancels:['200']},
};
const LIMITS={ExposureSeconds:8,RevokeSeconds:3,CommandSeconds:2,PollSeconds:1};
const EXPOSURE_BOUND_MS=(LIMITS.ExposureSeconds+LIMITS.PollSeconds+LIMITS.RevokeSeconds+5*LIMITS.CommandSeconds)*1000;

function setup(name){
 const sim=mkdtempSync(join(tmpdir(),`tw-d73-${name}-`)),bin=join(sim,'bin'),evidence=join(sim,'evidence');mkdirSync(bin);mkdirSync(join(sim,'ghconfig'));
 writeFileSync(join(bin,'fake-gh.mjs'),FAKE_GH);writeFileSync(join(bin,'fake-node.mjs'),FAKE_NODE);
 writeFileSync(join(bin,'gh.cmd'),'@"%TW_REAL_NODE%" "%~dp0fake-gh.mjs" %*\r\n');
 writeFileSync(join(bin,'node.cmd'),'@"%TW_REAL_NODE%" "%~dp0fake-node.mjs" %*\r\n');
 writeFileSync(join(bin,'git.cmd'),`@echo ${REV}\trefs/heads/main\r\n`);
 const runs=[{id:100,head_sha:'a'.repeat(40),head_branch:'main',event:'workflow_dispatch',run_attempt:1,status:'completed',conclusion:'skipped',actor:{login:OWNER},triggering_actor:{login:OWNER}}];
 if(name==='pending-before')runs.unshift({...runs[0],id:101,status:'queued',conclusion:null,head_branch:'other'});
 writeFileSync(join(sim,'state.json'),JSON.stringify({variable:null,runs,k:0,deletes:0,dispatched:0,cancels:[]}));
 // Defence in depth: if the fake were ever bypassed, the real gh has no credentials and no reachable host.
 const inherited=Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toUpperCase()!=='PATH'));
 const childEnv={...inherited,PATH:`${bin};${process.env.PATH}`,TW_SIM:sim,TW_SCENARIO:name,TW_REV:REV,TW_OWNER:OWNER,TW_REAL_NODE:process.execPath,TW_EVIDENCE:evidence,
  TW_EVIDENCE_MODULE:pathToFileURL(resolve('scripts/tabwise/qualification-evidence.mjs')).href,GH_HOST:'offline.invalid',GH_TOKEN:'offline-invalid',GH_CONFIG_DIR:join(sim,'ghconfig'),GITHUB_TOKEN:''};
 return {sim,bin,evidence,childEnv};
}
function runScript(name,spec){
 const {sim,bin,evidence,childEnv}=setup(name),limits={...LIMITS,CompletionSeconds:spec.completion??60};
 // Not -NonInteractive: the owner confirmation is a real Read-Host, answered on redirected stdin.
 const args=['-NoProfile','-ExecutionPolicy','Bypass','-File',SCRIPT,'-Revision',REV,'-OwnerRef','D-73','-EvidenceDirectory',evidence,...(spec.flags??[]),...Object.entries(limits).flatMap(([k,v])=>[`-${k}`,String(v)])];
 return new Promise((done,reject)=>{
  const child=spawn('powershell.exe',args,{env:childEnv,cwd:sim});let stdout='';
  child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stdout+=d);child.on('error',reject);
  child.stdin.end((spec.confirm??`AUTHORIZE AND DISPATCH ONCE D-73 ${REV}`)+'\r\n');
  child.on('close',code=>{
   const calls=existsSync(join(sim,'calls.jsonl'))?readFileSync(join(sim,'calls.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[];
   done({code,stdout,sim,bin,evidence,calls,state:JSON.parse(readFileSync(join(sim,'state.json'),'utf8'))});
  });
 });
}
const isCall=(call,method,suffix)=>call.args[0]==='api'&&(call.args.includes('-X')?call.args[call.args.indexOf('-X')+1]:'GET')===method&&call.args.some(a=>a.startsWith('repos/')&&a.endsWith(suffix));
const endEvent=evidence=>{try{return readFileSync(join(evidence,'events.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line)).find(event=>event.phase==='end');}catch{return null;}};

test('owner orchestration: normal path and every reported failure path against mocked commands',{skip:process.platform!=='win32'&&'Windows PowerShell 5.1 only',timeout:240000,concurrency:5},async t=>{
 const parse=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$e=$null;$t=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${SCRIPT}',[ref]$t,[ref]$e);if($e.Count){$e|ForEach-Object{$_.Message};exit 1}`],{encoding:'utf8'});
 assert.equal(parse.status,0,parse.stdout+parse.stderr);
 const script=readFileSync(SCRIPT,'utf8');
 assert.equal([...script.matchAll(/'workflow','run'/g)].length,1,'exactly one dispatch call site');assert.doesNotMatch(script,/rerun/i);
 assert.ok(script.indexOf('Read-Host')<script.indexOf("'variable-create'"),'confirmation precedes the variable write');
 const probe=setup('probe'),where=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"'gh','git','node'|ForEach-Object{(Get-Command $_ -CommandType Application|Select-Object -First 1).Source}"],{env:probe.childEnv,encoding:'utf8'});
 for(const line of where.stdout.trim().split(/\r?\n/))assert.ok(line.toLowerCase().startsWith(probe.bin.toLowerCase()),`mock resolution: ${line}`);
 rmSync(probe.sim,{recursive:true,force:true});
 await Promise.all(Object.entries(scenarios).map(([name,spec])=>t.test(name,{timeout:120000},async()=>{
  const r=await runScript(name,spec),fail=`${name} exit ${r.code}\n${r.stdout}`;
  try{
   assert.equal(r.code,spec.exit,fail);
   const writes=r.calls.filter(call=>isCall(call,'POST','/actions/variables')||(call.args[0]==='workflow'));
   assert.ok(r.calls.filter(call=>call.args[0]==='workflow').length<=1,'at most one dispatch');
   assert.equal(r.state.variable,null,'variable absent at exit');
   if(['preflight-only','confirm-mismatch','pending-before'].includes(name)){assert.equal(writes.length,0,'no GitHub write');return;}
   const created=r.calls.find(call=>isCall(call,'POST','/actions/variables')),confirmed=r.calls.find(call=>call.t>created.t&&call.variable===null&&isCall(call,'GET','/actions/variables'));
   assert.ok(confirmed&&confirmed.t-created.t<=EXPOSURE_BOUND_MS,`exposure ${confirmed&&confirmed.t-created.t} ms within ${EXPOSURE_BOUND_MS} ms`);
   assert.equal(r.state.variable_at_dispatch,REV,'variable existed at dispatch');
   if(spec.cancels)assert.deepEqual([...new Set(r.state.cancels)].sort(),spec.cancels,'cancellation scope');
   if(name==='pass'){
    const firstDelete=r.calls.findIndex(call=>isCall(call,'DELETE',`/actions/variables/${VARIABLE}`)),started=r.calls.findIndex(call=>call.served==='in_progress');
    assert.ok(started>=0&&firstDelete>started,'revocation only after the qualify job was observed started');
    const files=readdirSync(r.evidence);assert.ok(files.filter(file=>file.startsWith('obs-')).length>10,'each observation preserved');
    const hashes=JSON.parse(readFileSync(join(r.evidence,'hashes.json'),'utf8'));
    for(const {path,sha256} of hashes)assert.equal(createHash('sha256').update(readFileSync(join(r.evidence,path))).digest('hex'),sha256,path);
    assert.ok(hashes.some(row=>row.path==='events.jsonl'));assert.ok(hashes.some(row=>row.path.startsWith('artifact')));
   }
   if(name==='log-fail'){assert.ok(r.state.deletes>=2,'revocation retried after a failed delete with storage unavailable');assert.match(r.stdout,/OUTCOME FAILED/);}
   if(name==='other-branch')assert.ok(!r.state.cancels.includes('203'),'foreign-branch run is not cancelled');
   if(name==='not-found-text')assert.match(r.stdout,/MANUAL ACTION/);
   if(spec.outcome&&name!=='log-fail')assert.equal(endEvent(r.evidence)?.outcome,spec.outcome);
  }finally{rmSync(r.sim,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
 })));
});

test('D74 artifact evidence accepts one run-attempt subdirectory but rejects ambiguous contents',async()=>{
 const {artifactEvidence}=await import('../scripts/tabwise/observer-dispatch.mjs');
 const {createQualificationWriter}=await import('../scripts/tabwise/qualification-evidence.mjs');
 const root=mkdtempSync(join(tmpdir(),'tw-d74-artifact-'));
 try{
  const nested=join(root,'40884258062-1');
  createQualificationWriter(nested,{test:true}).finish({candidate_pass:true,full_worker_ready:false,reasons:[]});
  assert.deepEqual(await artifactEvidence({dir:nested}),{ok:true,errors:[],candidate_pass:true});
  assert.deepEqual(await artifactEvidence({dir:root}),{ok:true,errors:[],candidate_pass:true});
  mkdirSync(join(root,'unexpected'));
  assert.equal((await artifactEvidence({dir:root})).ok,false);
  rmSync(join(root,'unexpected'),{recursive:true,force:true});
  writeFileSync(join(nested,'result.json'),'{"candidate_pass":true}');
  assert.equal((await artifactEvidence({dir:root})).ok,false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
