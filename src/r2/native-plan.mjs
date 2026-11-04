// Immutable, request-bound source delivery. W5 consumption is independently verified; OIDC never grants input.
import {mkdirSync,writeFileSync,readFileSync,realpathSync,lstatSync,existsSync,readdirSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute,join} from 'node:path';
import {verify,createPublicKey} from 'node:crypto';
import {validateProductDelivery} from './product-delivery.mjs';
import {parseUniqueJson} from './strict-json.mjs';
import {verifyReceipt,canonical} from '../../scripts/tabwise/r2-admission.mjs';
import {sha256} from '../../packages/contracts/index.mjs';
import {safePath} from '../../packages/contracts/r2-product.mjs';
const fail=why=>{throw Error('native plan refused: '+why);};
function check(args){
 const {delivery,authority,receipt,githubRunId}=args,d=validateProductDelivery(delivery),r=d.request;
 if(!authority||authority.consumer?.run_id!==githubRunId||authority.consumer?.attempt!==1)fail('independent W5 consumer required');
 const consumed=verifyReceipt(receipt,authority),b=consumed.binding;
 if(b.purpose!=='r2-execution'||b.workflow!==r.workflow||b.revision!==r.revision||b.actor!==r.actor||b.reviewed_sha256!==r.r2_source_sha256||b.qualification_sha256!==r.qualification_sha256||b.plan_sha256!==r.plan_sha256)fail('W5 source/plan binding');
 // W5 alone binds execution source/plan, not a product request. Require an independent
 // authority-signed request admission too; a product OIDC token is never accepted here.
 const admission=args.requestReceipt,payload={schema:'tabwise-native-plan-admission/1',request_sha256:r.request_sha256,product_run_id:r.product_run_id,github_run_id:githubRunId,consumption_id:consumed.consumption_id,plan_bytes_sha256:r.plan_bytes_sha256,fixture_sha256:r.fixture_sha256};
 if(!admission||Object.keys(admission).sort().join()!=='payload,signature'||canonical(admission.payload)!==canonical(payload)||!/^[A-Za-z0-9+/]{86}==$/.test(admission.signature??''))fail('request-bound authority admission required');
 const publicKey=createPublicKey(authority.publicKey);
 if(publicKey.asymmetricKeyType!=='ed25519'||!verify(null,Buffer.from(canonical(payload)),publicKey,Buffer.from(admission.signature,'base64')))fail('request admission signature');
 const plan=parseUniqueJson(d.plan_text);if(plan.pages.length!==1||plan.pages[0].id!==r.page_id||canonical(b.fixtures)!==canonical([{id:r.page_id,sha256:r.fixture_sha256}]))fail('one admitted product page required');
 const fixture=plan.pages[0].fixture;
 if(!safePath(fixture)||fixture==='plan.json'||fixture==='COMPLETE.json'||fixture.split('/').some(p=>/[. :]+$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))fail('fixture path');
 return {d,r,fixture};
}
function outside(root,directory){
 const checkout=realpathSync(root);let ancestor=resolve(directory),suffix=[];
 while(!existsSync(ancestor)){suffix.unshift(ancestor.slice(dirname(ancestor).length+1));const parent=dirname(ancestor);if(parent===ancestor)fail('output ancestry');ancestor=parent;}
 if(!lstatSync(ancestor).isDirectory()||lstatSync(ancestor).isSymbolicLink())fail('output ancestry');
 const actual=join(realpathSync(ancestor),...suffix),rel=relative(checkout,actual);
 if(!rel||rel.split(/[\\/]/)[0]!=='..'&&!isAbsolute(rel))fail('output inside checkout');
 return actual;
}
// Signature and source validation without persistence or execution authority.
export function verifyNativePlanAdmission(args){check(args);return true;}
export function materializeNativePlan(args){
 const {d,r,fixture}=check(args),directory=outside(args.root,args.outputDir),write=args.write??writeFileSync;
 mkdirSync(directory);const files={'plan.json':Buffer.from(d.plan_text),[fixture]:Buffer.from(d.fixture_text)},inventory=[];
 for(const [path,bytes]of Object.entries(files)){
  const full=join(directory,path);mkdirSync(dirname(full),{recursive:true});write(full,bytes,{flag:'wx'});
  if(!readFileSync(full).equals(bytes))fail('readback mismatch');inventory.push({path,bytes:bytes.length,sha256:sha256(bytes)});
 }
 const marker={schema:'tabwise-native-plan/1',request_sha256:r.request_sha256,product_run_id:r.product_run_id,github_run_id:args.githubRunId,consumption_id:args.receipt.payload.consumption_id,files:inventory,input_authorized:false};
 write(join(directory,'COMPLETE.json'),JSON.stringify(marker),{flag:'wx'});
 return readNativePlan({...args,directory});
}
export function readNativePlan(args){
 const {d,r,fixture}=check(args),directory=outside(args.root,args.directory);
 if(lstatSync(directory).isSymbolicLink())fail('output symlink');
 if(lstatSync(join(directory,'COMPLETE.json')).isSymbolicLink())fail('completion symlink');
 const marker=parseUniqueJson(readFileSync(join(directory,'COMPLETE.json'),'utf8'));
 const files={'plan.json':Buffer.from(d.plan_text),[fixture]:Buffer.from(d.fixture_text)},expected={schema:'tabwise-native-plan/1',request_sha256:r.request_sha256,product_run_id:r.product_run_id,github_run_id:args.githubRunId,consumption_id:args.receipt.payload.consumption_id,files:Object.entries(files).map(([path,bytes])=>({path,bytes:bytes.length,sha256:sha256(bytes)})),input_authorized:false};
 if(canonical(marker)!==canonical(expected))fail('completion identity');
 for(const [path,bytes]of Object.entries(files)){
  let current=directory;for(const part of path.split('/')){current=join(current,part);if(lstatSync(current).isSymbolicLink())fail('source symlink');}
  if(!readFileSync(current).equals(bytes))fail('exact source bytes changed');
 }
 const actual=[];let entries=0;const walk=(dir,prefix='')=>{for(const name of readdirSync(dir)){if(++entries>32)fail('source entry cap');const path=prefix+name,full=join(dir,name),stat=lstatSync(full);if(stat.isSymbolicLink())fail('source symlink');if(stat.isDirectory())walk(full,path+'/');else if(stat.isFile())actual.push(path);else fail('special source file');}};walk(directory);
 if(canonical(actual.sort())!==canonical([...Object.keys(files),'COMPLETE.json'].sort()))fail('source inventory');
 return Object.freeze({directory,planPath:join(directory,'plan.json'),fixturePath:join(directory,fixture),request_sha256:r.request_sha256,github_run_id:args.githubRunId,input_authorized:false,native_qualified:false});
}
