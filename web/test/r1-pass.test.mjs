import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sha256} from '../../packages/contracts/index.mjs';
import {validatePassSnapshot,r1PassView,passStatus,R1_PASS_ANCHOR,PASS_FIELDS} from '../lib/r1-pass.mjs';
import {validateSnapshot} from '../lib/snapshot.mjs';
import {r1View,R1_PASS_SHOWN,R1_PASS_LEDGER} from '../lib/r1-evidence.mjs';
const load=name=>JSON.parse(readFileSync(new URL(`../data/${name}`,import.meta.url),'utf8'));
const pass=load('r1-pass.json'),r1=load('r1.json');
const reseal=s=>{const {snapshot_sha256,...body}=s;return {...body,snapshot_sha256:sha256(JSON.stringify(body))};};
const clone=()=>JSON.parse(JSON.stringify(pass));
test('the committed PASS snapshot validates against its own anchor and the recorded artifact digest',()=>{
 assert.deepEqual(validatePassSnapshot(pass),{ok:true,errors:[]});
 assert.equal(pass.run_id,R1_PASS_LEDGER.run_id);assert.equal(pass.archive_sha256,'419807699a32e3752f6e6637f275803b9db803c960991f0b4d8ecfe8844fc885');
 assert.equal(pass.github_run_id,'40716824856');assert.equal(pass.artifact_id,'12829526270');assert.equal(pass.source_commit,'0c93fa73e0c111a2df65302adfe0006d63f50a39');
 const v=r1PassView(pass);assert.equal(v.attempts,3);assert.equal(v.steps,10);assert.match(v.acks,/^81 of 171 key sends had a confirmed page acknowledgement; 90 could not be confirmed; 0 were missing\.$/);
});
test('only whitelisted public fields are published: no process ids, nonces, titles, runner data or raw streams',()=>{
 assert.deepEqual(Object.keys(pass).sort(),[...PASS_FIELDS].sort());
 const text=JSON.stringify(pass);
 for(const banned of ['process_id','relay_pid','nonce','title_phrase','Google Chrome','image_os','image_version','workflow_ref','RUNNER_TEMP','focus-','sends-','"ts"','win32'])assert.ok(!text.includes(banned),banned);
 for(const [key,value] of [['process_id',6324],['nonce','98f7449e']]){const s=clone();s.attempts[0][key]=value;assert.ok(validatePassSnapshot(reseal(s)).errors.some(e=>e.includes('non-public field')),key);}
 const extra=clone();extra.focus=[];assert.ok(!validatePassSnapshot(reseal(extra)).ok);
});
test('tampering with speech, outcome, acknowledgements or identity is refused even when resealed',()=>{
 const edits=[s=>{s.attempts[0].steps[0].phrases=['invented speech'];},s=>{s.snapshot_sha256='0'.repeat(64);},s=>{s.result='FAIL';},
  s=>{s.send_guard.acks.confirmed=171;s.send_guard.acks.unconfirmable=0;s.limitations[2]='Only 171 of 171';},s=>{s.archive_sha256='0'.repeat(64);},
  s=>{s.settings['virtualBuffers.enableOnPageLoad']=true;},s=>{s.attempts.pop();},s=>{s.attempts[1].steps[3].timed_out=true;},s=>{s.limitations.splice(2,1);}];
 assert.ok(!validatePassSnapshot({...pass,attempts:[{...pass.attempts[0],steps:[{...pass.attempts[0].steps[0],phrases:['invented speech']}]}]}).ok);
 for(const [i,edit] of edits.entries()){const s=clone();edit(s);const sealed=i===1?s:reseal(s);assert.equal(validatePassSnapshot(sealed).ok,false,`edit ${i}`);}
 assert.throws(()=>r1PassView(reseal({...clone(),result:'FAIL'})),/invalid/);
});
test('the failed run keeps its own data, validation and FAIL label; it only points to the separate PASS run',()=>{
 assert.equal(validateSnapshot(r1).ok,true);assert.notEqual(r1.run_id,pass.run_id);
 const v=r1View(r1,passStatus(pass));assert.equal(v.result,'FAIL');assert.match(v.label,/Failed/);assert.equal(v.passNotice,R1_PASS_SHOWN);
 assert.equal(validateSnapshot(pass).ok,false);
 assert.equal(r1View(r1,{validated:false,result:'PASS'}).passNotice,r1View(r1).passNotice);
});
test('the anchored source digests are the ones the generator checks against',()=>{
 assert.deepEqual(pass.source_hashes,R1_PASS_ANCHOR.files);
 const src=readFileSync(new URL('../scripts/build-r1-pass.mjs',import.meta.url),'utf8');
 assert.match(src,/archive_sha256/);assert.match(src,/anchored file differs/);
});
test('PASS surfaces render from the validated view and keep the scope note',()=>{
 for(const file of ['app/page.tsx','app/w/demo/page.tsx','components/PassRunDetail.tsx']){const s=readFileSync(new URL(`../${file}`,import.meta.url),'utf8');assert.match(s,/r1PassView/,file);assert.match(s,/R1ScopeNote/,file);}
});
