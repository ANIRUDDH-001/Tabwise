import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASELINE_REVISION = '0c93fa73e0c111a2df65302adfe0006d63f50a39';
const trusted = Object.freeze({
  '.github/workflows/r1.yml': 'e1353c1dc5460d0e8569499239dcb7e87443896b18909ffff47ad604f131355c',
  'scripts/r1.mjs': '3f5e82940ecc656406f9adc7237c5e2421716066c3def338f8509210b94b1335',
  'package-lock.json': '2f4a4e9f30fbe994995c1c4291eb02a09e89ff58ff12b143623cc270ff515ef4',
});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
// The pinned blob has no CR, so Git's autocrlf checkout (windows-2025 runner, D-73 run 40849425253) maps it
// one-to-one to CRLF. Undo only a uniform conversion: a lone CR or LF stays, so mixed bytes still mismatch.
const fromUniformCrlf = bytes => {
  const text = bytes.toString('latin1');
  return text.includes('\r') && !/\r(?!\n)|(?<!\r)\n/.test(text) ? Buffer.from(text.replace(/\r\n/g, '\n'), 'latin1') : bytes;
};
const LOCK_SHA='5ce41a6b5b18768917536cabaf906531ff0a88fe9c242654b4451f66ec555af5';
const DEFAULT_ROOT=fileURLToPath(new URL('../',import.meta.url));

// Built-ins only. Never evaluate the files whose integrity is being established.
export function checkFrozenIntegrity(root=DEFAULT_ROOT){
 const errors=[...checkR1Baseline(root).errors];
 try{
  const text=readFileSync(resolve(root,'fixtures/r1/lock.json'),'utf8').replace(/\r\n/g,'\n');
  if(sha(text)!==LOCK_SHA)throw Error('trusted R1 lock differs');
  const lock=JSON.parse(text);
  for(const [file,hash] of Object.entries(lock.sha256)){
   let actual=readFileSync(resolve(root,file.split('#')[0]),'utf8').replace(/\r\n/g,'\n');
   if(file==='docs/ledger/PLAN.md#F-02'){
    const begin=actual.indexOf('<!-- F-02 spec begin'),end=actual.indexOf('<!-- F-02 spec end -->'),from=actual.indexOf('-->',begin)+3;
    if(begin<0||end<from)throw Error('F-02 spec markers');actual=actual.slice(from,end);
   }
   if(sha(actual)!==hash)errors.push(`R1 frozen mismatch: ${file}`);
  }
  for(const [file,hash] of Object.entries(lock.dependencies))if(sha(readFileSync(resolve(root,file)))!==hash)errors.push(`R1 upstream mismatch: ${file}`);
  const vendor=resolve(root,'vendor/guidepup-0.36.4-r1'),files=[];
  const walk=(dir='')=>{for(const e of readdirSync(resolve(vendor,dir),{withFileTypes:true})){
   const rel=dir?`${dir}/${e.name}`:e.name;const stat=lstatSync(resolve(vendor,rel));
   if(stat.isSymbolicLink())throw Error('R1 vendor symlink');
   if(e.isDirectory())walk(rel);else if(e.isFile())files.push(rel);else throw Error('R1 vendor special file');
  }};walk();
  const digest=createHash('sha256');for(const rel of files.sort())digest.update(`${rel}\0${sha(readFileSync(resolve(vendor,rel)))}\n`);
  if(digest.digest('hex')!==lock.vendor_tree)errors.push('R1 vendor tree mismatch');
 }catch(error){errors.push(`R1 frozen integrity: ${error.message}`);}
 return {ok:errors.length===0,errors};
}
export async function verifyThenLoad(root=DEFAULT_ROOT,load){
 const result=checkFrozenIntegrity(root);if(!result.ok)throw Error(`R1 baseline integrity refused: ${result.errors.join('; ')}`);
 return load();
}

export function checkR1Baseline(root = fileURLToPath(new URL('../', import.meta.url))) {
  const errors = [];
  try {
    const lines = readFileSync(resolve(root, 'ci/r1-baseline.sha256'), 'utf8').split(/\r?\n/).filter(x => x && !x.startsWith('#'));
    if (lines.length !== Object.keys(trusted).length || lines.some(line => {
      const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
      return !match || trusted[match[2]] !== match[1];
    }) || new Set(lines.map(x => x.slice(66))).size !== lines.length) errors.push('baseline manifest differs from trusted revision');
  } catch { errors.push('baseline manifest missing'); }
  for (const [path, expected] of Object.entries(trusted)) {
    try {
      const bytes = readFileSync(resolve(root, path));
      // Never rewrite the frozen file; compare its Git blob bytes (LF, or a uniform CRLF checkout of them).
      const canonical = path === 'package-lock.json' ? fromUniformCrlf(bytes) : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
      if (sha(canonical) !== expected) errors.push(`R1 baseline mismatch: ${path}`);
    } catch { errors.push(`R1 baseline missing: ${path}`); }
  }
  return { ok: errors.length === 0, revision: BASELINE_REVISION, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkR1Baseline();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}
