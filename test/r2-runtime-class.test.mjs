import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {resolve} from 'node:path';
import {loadR2Vendor} from '../scripts/tabwise/r2-vendor-loader.mjs';
import {createLifecycle} from '../scripts/tabwise/r2-nvda-lifecycle.mjs';
import {sendGate} from '../src/speech/sendguard.mjs';
const identity={pid:123,created:'133000000000000000',path_sha256:'a'.repeat(64)};
for(const conflicting of [false,true])test('actual frozen NVDA.start class under R2 loader '+(conflicting?'rejects foreign post-connect owner':'uses integrated resolver internally'),async()=>{
 let alive=false,queries=0,connected=false,physical=0;
 const process=new EventEmitter();process.pid=123;process.exitCode=null;process.kill=()=>{alive=false;process.exitCode=0;process.emit('exit',0);process.emit('close',0);return true;};
 class Client{async connect(){connected=true;}async stop(){}disconnect(){}}
 const gate=sendGate();
 const graph=loadR2Vendor({root:resolve('.'),gate,modules:{
  'lib/windows/isWindows.js':{isWindows:()=>true},'lib/windows/NVDA/isNVDAInstalled.js':{isNVDAInstalled:()=>true},
  'lib/windows/NVDA/NVDAClient.js':{NVDAClient:Client},'lib/windows/NVDA/config/index.js':{resolveSessionUserConfigPath:()=> 'config',createGuidepupConfig(){},deleteGuidepupConfig(){},setConfig(){},getConfig:()=>({})},
  'lib/teardown.js':{addTeardownHandler(){},removeTeardownHandler(){}}},
 lifecycleFactory:()=>createLifecycle({gate,executable:()=> 'C:\\nvda.exe',configPath:()=> 'config',pathHash:()=>identity.path_sha256,spawn:()=>{alive=true;return process;},running:async()=>alive,
 identify:async()=>identity,query:async()=>{queries++;const foreign=conflicting&&connected;return {query_completed:true,outcome:alive?'unique':'absent',pids:alive?[foreign?456:123]:[],measurement:{cleanup:{process_close_observed:true}}};},quit:async()=>{if(alive)process.kill();return {listener_stopped:true};}})});
 if(conflicting)await assert.rejects(graph.nvda.start({capture:false}),/cannot be started/i);
 else{const receipt=await graph.nvda.start({capture:false});assert.deepEqual(receipt,{pid:123,relay_pid:123,reset_confirmed:true});assert.ok(queries>=4);await graph.nvda.stop();}
 assert.equal(physical,0);assert.equal(gate.status().sends,0);
});
