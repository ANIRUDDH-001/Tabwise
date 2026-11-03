// Candidate source delivery only. Writes no approval/status file and launches nothing.
import {mkdirSync,writeFileSync,readFileSync,lstatSync,existsSync,readdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {sha256} from '../../packages/contracts/index.mjs';
import {prepareNativeProductRequest} from './product-dispatch.mjs';
import {reviewedR2Module} from './node-review.mjs';
import {same} from '../../packages/contracts/r2-product.mjs';
export function writeNativeRequestPackage({request,context,outputDir,recover=false}){
 const checked=prepareNativeProductRequest(context);
 if(!same(checked,request))throw Error('candidate request/source mismatch');
 const plan=reviewedR2Module('r2-run.mjs').parseR2Plan(context.planBytes);
 if(plan.pages.length!==1||plan.pages[0].id!==request.page_id||plan.repair)throw Error('one baseline candidate page required');
 const reserved=new Set(['plan.json','product-spec.json','candidate.json','.reservation.json']);
 if(reserved.has(plan.pages[0].fixture.split('/')[0]))throw Error('candidate file collision');
 const files={[plan.pages[0].fixture]:Buffer.from(context.fixture),'plan.json':Buffer.from(context.planBytes),'product-spec.json':Buffer.from(context.specBytes),'candidate.json':Buffer.from(JSON.stringify({request,execution_authorized:false,native_qualified:false})+'\n')};
 const seal=Buffer.from(JSON.stringify({request_sha256:request.request_sha256,files:Object.entries(files).map(([path,b])=>({path,sha256:sha256(b),bytes:b.length}))})+'\n'),reservation=join(outputDir,'.reservation.json');
 if(recover){if(!lstatSync(outputDir).isDirectory()||lstatSync(outputDir).isSymbolicLink()||!existsSync(reservation)||lstatSync(reservation).isSymbolicLink()||!readFileSync(reservation).equals(seal))throw Error('candidate recovery reservation mismatch');}
 else{mkdirSync(outputDir);writeFileSync(reservation,seal,{flag:'wx'});}
 const inspect=(dir,prefix='')=>{for(const name of readdirSync(dir)){const path=prefix+name,full=join(dir,name),stat=lstatSync(full);if(stat.isSymbolicLink())throw Error('candidate recovery symlink refused');if(stat.isDirectory()){if(!Object.keys(files).some(p=>p.startsWith(path+'/')))throw Error('candidate recovery unexpected directory');inspect(full,path+'/');}else if(!stat.isFile()||!(path==='.reservation.json'||Object.hasOwn(files,path)))throw Error('candidate recovery unexpected file');}};inspect(outputDir);
 for(const [path,bytes] of Object.entries(files)){
  if(path==='candidate.json')continue;
  const parts=path.split('/');let parent=outputDir;for(const part of parts.slice(0,-1)){parent=join(parent,part);if(existsSync(parent)){if(!lstatSync(parent).isDirectory()||lstatSync(parent).isSymbolicLink())throw Error('candidate directory conflict');}else mkdirSync(parent);}
  const full=join(outputDir,path);if(existsSync(full)){if(!recover||!lstatSync(full).isFile()||lstatSync(full).isSymbolicLink()||!readFileSync(full).equals(bytes))throw Error('candidate partial file conflict');}else writeFileSync(full,bytes,{flag:'wx'});
 }
 // Validate through the exact existing worker fixture loader, without loading a runtime.
 const bytes=reviewedR2Module('r2-run.mjs').loadR2Fixture(join(outputDir,'plan.json'),plan.pages[0]);
 const marker=join(outputDir,'candidate.json');if(existsSync(marker)){if(!recover||!lstatSync(marker).isFile()||!readFileSync(marker).equals(files['candidate.json']))throw Error('candidate marker conflict');}else writeFileSync(marker,files['candidate.json'],{flag:'wx'});
 return {outputDir,fixture_bytes:bytes.length,request_sha256:request.request_sha256,execution_authorized:false,native_qualified:false};
}
