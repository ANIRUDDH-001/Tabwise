// Server-only Node access to the exact reviewed CLI implementations. No arbitrary module/path input.
import {createRequire} from 'node:module';
import {resolve,basename} from 'node:path';
const require=createRequire(import.meta.url);
export function reviewedSourceRoot(){return resolve(process.cwd(),basename(process.cwd())==='web'?'..':'.');}
export function reviewedR2Module(name){
 if(!['r2-policy.mjs','qualification-policy.mjs','r2-run.mjs'].includes(name))throw Error('unreviewed module refused');
 // Preserve native Node loading; do not bundle CLI filesystem/runtime code into Next.js.
 // Missing reviewed source is a hard failure, never a fallback or bypass.
 return require(/* webpackIgnore: true */ resolve(reviewedSourceRoot(),'scripts/tabwise',name));
}
