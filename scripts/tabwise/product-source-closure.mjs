// Review manifest only. No runtime authority. TS/ESM/CommonJS plus explicit data/frozen roots.
import {readFileSync,existsSync,readdirSync,statSync} from 'node:fs';
import {resolve,relative,dirname,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {R2_FILES} from './r2-policy.mjs';
import {QUALIFICATION_FILES} from './qualification-policy.mjs';
const root=resolve(import.meta.dirname,'../..'),seen=new Set(),todo=[...R2_FILES,...QUALIFICATION_FILES,
 'scripts/tabwise/product-workflow-boundary.mjs','scripts/tabwise/product-windows-boundary.mjs','src/r2/product-workflow-export.mjs','src/r2/product-worker.mjs',
 'web/app/api/r2/product-binding/route.ts','web/lib/server/native-integration.mjs','web/lib/server/native-artifacts.mjs','web/lib/server/native-request-live.ts',
 'scripts/tabwise/native-integration-policy.json','scripts/tabwise/r2-product-policy.json','scripts/tabwise/r2-status.json','scripts/tabwise/qualification-status.json',
 'scripts/tabwise-r2.mjs','.github/workflows/tabwise-r2.yml','docs/engineering/native-workflow-permission-proposal.patch','package.json','package-lock.json','web/package-lock.json','fixtures/r1/lock.json','ci/r1-baseline.sha256'];
function addTree(dir){for(const e of readdirSync(resolve(root,dir),{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())addTree(p);else todo.push(p);}}
addTree('vendor/guidepup-0.36.4-r1');
const local=(path)=>{for(const p of [path,path+'.ts',path+'.tsx',path+'.mjs',path+'.js',path+'/index.ts',path+'/index.mjs',path+'/index.js'])if(existsSync(resolve(root,p))&&statSync(resolve(root,p)).isFile())return p;throw Error('missing closure '+path);};
while(todo.length){
 const path=local(todo.pop());if(seen.has(path))continue;const full=resolve(root,path),rel=relative(root,full);
 if(isAbsolute(rel)||rel.startsWith('..'))throw Error('closure escape');seen.add(path);
 if(/\.(?:[cm]?js|tsx?)$/.test(path)){
  const s=readFileSync(full,'utf8');
  for(const m of s.matchAll(/(?:from\s*|import\s*\(|require\s*\(|new URL\s*\()(['"])(\.[^'"]+)\1/g)){
   const base=m[0].startsWith('require')&&path==='scripts/tabwise/qualification-loader.mjs'?resolve(root,'vendor/guidepup-0.36.4-r1'):dirname(full); const target=resolve(base,m[2]); if(m[0].startsWith('new URL')&&existsSync(target)&&statSync(target).isDirectory())continue; const dep=relative(root,target).replaceAll('\\','/');todo.push(dep);
  }
 }
}
const files=[...seen].sort().map(path=>({path,sha256:createHash('sha256').update(readFileSync(resolve(root,path),'utf8').replaceAll('\r\n','\n')).digest('hex')}));
console.log(JSON.stringify({schema:'tabwise-product-source-review/1',authorizing:false,scope:'relative literal imports/requires/URL data + explicit policy/lock/vendor roots; package trees pinned by lockfiles',files},null,2));
