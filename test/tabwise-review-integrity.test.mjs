import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,mkdirSync,readFileSync,writeFileSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import * as integrity from '../scripts/check-r1-baseline.mjs';

test('worker cannot import capture or guarded code before complete frozen integrity',async()=>{
 const root=mkdtempSync(join(tmpdir(),'tw-integrity-'));const lock=JSON.parse(readFileSync('fixtures/r1/lock.json','utf8'));
 try{
  const files=[...new Set(['ci/r1-baseline.sha256','fixtures/r1/lock.json','package-lock.json',...Object.keys(lock.sha256).map(p=>p.split('#')[0]),...Object.keys(lock.dependencies)])];
  for(const file of files){mkdirSync(dirname(join(root,file)),{recursive:true});cpSync(file,join(root,file));chmodSync(join(root,file),0o600);}
  cpSync('vendor/guidepup-0.36.4-r1',join(root,'vendor/guidepup-0.36.4-r1'),{recursive:true});
  assert.equal(integrity.checkFrozenIntegrity(root).ok,true);
  for(const file of ['src/speech/sendguard.mjs','src/speech/runguard.mjs','vendor/guidepup-0.36.4-r1/lib/windows/sendKeys.js','node_modules/@guidepup/guidepup/lib/windows/sendKeys.js']){
   const path=join(root,file),before=readFileSync(path);chmodSync(path,0o600);writeFileSync(path,Buffer.concat([before,Buffer.from('\n/* changed */')]));
   let imported=0;await assert.rejects(()=>integrity.verifyThenLoad(root,async()=>{imported++;}),/R1 baseline/);
   assert.equal(imported,0,file);writeFileSync(path,before);
  }
  const path=join(root,'fixtures/r1/lock.json');const forged=structuredClone(lock);forged.sha256['src/speech/sendguard.mjs']='0'.repeat(64);writeFileSync(path,JSON.stringify(forged));
  assert.equal(integrity.checkFrozenIntegrity(root).ok,false);
 }finally{rmSync(root,{recursive:true,force:true});}
 const entry=readFileSync('scripts/tabwise-run.mjs','utf8');
 assert.doesNotMatch(entry,/^import .*from ['"].*(?:worker|contracts|speech)/m);
 assert.match(entry,/await import\(/);
});
