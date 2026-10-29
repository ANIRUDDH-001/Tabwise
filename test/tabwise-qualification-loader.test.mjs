// Process/network denial installed before any frozen modules can be loaded.
import {ROOT,calls,fakes,fakeNvdaInstall} from './helpers/sandbox.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {loadQualificationRuntime,isQualificationRuntime} from '../scripts/tabwise/qualification-loader.mjs';
import {createSpeechObserver} from '../scripts/tabwise/observer.mjs';
test('qualification loader establishes the exact frozen cached class and one registered guard without starting anything',async()=>{
 const runtime=await loadQualificationRuntime({root:ROOT});
 assert.equal(isQualificationRuntime(runtime),true);assert.equal(isQualificationRuntime({...runtime}),false);
 assert.equal(runtime.getGate(),runtime.guard);assert.equal(Object.isFrozen(runtime.NVDAClient.prototype),true);assert.equal(Object.isFrozen(runtime.guard),true);
 const require=createRequire(import.meta.url);assert.equal(require('../vendor/guidepup-0.36.4-r1/lib/windows/NVDA/NVDAClient.js').NVDAClient,runtime.NVDAClient);
 assert.doesNotThrow(()=>runtime.assertAuthentic());assert.equal(calls.length,0);
 // Actual frozen NVDAClient path, with only its TLS boundary faked. No client close event is emitted.
 fakeNvdaInstall();class Socket extends EventEmitter{setEncoding(){}write(text,callback){if(text.includes('"type":"join"'))setImmediate(()=>this.emit('data','{"type":"channel_joined"}\n'));if(callback)setImmediate(()=>callback(null));return true;}destroy(){}}
 const socket=new Socket();fakes['tls.connect']=(...args)=>{setImmediate(args.at(-1));return socket;};
 const observer=await createSpeechObserver({NVDAClient:runtime.NVDAClient,guard:runtime.guard,getGate:runtime.getGate,relayOwnerPid:async()=>12,startupReceipt:{pid:12,relay_pid:12,reset_confirmed:true},deadlineMs:performance.now()+1000});
 socket.emit('data','{"type":"speak","sequence":[" owned title "]}\n');assert.deepEqual(observer.read().phrases,['owned title']);assert.equal(runtime.guard.isStopped(),false);
 socket.emit('close');assert.equal(runtime.guard.isStopped(),true);assert.equal(observer.read().connected,false);assert.equal(observer.read().complete,false);await observer.close();
 await assert.rejects(()=>loadQualificationRuntime({root:ROOT}),/already loaded|one-shot/);
});
