import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {R2_FILES} from '../../scripts/tabwise/r2-policy.mjs';
const root=resolve(import.meta.dirname,'../..');
const routes=['r2/admission','r2/product-binding','runs/[id]/native-request','runs/[id]/native-dispatch','runs/[id]/native-ingest','runs/[id]/diagnose','patches/[id]/apply','patches/[id]/oracle','verifications/[id]'];
for(const route of routes){
 const path=resolve(root,'web/.next/server/app/api',route,'route.js.nft.json'),manifest=JSON.parse(readFileSync(path));
 const files=new Set(manifest.files.map(p=>resolve(dirname(path),p)));
 for(const file of R2_FILES)assert(files.has(resolve(root,file)),route+' lacks enforced source '+file);
 assert(files.has(resolve(root,'src/deployment-execution.mjs')),route+' lacks Preview boundary');
 console.log('PASS exact reviewed source scope:',route);
}
