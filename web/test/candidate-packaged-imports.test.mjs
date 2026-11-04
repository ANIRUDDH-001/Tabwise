import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {resolve,dirname,join} from 'node:path';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
test('candidate raw adapters import from only the deployed trace files, without the repository as a fallback',()=>{
 const root=resolve(import.meta.dirname,'../..'),scratch=mkdtempSync(join(tmpdir(),'tabwise-package-import-'));
 try{
  for(const name of JSON.parse(readFileSync(join(root,'web/r2-trace-files.json'),'utf8'))){const dest=resolve(scratch,name);assert(dest.startsWith(scratch+'\\')||dest.startsWith(scratch+'/'));mkdirSync(dirname(dest),{recursive:true});copyFileSync(join(root,name),dest);}
  for(const name of ['web/lib/server/candidate-repair.mjs','web/lib/server/candidate-comparison.mjs']){
   const child=spawnSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(pathToFileURL(join(scratch,name)).href)})`],{cwd:scratch,encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(child.status,0,child.stderr);
  }
 }finally{assert(resolve(scratch).startsWith(resolve(tmpdir())+'\\')||resolve(scratch).startsWith(resolve(tmpdir())+'/'));rmSync(scratch,{recursive:true,force:true});}
});
