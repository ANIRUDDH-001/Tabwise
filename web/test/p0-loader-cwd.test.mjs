import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
test('reviewed source loader resolves from an unrelated serverless working directory',()=>{
 const root=resolve(import.meta.dirname,'../..'),loader=pathToFileURL(resolve(root,'src/r2/node-review.mjs')).href;
 const r=spawnSync(process.execPath,['--input-type=module','-e',`import {reviewedSourceRoot,reviewedR2Module} from ${JSON.stringify(loader)};if(reviewedSourceRoot()!==${JSON.stringify(root)})throw Error('cwd-dependent source root');if(typeof reviewedR2Module('r2-run.mjs').parseR2Plan!=='function')throw Error('missing parser');`],{cwd:tmpdir(),encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
