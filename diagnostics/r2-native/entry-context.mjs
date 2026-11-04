// Built-ins and source policies only: gates run before native imports or process launch.
import {execFileSync} from 'node:child_process';
import {mkdirSync,realpathSync,writeFileSync} from 'node:fs';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {boundaryPacket,checkBoundary,BOUNDARIES} from './boundary-policy.mjs';
import {assertProductionBlocked,sourceDigest,sha} from './policy.mjs';
import {checkFrozenIntegrity,checkR1Baseline} from '../../scripts/check-r1-baseline.mjs';
export const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export const preExecutionIntegrity=(root,mode,phase)=>mode==='startup'&&phase!=='--check-only'?checkFrozenIntegrity(root):checkR1Baseline(root);
export function boundaryFiles(name,result,authorization){
 if(!['probe.json','startup.json'].includes(name))throw Error('invalid diagnostic result name');
 const files={'authorization.json':JSON.stringify(authorization,null,2)+'\n',[name]:JSON.stringify(result,null,2)+'\n'};
 const index={};for(const [file,bytes] of Object.entries(files))index[file]={sha256:sha(bytes),bytes:Buffer.byteLength(bytes)};
 files['index.json']=JSON.stringify(index,null,2)+'\n';
 if(Object.values(files).reduce((sum,value)=>sum+Buffer.byteLength(value),0)>131072)throw Error('diagnostic artifact cap');
 return files;
}
export function entryContext(mode,argv=process.argv.slice(2)){
 const git=args=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8',windowsHide:true,timeout:10000}).trim();
 const revision=git(['rev-parse','HEAD']),clean=git(['status','--porcelain','--untracked-files=all'])==='';
 if(argv.length===2&&argv[0]==='--packet'){
  if(!clean)throw Error('packet requires reviewed committed clean source');
  return {packet:boundaryPacket({root:ROOT,revision,run:argv[1],mode})};
 }
 if(argv.length!==1||!['--check-only','--run','--worker'].includes(argv[0])||mode==='probe'&&argv[0]==='--worker')throw Error('invalid diagnostic mode');
 const env=process.env,errors=checkBoundary({root:ROOT,mode,revision,env,approval:env[BOUNDARIES[mode].variable],platform:process.platform,execArgv:process.execArgv,clean});
 if(errors.length)throw Error('BLOCK: '+errors.join('; '));
 assertProductionBlocked(ROOT);const frozen=preExecutionIntegrity(ROOT,mode,argv[0]);if(!frozen.ok)throw Error('frozen integrity refused');
 const temp=realpathSync(env.RUNNER_TEMP),rel=relative(ROOT,temp);if(!isAbsolute(rel)&&!rel.startsWith('..'))throw Error('output must be outside checkout');
 const output=join(temp,`tabwise-${mode}-${env.GITHUB_RUN_ID}-2`);
 const authorization=boundaryPacket({root:ROOT,revision,run:env.GITHUB_RUN_ID,mode});
 return {root:ROOT,revision,output,mode:argv[0],createOutput:()=>mkdirSync(output),savePath:name=>join(output,name),saveResult:(name,result)=>{
  if(sourceDigest(ROOT)!==authorization.source_digest)throw Error('source changed before diagnostic seal');
  const files=boundaryFiles(name,result,authorization);for(const [file,bytes] of Object.entries(files))writeFileSync(join(output,file),bytes,{flag:'wx'});
 }};
}
export function diagnosticEnv(env){
 const out=Object.create(null);for(const [k,v] of Object.entries(env))if(typeof v==='string'&&/^(SYSTEMROOT|WINDIR|PATH|PATHEXT|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROCESSOR_ARCHITECTURE|PROCESSOR_ARCHITEW6432)$/i.test(k))out[k]=v;
 return out;
}
