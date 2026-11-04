import {execFileSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,relative,isAbsolute} from 'node:path';
import {packet,authorize,VARIABLE} from './policy.mjs';
import {resolveOwner,runBounded,systemExecutable} from './resolver.mjs';
import {sha} from '../r2-native/policy.mjs';
import {checkR1Baseline} from '../../scripts/check-r1-baseline.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),e=process.env;
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000,windowsHide:true}).trim();
const revision=git(['rev-parse','HEAD']),clean=git(['status','--porcelain','--untracked-files=all'])==='';
const argv=process.argv.slice(2);
if(argv.length===2&&argv[0]==='--packet'){
 if(!clean||!checkR1Baseline(root).ok)throw Error('clean frozen source required');
 console.log(JSON.stringify({authorizing:false,review_only:true,future_attempt_2:packet({root,revision,run:argv[1]})},null,2));
}else{
 if(argv.length!==1||!['--check-only','--run'].includes(argv[0]))throw Error('mode refused');
 const failures=authorize({root,revision,env:e,approval:e[VARIABLE],clean,platform:process.platform,execArgv:process.execArgv});
 if(failures.length||!checkR1Baseline(root).ok)throw Error('BLOCK: '+failures.join('; '));
 if(argv[0]==='--run'){
  const temp=realpathSync(e.RUNNER_TEMP),rel=relative(root,temp);if(!isAbsolute(rel)&&!rel.startsWith('..'))throw Error('external output required');
  const out=join(temp,'tabwise-owner-v2-'+e.GITHUB_RUN_ID+'-2');mkdirSync(out);
  const binding=packet({root,revision,run:e.GITHUB_RUN_ID}),controller=new AbortController(),cancel=()=>controller.abort(),signals=['SIGINT','SIGTERM','SIGBREAK'];
  for(const name of signals)process.once(name,cancel);
  const deadline=performance.now()+binding.total_deadline_ms;
  let result;
  try{
   result=await resolveOwner({port:6837,deadline:Math.min(deadline,performance.now()+5000),signal:controller.signal});
   if(result.outcome==='unique'){
    const identity=await runBounded({file:systemExecutable('WindowsPowerShell/v1.0/powershell.exe'),args:['-NoProfile','-NonInteractive','-File',join(root,'diagnostics/owner-v2/identity.ps1'),'-ProcessId',String(result.pids[0])],deadline,signal:controller.signal,maxBytes:4096});
    result.identity_observation={...identity,stdout:undefined};if(identity.ok)try{result.identity_observation.value=JSON.parse(identity.stdout);}catch{result.identity_observation.ok=false;}
   }
  }finally{for(const name of signals)process.removeListener(name,cancel);}
  if(packet({root,revision,run:e.GITHUB_RUN_ID}).source_digest!==binding.source_digest)throw Error('source changed');
  const contents={'authorization.json':JSON.stringify(binding,null,2),'probe.json':JSON.stringify({...result,native_qualified:false,physical_quiescence_verified:false,containment_required:true},null,2)};
  const index={};for(const [name,text] of Object.entries(contents))index[name]={sha256:sha(text),bytes:Buffer.byteLength(text)};
  contents['index.json']=JSON.stringify(index,null,2);if(Object.values(contents).reduce((n,s)=>n+Buffer.byteLength(s),0)>binding.artifact_bytes)throw Error('artifact cap');
  for(const [name,text] of Object.entries(contents))writeFileSync(join(out,name),text,{flag:'wx'});
  // A completed no-listener measurement succeeds as a diagnostic, never native acceptance.
  process.exitCode=result.query_completed&&['absent','unique','ambiguous'].includes(result.outcome)?0:1;
 }
}
