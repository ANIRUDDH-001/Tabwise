// Real frozen vendor + real sendGate; OS boundaries blocked by the existing T0 sandbox.
import {fakes,count,reset,loadVendor,fakeNvdaInstall,CP} from '../../test/helpers/sandbox.mjs';
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {sendGate} from '../../src/speech/sendguard.mjs';
import {runStartupOnly} from './startup-core.mjs';
beforeEach(()=>reset());
async function fixture(){
 const vendor=loadVendor(),guard=sendGate();vendor.r1Gate.setGate(guard);fakeNvdaInstall();
 class Socket extends EventEmitter{
  destroyed=false;writes=[];setEncoding(){};
  write(message,callback){this.writes.push(message);if(message.includes('"type":"join"'))setImmediate(()=>this.emit('data','{"type":"channel_joined"}\n'));if(callback)setImmediate(callback);return true;}
  destroy(){this.destroyed=true;}end(){setImmediate(()=>this.emit('finish'));}
 }
 const socket=new Socket();fakes['tls.connect']=(_port,_host,_opts,secure)=>{setImmediate(secure);return socket;};
 const client=new vendor.NVDAClient();await client.connect({capture:false});
 assert.equal(socket.writes.length,2,'real handshake completed; not a socket-missing refusal');
 return {vendor,guard,client,socket};
}
for(const name of ['moveToNext','moveToPrevious','activate','stopSpeech','leftMouseClick','rightMouseClick'])test(`real unarmed guard refuses frozen key route ${name} before any physical write`,async()=>{
 const {vendor,guard,client,socket}=await fixture();assert.ok(vendor.keyCodeCommands[name]);
 await assert.rejects(client.sendKeyCode(vendor.keyCodeCommands[name]),/outside an action/);
 assert.equal(vendor.r1Gate.getGate(),guard);assert.equal(guard.status().sends,0);assert.equal(guard.isStopped(),true);
 assert.equal(socket.writes.filter(s=>s.includes('"type":"key"')).length,0);
 for(const op of CP)assert.equal(count('child_process.'+op),0);
 await client.stop();assert.equal(socket.writes.length,2);
});
test('Shift+Tab and capture stop-speech cannot bypass real unarmed guard',async()=>{
 const {vendor,guard,client,socket}=await fixture();
 await assert.rejects(client.sendKeyCode({keyCode:vendor.KeyCodes.Tab,modifiers:[vendor.Modifiers.Shift]}),/outside an action/);
 await assert.rejects(client.enqueueAndTap(()=>client.sendKeyCode({keyCode:vendor.KeyCodes.Enter}),{capture:true}));
 await client.stop();assert.equal(socket.writes.length,2);assert.equal(guard.status().sends,0);
});
for(const route of ['sendKeys','runSendKeys','legacy-script'])test(`unarmed frozen cscript route ${route} launches no process`,async()=>{
 const {vendor,guard,client,socket}=await fixture();
 const action=route==='sendKeys'?()=>vendor.sendKeys.sendKeys({characters:'a'}):route==='runSendKeys'?()=>vendor.runVbsScript.runSendKeys('a'):()=>vendor.runVbsScript.runVbsScript('CreateObject("WScript.Shell").SendKeys "a"');
 await assert.rejects(action());assert.equal(count('child_process.execFile'),0);assert.equal(guard.status().sends,0);assert.equal(vendor.r1Gate.getGate(),guard);
 await client.stop();assert.equal(socket.writes.length,2);
});
test('input attempts during startup failure and cleanup remain refused through the real guard',async()=>{
 const {vendor,guard,client,socket}=await fixture();let cleanups=0;
 const result=await runStartupOnly({authentic:()=>assert.equal(vendor.r1Gate.getGate(),guard),disarm:()=>guard.disarm(),status:()=>guard.status(),
  start:()=>client.sendKeyCode({keyCode:vendor.KeyCodes.Tab}),stop:async()=>{cleanups++;await assert.rejects(vendor.sendKeys.sendKeys({characters:'b'}));await client.stop();}});
 assert.equal(cleanups,1);assert.equal(result.startup_pass,false);assert.equal(result.sends,0);assert.equal(count('child_process.execFile'),0);assert.equal(socket.writes.length,2);
 assert.equal(guard.commit(Object.freeze({id:1,key:'Tab'})),false);assert.equal(guard.status().sends,0);
});
