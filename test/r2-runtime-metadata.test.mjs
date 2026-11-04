import {test} from 'node:test';import assert from 'node:assert/strict';
import * as metadata from '../src/r2/runtime-metadata.mjs';
import {sha256} from '../packages/contracts/index.mjs';
const identity={pid:123,created:'134000000000000001',path_sha256:'a'.repeat(64)};
const snapshot=()=>({...identity,product_version:'2026.2.0.0',executable_sha256:'b'.repeat(64)});
const settings={keyboard:{speakTypedCharacters:1,speakTypedWords:0},virtualBuffers:{enableOnPageLoad:false}};
const readback={'keyboard.speakTypedCharacters':1,'keyboard.speakTypedWords':0,'virtualBuffers.enableOnPageLoad':false};
test('runtime metadata binds observed file version/executable identity and exact read-back profile',()=>{
 const value=metadata.buildRuntimeMetadata({snapshot:snapshot(),expectedIdentity:identity,settings,readback});
 assert.equal(value.schema,'tabwise-native-runtime/2');assert.equal(value.nvda_version,'2026.2.0.0');assert.equal(value.version_source,'Windows owned-process MainModule.FileVersionInfo.ProductVersion');assert.equal(value.profile,'A15');assert.equal(value.executable_sha256,'b'.repeat(64));assert.equal(value.settings_sha256,sha256(JSON.stringify(readback)));assert.deepEqual(value.process_identity,identity);assert.deepEqual(metadata.validateRuntimeMetadata(value),value);
});
for(const kind of ['pid','created','path','version','hash','settings','readback'])test('runtime metadata refuses '+kind+' substitution',()=>{
 const a={snapshot:snapshot(),expectedIdentity:identity,settings:structuredClone(settings),readback:{...readback}};
 if(kind==='pid')a.snapshot.pid++;if(kind==='created')a.snapshot.created='134000000000000002';if(kind==='path')a.snapshot.path_sha256='c'.repeat(64);if(kind==='version')a.snapshot.product_version='unobserved-manifest-version';if(kind==='hash')a.snapshot.executable_sha256='';if(kind==='settings')a.settings.virtualBuffers.enableOnPageLoad=true;if(kind==='readback')a.readback['keyboard.speakTypedWords']=1;
 assert.throws(()=>metadata.buildRuntimeMetadata(a));
});
test('runtime metadata rejects forged qualification and unexpected fields',()=>{
 const a=metadata.buildRuntimeMetadata({snapshot:snapshot(),expectedIdentity:identity,settings,readback});assert.throws(()=>metadata.validateRuntimeMetadata({...a,qualified:true}));assert.throws(()=>metadata.validateRuntimeMetadata({...a,version_source:'asset manifest'}));
});
import * as lifecycle from '../scripts/tabwise/r2-nvda-lifecycle.mjs';
test('bounded metadata query uses the fixed identity helper and exact observed-process binding',async()=>{
 let args;const result=await lifecycle.processRuntimeMetadata(identity,{deadline:99999,run:async options=>{args=options;return {ok:true,stdout:JSON.stringify(snapshot()),cleanup:{process_close_observed:true}};}});
 assert.deepEqual(result,snapshot());assert.equal(args.args.at(-1),'-RuntimeMetadata');assert.equal(args.maxBytes,4096);assert.equal(args.deadline,99999);
});
for(const kind of ['failed','unclosed','pid','created','extra'])test('metadata helper refuses '+kind,async()=>{
 const row=snapshot();if(kind==='pid')row.pid++;if(kind==='created')row.created='134000000000000002';if(kind==='extra')row.claim='qualified';
 await assert.rejects(()=>lifecycle.processRuntimeMetadata(identity,{deadline:99999,run:async()=>({ok:kind!=='failed',stdout:JSON.stringify(row),cleanup:{process_close_observed:kind!=='unclosed'}})}));
});
test('runtime integrity detects changed runtime metadata validator bytes',async()=>{
 const fs=await import('node:fs'),path=await import('node:path'),os=await import('node:os');const {runtimeIntegrity}=await import('../scripts/tabwise/r2-runtime-integrity.mjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tw-metadata-pins-'));
 try{const pins=JSON.parse(fs.readFileSync('scripts/tabwise/r2-runtime-pins.json'));for(const name of [...new Set([...Object.keys(pins.files),'scripts/tabwise/r2-runtime-pins.json','src/r2/runtime-metadata.mjs'])]){const target=path.join(dir,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,fs.readFileSync(name));}assert.deepEqual(runtimeIntegrity(dir),[]);fs.appendFileSync(path.join(dir,'src/r2/runtime-metadata.mjs'),'\n// deliberate tamper');assert.match(runtimeIntegrity(dir).join(),/runtime source changed/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('sealed runtime validator refuses a different settings digest behind the A15 label',()=>{
 const a=metadata.buildRuntimeMetadata({snapshot:snapshot(),expectedIdentity:identity,settings,readback});assert.throws(()=>metadata.validateRuntimeMetadata({...a,settings_sha256:'c'.repeat(64)}));
});
