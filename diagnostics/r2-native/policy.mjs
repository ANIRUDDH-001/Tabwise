// Diagnostic authority only. This module cannot enable a production policy or mint a native attestation.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {R2_FILES} from '../../scripts/tabwise/r2-policy.mjs';
import {QUALIFICATION_FILES} from '../../scripts/tabwise/qualification-policy.mjs';
import {parseUniqueJson} from '../../src/r2/strict-json.mjs';
export const BRANCH='refs/heads/diag/tabwise-r2-native';
export const WORKFLOW='.github/workflows/tabwise-r2-native-diagnostic.yml';
export const BASE='d75f04335dc0ba6c9e64fb92fcedc408c5867cfc';
export const CLASSIFICATION='NONQUALIFYING_NATIVE_R2_DIAGNOSTIC';
export const PLAN='fixtures/r2/plans/a5-validation-smoke.json';
export const PAGE='validation-healthy';
export const FIXTURE='fixtures/r2/plans/validation/healthy.html';
export const FIXTURE_SHA='f22a2f22be578e0609f990564acb703bab40bd8bf770079acc090775d79e9555';
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const SOURCE_FILES=Object.freeze([...new Set([...R2_FILES,...QUALIFICATION_FILES,PLAN,FIXTURE,'src/r2/product-export.mjs','package.json','package-lock.json',WORKFLOW,...['policy','run','verify','test','web-check'].map(n=>`diagnostics/r2-native/${n}.mjs`)])].sort());
export function sourceDigest(root){return sha(SOURCE_FILES.map(path=>`${path}\0${sha(readFileSync(join(root,path),'utf8').replace(/\r\n/g,'\n'))}\n`).join(''));}
export function packetFor({head,source_digest,run_id,actor}){return {
 schema:'tabwise-native-diagnostic-approval/1',classification:CLASSIFICATION,base:BASE,revision:head,source_digest,
 repository:'ANIRUDDH-001/Tabwise',workflow:WORKFLOW,ref:BRANCH,event:'push',actor,run_id,run_attempt:2,
 fixture:FIXTURE,fixture_sha256:FIXTURE_SHA,page:PAGE,actions:['Tab','Tab','Enter'],max_ms:180000,
 handleTimeoutMs:10000,focusWaitMs:5000,spec:{ackMs:1000,timeoutMs:5000,observationMs:1500,pollMs:50},
 output:'RUNNER_TEMP/tabwise-r2-native-diagnostic',production_qualified:false,
 decision:'APPROVE NONQUALIFYING native diagnostic only',
};}
export function checkDiagnosticApproval({env,head,source_digest,approval,platform,execArgv}){
 const errors=[];
 if(platform!=='win32'||env.GITHUB_ACTIONS!=='true'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.RUNNER_OS!=='Windows')errors.push('dedicated GitHub-hosted Windows required');
 if(execArgv.length||Object.keys(env).some(k=>/^(NODE_OPTIONS|R1T_)/i.test(k)&&env[k]))errors.push('runtime hooks forbidden');
 if(!/^[a-f0-9]{40}$/.test(head)||env.GITHUB_SHA!==head||!/^[a-f0-9]{64}$/.test(source_digest))errors.push('source identity');
 if(env.GITHUB_REPOSITORY!=='ANIRUDDH-001/Tabwise'||env.GITHUB_REF!==BRANCH||env.GITHUB_EVENT_NAME!=='push'||env.GITHUB_WORKFLOW_REF!==`ANIRUDDH-001/Tabwise/${WORKFLOW}@${BRANCH}`||env.GITHUB_RUN_ATTEMPT!=='2'||!env.RUNNER_TEMP)errors.push('diagnostic workflow identity');
 if(!/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID??'')||env.GITHUB_ACTOR!=='ANIRUDDH-001'||env.GITHUB_TRIGGERING_ACTOR&&env.GITHUB_TRIGGERING_ACTOR!=='ANIRUDDH-001')errors.push('owner/run identity');
 try {
  const value=typeof approval==='string'?parseUniqueJson(approval):approval;
  const expected=packetFor({head,source_digest,run_id:env.GITHUB_RUN_ID,actor:env.GITHUB_ACTOR});
  const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  if(stable(value)!==stable(expected))errors.push('explicit exact owner approval packet absent or mismatched');
 }catch{errors.push('malformed approval packet');}
 return errors;
}
export function assertProductionBlocked(root){
 for(const path of ['scripts/tabwise/r2-status.json','scripts/tabwise/qualification-status.json','scripts/tabwise/r2-product-policy.json','scripts/tabwise/r2-admission-policy.json','scripts/tabwise/r2-admission-server-policy.json']){
  const p=JSON.parse(readFileSync(join(root,path),'utf8'));if(p.enabled!==false||'verdict' in p&&p.verdict!=='BLOCK')throw Error('production policy unexpectedly enabled: '+path);
 }
 if(sha(readFileSync(join(root,FIXTURE),'utf8').replace(/\r\n/g,'\n'))!==FIXTURE_SHA)throw Error('fixture changed');
 const plan=JSON.parse(readFileSync(join(root,PLAN),'utf8')),page=plan.pages.find(p=>p.id===PAGE),expected=packetFor({});
 if(JSON.stringify(page?.task.map(t=>t.press))!==JSON.stringify(expected.actions)||JSON.stringify(plan.spec)!==JSON.stringify(expected.spec)||plan.handleTimeoutMs!==expected.handleTimeoutMs||plan.focusWaitMs!==expected.focusWaitMs||page.fixture_sha256!==FIXTURE_SHA)throw Error('diagnostic plan differs from fixed packet');
}

// Diagnostic-only error serialization; preserve nested causes without arbitrary error-owned data.
export function diagnosticErrorChain(error,env=process.env){
 const secrets=Object.entries(env).filter(([k,v])=>/TOKEN|SECRET|KEY|PASSWORD|AUTH|COOKIE|APPROVAL/i.test(k)&&typeof v==='string'&&v).map(([,v])=>v).sort((a,b)=>b.length-a.length);
 let nodes=0,truncated=false;
 const scrub=value=>{let text=String(value);if(text.length>1000000){truncated=true;return '[oversize field omitted]';}for(const secret of secrets)text=text.split(secret).join('[REDACTED]');return text.replace(/((?:authorization|cookie|set-cookie)\s*[:=])[^\r\n]+/gi,'$1[REDACTED]').replace(/(Bearer\s+)[^\s]+/gi,'$1[REDACTED]').replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi,'$1[REDACTED]@').replace(/((?:password|token|secret|api_key)=)[^&\s]+/gi,'$1[REDACTED]');};
 const read=(object,key)=>{try{return object?.[key];}catch{return '[unreadable property]';}};
 const seen=new Set();
 function visit(value,depth){
  if(depth>=32||nodes>=64){truncated=true;return {omitted:'diagnostic node bound'};}nodes++;
  if(value===null||typeof value!=='object'){const text=scrub(value);if(text.length>8192)truncated=true;return {message:text.slice(0,8192)};}
  if(seen.has(value))return {omitted:'cycle'};seen.add(value);
  const out={};for(const key of ['name','message','code','stack']){const v=read(value,key);if(['string','number'].includes(typeof v)){const text=scrub(v);if(text.length>8192)truncated=true;out[key]=text.slice(0,8192);}}
  const cause=read(value,'cause');if(cause!==undefined)out.cause=visit(cause,depth+1);
  const errors=read(value,'errors');if(Array.isArray(errors)){if(errors.length>16)truncated=true;out.errors=errors.slice(0,16).map(v=>visit(v,depth+1));}
  return out;
 }
 const chain=visit(error,0),result={schema:'tabwise-diagnostic-error/1',chain,truncated};
 if(Buffer.byteLength(JSON.stringify(result))>131072)return {schema:result.schema,chain:{omitted:'diagnostic byte bound'},truncated:true};
 return result;
}
