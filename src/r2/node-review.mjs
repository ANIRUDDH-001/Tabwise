// Server-only Node access to the exact reviewed CLI implementations. No arbitrary module/path input.
import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
const require=createRequire(import.meta.url);
export function reviewedSourceRoot(){
 // Raw deployments use module location; Next's bundled server executes from the project root.
 // Only a root containing this exact loader and the pinned policy is a candidate. Missing files
 // are an admission refusal, never a fallback to a different filesystem tree.
 for(const root of [resolve(dirname(fileURLToPath(import.meta.url)),'../..'),resolve(process.cwd(),'..'),process.cwd()]){
  if(existsSync(resolve(root,'src/r2/node-review.mjs'))&&existsSync(resolve(root,'scripts/tabwise/r2-policy.mjs')))return root;
 }
 throw Error('reviewed source package unavailable');
}
export function reviewedR2Module(name){
 if(!['r2-policy.mjs','qualification-policy.mjs','r2-run.mjs'].includes(name))throw Error('unreviewed module refused');
 // Scope each branch to the reviewed CLI directory before adding the allowlisted filename.
 // Keep native Node loading and original source paths for digest validation.
 const directory=resolve(reviewedSourceRoot(),'scripts/tabwise');
 return require(/* webpackIgnore: true */ resolve(directory,name));
}
