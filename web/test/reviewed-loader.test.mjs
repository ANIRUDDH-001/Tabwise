import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'../..'),loader=pathToFileURL(resolve(root,'src/r2/node-review.mjs')).href;
for(const cwd of [root,resolve(root,'web')])test('reviewed CLI resolves original source from '+cwd,()=>{
 const run=spawnSync(process.execPath,['--input-type=module','-e',`import {reviewedR2Module,reviewedSourceRoot} from ${JSON.stringify(loader)}; import {resolve} from 'node:path'; if(reviewedSourceRoot()!==${JSON.stringify(root)})throw Error('wrong source root'); if(typeof reviewedR2Module('r2-run.mjs').parseR2Plan!=='function')throw Error('parser missing'); for(const name of ['../r2-run.mjs','r2-run.mjs/extra','unknown']){let refused=false;try{reviewedR2Module(name)}catch{refused=true}if(!refused)throw Error('arbitrary module accepted');}`],{cwd,encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
});
