// Delivery and persistence only; never grants W5 admission or independent native qualification.
import {readNativePlan} from './native-plan.mjs';
import {validateProductDelivery} from './product-delivery.mjs';
import {sha256,LIMITS} from '../../packages/contracts/index.mjs';
import {safePath} from '../../packages/contracts/r2-product.mjs';
import {mkdirSync,writeFileSync,readFileSync,lstatSync,readdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
export function verifyWindowsDelivery({delivery,github,sourceDigest,qualificationDigest,requestSha256,productRunId,read,planAdmission}){
 const d=validateProductDelivery(delivery),r=d.request,g=github;
 if(g?.workflow!==r.workflow||g.ref!=='refs/heads/main'||g.revision!==r.revision||g.actor!==r.actor||g.triggeringActor!==r.actor||g.attempt!==1||!/^[1-9][0-9]{0,19}$/.test(g.runId??''))throw Error('Windows workflow identity mismatch');
 if(sourceDigest!==r.r2_source_sha256||qualificationDigest!==r.qualification_sha256||requestSha256!==r.request_sha256||productRunId!==r.product_run_id)throw Error('Windows source/request inventory mismatch');
 const admitted=planAdmission?readNativePlan({...planAdmission,delivery:d,githubRunId:g.runId}):null;
 const disk=admitted?{plan:readFileSync(admitted.planPath),fixture:readFileSync(admitted.fixturePath)}:read(r),plan=Buffer.from(d.plan_text),fixture=Buffer.from(d.fixture_text);
 if(!(disk?.plan instanceof Uint8Array)||!(disk?.fixture instanceof Uint8Array)||!plan.equals(Buffer.from(disk.plan))||!fixture.equals(Buffer.from(disk.fixture)))throw Error('Windows committed plan/fixture mismatch');
 return {...d,...(admitted?{native_plan:admitted}:{}),github_run_id:g.runId,github_run_attempt:1,input_authorized:false,native_qualified:false};
}
export function persistExportPackage({outputDir,files,write=writeFileSync}){
 let total=0;const paths=new Set();
 if(!files||!Object.keys(files).length||Object.keys(files).length>98)throw Error('bounded package required');
 for(const [path,bytes] of Object.entries(files)){
  if(!safePath(path)||path.toLowerCase()==='complete.json'||path.split('/').some(x=>/[.]$/.test(x)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x))||paths.has(path.toLowerCase())||!(bytes instanceof Uint8Array)||(total+=bytes.length)>LIMITS.RUN_BYTES)throw Error('unsafe export package');
  paths.add(path.toLowerCase());
 }
 // Exclusive destination; an interrupted directory is forensic evidence and can never be resumed or overwritten.
 mkdirSync(outputDir);
 const inventory=[];
 for(const [path,bytes] of Object.entries(files).sort(([a],[b])=>a.localeCompare(b))){
  const full=join(outputDir,path);mkdirSync(dirname(full),{recursive:true});write(full,bytes,{flag:'wx'});
  const disk=readFileSync(full);if(!Buffer.from(bytes).equals(disk))throw Error('export readback mismatch');
  inventory.push({path,bytes:disk.length,sha256:sha256(disk)});
 }
 const marker=JSON.stringify({schema:'tabwise-product-package-complete/1',files:inventory,native_qualified:false});
 write(join(outputDir,'COMPLETE.json'),marker,{flag:'wx'});
 return {outputDir,package_sha256:sha256(marker),native_qualified:false};
}
export function inspectPersistedExport(dir){
 try{
  const marker=JSON.parse(readFileSync(join(dir,'COMPLETE.json')));if(marker.schema!=='tabwise-product-package-complete/1'||!Array.isArray(marker.files)||!marker.files.length||marker.files.length>98||marker.native_qualified!==false)throw Error('marker');
  let total=0;const seen=new Set();
  for(const f of marker.files){
   if(!safePath(f.path)||seen.has(f.path)||f.path==='COMPLETE.json')throw Error('path');seen.add(f.path);
   let current=dir;for(const part of f.path.split('/')){current=join(current,part);if(lstatSync(current).isSymbolicLink())throw Error('symlink');}
   const b=readFileSync(current);if((total+=b.length)>LIMITS.RUN_BYTES||b.length!==f.bytes||sha256(b)!==f.sha256)throw Error('drift');
  }
  const actual=[];let entries=0;const walk=(d,prefix='')=>{for(const name of readdirSync(d)){if(++entries>512)throw Error('entry cap');const full=join(d,name),p=prefix+name,s=lstatSync(full);if(s.isSymbolicLink())throw Error('symlink');if(s.isDirectory())walk(full,p+'/');else actual.push(p);}};walk(dir);
  if(actual.sort().join('\n')!==[...seen,'COMPLETE.json'].sort().join('\n'))throw Error('inventory mismatch');
  return {complete:true,files:marker.files,native_qualified:false};
 }catch{return {complete:false,native_qualified:false};}
}
