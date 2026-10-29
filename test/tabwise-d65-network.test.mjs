import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {BROWSER_ARGS,createIsolatedContext} from '../scripts/tabwise/network.mjs';
import {applyPatch} from '../src/repair/apply.mjs';
test('N3 disables browser WebRTC globals before scripts with immutable shadows and explicit UDP policy',async()=>{
 assert.ok(BROWSER_ARGS.includes('--force-webrtc-ip-handling-policy=disable_non_proxied_udp'));
 let init;const context={addInitScript:async fn=>{init=fn;},route:async()=>{},routeWebSocket:async()=>{},close:async()=>{}};
 await createIsolatedContext({newContext:async()=>context},{port:4321,source:'<title>owned</title>'});assert.equal(typeof init,'function');
 const realm={RTCPeerConnection:function(){},webkitRTCPeerConnection:function(){},RTCDataChannel:function(){}};runInNewContext(`(${init.toString()})()`,realm);
 for(const key of ['RTCPeerConnection','webkitRTCPeerConnection','RTCDataChannel']){assert.equal(realm[key],undefined);assert.equal(Object.getOwnPropertyDescriptor(realm,key).writable,false);assert.equal(Object.getOwnPropertyDescriptor(realm,key).configurable,false);}
});
test('N3 patch lint rejects the concrete WebRTC and speculative DNS/preconnect counterexamples',()=>{
 for(const text of ['<script>new RTCPeerConnection({})</script>','<script>new webkitRTCPeerConnection({})</script>','<link rel="preconnect" href="//x.example">','<link rel=dns-prefetch href=//x.example>','<link REL="alternate PRECONNECT" href="//x.example">']){
  const diff=`--- a/index.html\n+++ b/index.html\n@@ -1,1 +1,1 @@\n-<p>owned</p>\n+${text}\n`;
  assert.throws(()=>applyPatch({'index.html':'<p>owned</p>\n'},diff),/network|external/);
 }
});
