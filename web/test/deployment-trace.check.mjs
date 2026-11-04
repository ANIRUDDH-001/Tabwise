import assert from 'node:assert/strict';
import {readFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname,relative,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {r2Digest} from '../../scripts/tabwise/r2-policy.mjs';
import {qualificationDigest} from '../../scripts/tabwise/qualification-policy.mjs';
const root=resolve(import.meta.dirname,'../..'),output=resolve(process.argv[2]??'');
assert(output.startsWith(join(root,'cache')+'/')||output.startsWith(join(root,'cache')+'\\'),'explicit local build output required');
const nft=join(output,'server/app/api/r2/admission/route.js.nft.json'),files=JSON.parse(await readFile(nft,'utf8')).files;
// Paths in a copied build manifest still resolve against the original .next output location.
const original=join(root,'web/.next/server/app/api/r2/admission'),copy=join(dirname(output),'trace-only-deployment');await mkdir(copy,{recursive:true});
const copied=new Set();for(const item of files){const actual=resolve(original,item),rel=relative(root,actual);if(rel.startsWith('..')||rel.includes('node_modules')||rel.startsWith('web/.next'))continue;assert(!/(^|[\\/])(cache|\.git|\.env)([\\/]|$)/.test(rel));await mkdir(dirname(join(copy,rel)),{recursive:true});await copyFile(actual,join(copy,rel));copied.add(rel.replaceAll('\\','/'));}
await mkdir(join(copy,'web'),{recursive:true});
const loader=pathToFileURL(join(copy,'src/r2/node-review.mjs')).href;
const run=spawnSync(process.execPath,['--input-type=module','-e',`import {reviewedR2Module,reviewedSourceRoot} from ${JSON.stringify(loader)};const p=reviewedR2Module('r2-policy.mjs'),q=reviewedR2Module('qualification-policy.mjs');if(typeof reviewedR2Module('r2-run.mjs').parseR2Plan!=='function')throw Error('missing parser');console.log(JSON.stringify({r2:p.r2Digest(reviewedSourceRoot()),qualification:q.qualificationDigest(reviewedSourceRoot())}));`],{cwd:join(copy,'web'),encoding:'utf8'});
assert.equal(run.status,0,run.stderr);const digests=JSON.parse(run.stdout);assert.equal(digests.r2,r2Digest(root));assert.equal(digests.qualification,qualificationDigest(root));console.log('PASS deployment-only native module imports and exact-source digest reads',run.stdout.trim());
const expected=JSON.parse(await readFile(join(root,'web/r2-trace-files.json'),'utf8'));for(const p of expected)assert(copied.has(p),'missing reviewed source '+p);
