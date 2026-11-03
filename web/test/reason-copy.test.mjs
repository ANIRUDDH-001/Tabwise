import {fileURLToPath} from 'node:url';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';import {join} from 'node:path';
import {reasonText,REASON_COPY} from '../lib/reason-copy.mjs';
function files(dir){return readdirSync(dir).flatMap(name=>{const p=join(dir,name);return statSync(p).isDirectory()?files(p):/\.(ts|tsx|mjs)$/.test(p)?[p]:[];});}
const root=fileURLToPath(new URL('..',import.meta.url));
test('every reason code emitted by the API, auth routes and server helpers has human copy',()=>{
 const codes=new Set();
 for(const file of [...files(join(root,'app/api')),...files(join(root,'app/auth')),...files(join(root,'lib/server'))]){
  const text=readFileSync(file,'utf8');
  for(const m of text.matchAll(/HttpError\(\d+,\s*'([a-z_]+)'|reason:\s*'([a-z_]+)'/g))codes.add(m[1]??m[2]);
 }
 assert.ok(codes.size>40,`found ${codes.size}`);
 for(const code of codes)assert.ok(Object.hasOwn(REASON_COPY,code),`missing copy for ${code}`);
});
test('copy contains no underscores, env names or raw codes; unknown codes fall back safely',()=>{
 for(const text of Object.values(REASON_COPY)){assert.ok(!text.includes('_'),text);assert.ok(!/SUPABASE|TABWISE_|KEY|TOKEN/.test(text),text);}
 assert.equal(reasonText('totally_new_code'),'Something went wrong (code: totally_new_code).');
 assert.equal(reasonText('<script>'),'Something went wrong. Try again.');assert.equal(reasonText(undefined),'Something went wrong. Try again.');
 assert.equal(reasonText('toString'),'Something went wrong. Try again.');assert.equal(reasonText('constructor'),'Something went wrong (code: constructor).');
});
