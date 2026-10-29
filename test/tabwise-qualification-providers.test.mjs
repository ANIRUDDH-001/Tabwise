import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createQualificationBrowser,qualificationFixture} from '../scripts/tabwise/qualification-providers.mjs';
test('qualification browser retains exact PID/nonce, isolation, key journal and signal-safe lifecycle',async()=>{
 const calls=[];let launch,init;
 const page={goto:async url=>calls.push(['goto',url]),evaluate:async(fn,arg)=>({complete:true,network_restrictions:true,nonce:'0123abcd',url:'http://127.0.0.1:4321/index.html?nonce=0123abcd',title:'R1 sign-up 0123abcd',events:[],active:'body'})};
 const context={addInitScript:async fn=>{init=fn;},route:async()=>{},routeWebSocket:async()=>{},newPage:async()=>page,close:async()=>calls.push(['context.close'])};
 const browser={newContext:async()=>context,version:()=> 'fake',close:async()=>calls.push(['browser.close'])};
 const chromium={launchServer:async options=>{launch=options;return {process:()=>({pid:123}),wsEndpoint:()=> 'fake',close:async()=>calls.push(['server.close']),kill:async()=>calls.push(['server.kill'])};},connect:async()=>browser};
 const adapter=createQualificationBrowser({chromium,port:4321,nonce:'0123abcd',timeoutMs:1000});const opened=await adapter.open();
 assert.equal(opened.pid,123);assert.equal(launch.headless,false);assert.equal(launch.handleSIGINT,false);assert.ok(launch.args.some(arg=>arg.includes('disable_non_proxied_udp')));assert.equal(typeof init,'function');assert.equal((await opened.read()).complete,true);assert.deepEqual(await opened.keys(0),[]);
 await opened.close();assert.deepEqual(calls.slice(-3).map(call=>call[0]),['context.close','browser.close','server.close']);assert.throws(()=>qualificationFixture('<script>'),/nonce/);
});
