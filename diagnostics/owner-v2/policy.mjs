import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {SOURCE_FILES,sha,assertProductionBlocked} from '../r2-native/policy.mjs';
import {parseUniqueJson} from '../../src/r2/strict-json.mjs';
import {LIMITS,NETSTAT_ARGS} from './resolver.mjs';
export const REF='refs/heads/fix/F-03-g1-netstat-v2',WORKFLOW='.github/workflows/tabwise-owner-query-v2.yml',VARIABLE='TABWISE_OWNER_QUERY_V2_APPROVAL';
export function inventory(root){
 const files=[...new Set([...SOURCE_FILES,WORKFLOW,...readdirSync(join(root,'diagnostics/owner-v2')).filter(x=>/\.(mjs|ps1)$/.test(x)).map(x=>'diagnostics/owner-v2/'+x)])].sort();
 return files.map(path=>({path,sha256:sha(readFileSync(join(root,path),'utf8').replaceAll('\r\n','\n'))}));
}
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export function packet({root,revision,run}){
 if(!/^[a-f0-9]{40}$/.test(revision)||!/^[1-9][0-9]*$/.test(run??''))throw Error('exact source/run required');
 const files=inventory(root),commands={netstat:{executable:'SYSTEMROOT/System32/netstat.exe',args:NETSTAT_ARGS,shell:false},identity:{executable:'SYSTEMROOT/System32/WindowsPowerShell/v1.0/powershell.exe',args:['-NoProfile','-NonInteractive','-File','<ROOT>/diagnostics/owner-v2/identity.ps1','-ProcessId','<DISCOVERED_PID>'],shell:false}};
 return {schema:'tabwise-owner-v2-approval/1',repository:'ANIRUDDH-001/Tabwise',actor:'ANIRUDDH-001',ref:REF,workflow:WORKFLOW,revision,run_id:run,run_attempt:2,
 source_digest:sha(stable(files)),command_sha256:sha(stable(commands)),script_sha256:files.find(x=>x.path==='diagnostics/owner-v2/identity.ps1').sha256,
 limits:LIMITS,total_deadline_ms:10000,artifact_bytes:131072,actions:[],max_sends:0,native_qualified:false,physical_quiescence_verified:false,containment_required:true,decision:'APPROVE NONQUALIFYING OWNER V2 ONLY'};
}
export function authorize({root,revision,env,approval,clean,platform,execArgv=[]}){
 const errors=[];
 if(!clean||platform!=='win32'||execArgv.length||Object.entries(env).some(([k,v])=>v&&/^(NODE_OPTIONS|NODE_PATH|R1T_.*)$/i.test(k)))errors.push('source/runtime boundary');
 try{
  const expected=packet({root,revision,run:env.GITHUB_RUN_ID});
  const bindings={GITHUB_REPOSITORY:expected.repository,GITHUB_ACTOR:expected.actor,GITHUB_TRIGGERING_ACTOR:expected.actor,GITHUB_REF:REF,GITHUB_WORKFLOW_REF:expected.repository+'/'+WORKFLOW+'@'+REF,GITHUB_SHA:revision,GITHUB_WORKFLOW_SHA:revision,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'2',GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows'};
  for(const [k,v] of Object.entries(bindings))if(env[k]!==v)errors.push('identity '+k);
  if(typeof approval!=='string'||Buffer.byteLength(approval)>32768||stable(parseUniqueJson(approval))!==stable(expected))errors.push('fresh exact approval required');
  assertProductionBlocked(root);
 }catch{errors.push('invalid source/approval');}
 return errors;
}
