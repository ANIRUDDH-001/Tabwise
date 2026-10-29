import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,cpSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {createQualificationIntegrity} from '../scripts/tabwise/qualification-integrity.mjs';
import {qualificationDigest,QUALIFICATION_FILES} from '../scripts/tabwise/qualification-policy.mjs';
import {loadQualificationRuntime} from '../scripts/tabwise/qualification-loader.mjs';

test('B1 actual source closure and frozen guard validation timings on this host; no physical transport',async()=>{
 const root=resolve('cache/d67/fixture-'+process.pid);mkdirSync(root,{recursive:true});
 const git=(...args)=>execFileSync('git',['-c','core.autocrlf=false',...args],{cwd:root,encoding:'utf8'}).trim();
 const files=existsSync('../source-manifest.json')?JSON.parse(readFileSync('../source-manifest.json','utf8')).map(row=>row.path):execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
 for(const file of new Set([...files,...QUALIFICATION_FILES])){mkdirSync(dirname(resolve(root,file)),{recursive:true});cpSync(resolve(file),resolve(root,file));}
 cpSync('node_modules/@guidepup/guidepup',resolve(root,'node_modules/@guidepup/guidepup'),{recursive:true});
 git('init','-q');git('add','.');git('-c','user.name=Offline fixture','-c','user.email=offline@example.invalid','commit','-qm','offline fixture');
 mkdirSync(resolve(root,'cache/ignored'),{recursive:true});writeFileSync(resolve(root,'cache/ignored/setup.txt'),'ignored setup simulation');
 writeFileSync(resolve(root,'node_modules/setup-ignored.txt'),'ignored dependency simulation');assert.equal(git('status','--porcelain','--untracked-files=all'),'');
 const phase=createQualificationIntegrity({root,head:git('rev-parse','HEAD'),reviewedDigest:qualificationDigest(root)});
 const runtime=await loadQualificationRuntime({root,additionalIntegrity:phase.checkSend});
 const guard=runtime.guard,ack=async()=>({ack:null,reasons:[]});ack.before=async()=>[];guard.setAck(ack);guard.setCheck(async()=>[]);
 const timings=[],refusals=[];
 for(let i=0;i<50;i++){
  guard.arm('offline timing');const start=performance.now();const token=await guard.admit({path:'nvda',keys:[{vk:162}]});const committed=guard.commit(token);timings.push(performance.now()-start);if(!committed){refusals.push(guard.status());assert.equal(guard.status().kind,'pre');break;}await guard.release(token);guard.disarm();
 }
 assert.equal(phase.verifyPhase().ok,true);
 const ordered=[...timings].sort((a,b)=>a-b),result={platform:process.platform,node:process.version,scope:'actual source identity + frozen vendor/guard validation; fake foreground and acknowledgement; no NVDA or transport',samples:timings.length,file_count:phase.receipt.file_count,min_ms:ordered[0],median_ms:ordered[Math.floor(ordered.length/2)],p95_ms:ordered[Math.floor((ordered.length-1)*.95)],max_ms:ordered.at(-1),refusals,threshold_ms:100,live_timing_clearance:false};
 writeFileSync('cache/d67/timing.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 assert.ok(result.samples>0); // Scheduling can exceed 100 ms: the frozen gate must refuse, never relax it.
 const path=resolve(root,'packages/contracts/limits.mjs');writeFileSync(path,readFileSync(path,'utf8')+'\n// offline mutation regression\n');
 assert.ok(phase.checkSend().length>0);assert.equal(phase.verifyPhase().ok,false);
 if(!guard.isStopped()){guard.arm('changed source');await assert.rejects(()=>guard.admit({path:'nvda',keys:[{vk:162}]}),/identity|integrity/);}
});
