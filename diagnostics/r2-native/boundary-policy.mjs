// Authority for two distinct, nonqualifying diagnostics. No execution capabilities.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {sha,sourceDigest} from './policy.mjs';
import {parseUniqueJson} from '../../src/r2/strict-json.mjs';
export const BOUNDARIES=Object.freeze({
 probe:Object.freeze({workflow:'.github/workflows/tabwise-owner-query-probe.yml',entry:'diagnostics/r2-native/probe-entry.mjs',script:'diagnostics/r2-native/owner-query-probe.ps1',variable:'TABWISE_OWNER_QUERY_PROBE_APPROVAL',timeout_ms:27000,cleanup_ms:1000,stdout_bytes:8192,stderr_bytes:1048576}),
 startup:Object.freeze({workflow:'.github/workflows/tabwise-startup-only.yml',entry:'diagnostics/r2-native/startup-entry.mjs',script:'diagnostics/r2-native/startup-core.mjs',variable:'TABWISE_STARTUP_ONLY_APPROVAL',timeout_ms:27000,worker_ms:90000,cleanup_ms:5000,stdout_bytes:8192,stderr_bytes:8192,setup:['npm ci --ignore-scripts','npx --no-install guidepup setup --ci','npx --no-install guidepup install nvda']}),
});
export function boundaryPacket({root,revision,run,mode}){
 const policy=BOUNDARIES[mode];if(!policy||!/[a-f0-9]{40}/.test(revision)||revision.length!==40||!/^[1-9][0-9]*$/.test(run??''))throw Error('exact revision/run/mode required');
 const argv=mode==='probe'?['powershell.exe','-NoProfile','-NonInteractive','-File','<ROOT>/'+policy.script]:['<NODE>','<ROOT>/'+policy.entry,'--worker'];
 return {schema:'tabwise-boundary-approval/1',mode,repository:'ANIRUDDH-001/Tabwise',actor:'ANIRUDDH-001',ref:'refs/heads/fix/F-03-owner-query-trace',workflow:policy.workflow,event:'workflow_dispatch',revision,source_digest:sourceDigest(root),run_id:run,run_attempt:2,
  script_sha256:sha(readFileSync(join(root,policy.script),'utf8').replace(/\r\n/g,'\n')),command_sha256:sha(JSON.stringify({argv,shell:false,stdio:mode==='startup'?['ignore','pipe','pipe','ipc']:['ignore','pipe','pipe'],windowsHide:true})),limits:policy,
  output:`RUNNER_TEMP/tabwise-${mode}-${run}-2`,artifact_bytes:131072,actions:[],max_sends:0,production_qualified:false,native_interaction_pass:false,decision:`APPROVE NONQUALIFYING ${mode} ONLY`};
}
export function checkBoundary({root,mode,revision,env,approval,platform,execArgv,clean}){
 const errors=[];const fail=x=>errors.push(x);
 if(!BOUNDARIES[mode])return ['unknown boundary'];
 if(platform!=='win32'||env.GITHUB_ACTIONS!=='true'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.RUNNER_OS!=='Windows'||!/^[A-Za-z]:[\\/]/.test(env.RUNNER_TEMP??''))fail('isolated hosted Windows required');
 if(!clean||execArgv.length||Object.entries(env).some(([k,v])=>v&&/^(NODE_OPTIONS|NODE_PATH|R1T_.*)$/i.test(k)))fail('dirty checkout or runtime injection');
 try{
  const expected=boundaryPacket({root,revision,run:env.GITHUB_RUN_ID,mode});
  for(const [name,value] of Object.entries({GITHUB_SHA:revision,GITHUB_WORKFLOW_SHA:revision,GITHUB_REPOSITORY:expected.repository,GITHUB_REF:expected.ref,GITHUB_WORKFLOW_REF:`${expected.repository}/${expected.workflow}@${expected.ref}`,GITHUB_EVENT_NAME:expected.event,GITHUB_RUN_ATTEMPT:'2',GITHUB_ACTOR:expected.actor,GITHUB_TRIGGERING_ACTOR:expected.actor}))if(env[name]!==value)fail('execution identity: '+name);
  if(typeof approval==='string'&&Buffer.byteLength(approval)>32768)throw Error();
  const value=typeof approval==='string'?parseUniqueJson(approval):approval;
  const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  if(stable(value)!==stable(expected))fail('exact separate approval absent or mismatched');
 }catch{fail('invalid approval or source identity');}
 return errors;
}
