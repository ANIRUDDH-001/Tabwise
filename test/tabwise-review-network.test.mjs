import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as network from '../scripts/tabwise/network.mjs';
test('network policy permits only the owned document and denies remote destinations and protocols',()=>{
 assert.equal(network.documentAllowed('http://127.0.0.1:4321/index.html?flow=seat','GET',4321),true);
 for(const url of ['//x.example/p','https://x.example','http://127.0.0.1:4322/','http://localhost:4321/','ws://127.0.0.1:4321/','wss://x.example','blob:http://127.0.0.1:4321/id','file:///x','data:text/html,x','http://u@127.0.0.1:4321/','http://127.0.0.1:4321/other.js'])assert.equal(network.documentAllowed(url,'GET',4321),false,url);
 assert.equal(network.documentAllowed('http://127.0.0.1:4321/','POST',4321),false);
});
test('isolated context fulfills from memory without fetch/continue; all redirects and sockets have no upstream',async()=>{
 let routeHandler,wsHandler,closed=0;const fulfilled=[],aborted=[];
 const context={addInitScript:async()=>{},route:async(pattern,handler)=>{routeHandler=handler;},routeWebSocket:async(pattern,handler)=>{wsHandler=handler;},close:async()=>closed++};
 let options;const browser={newContext:async opts=>{options=opts;return context;}};
 assert.equal(await network.createIsolatedContext(browser,{port:4321,source:'<p>owned</p>'}),context);
 assert.equal(options.serviceWorkers,'block');assert.equal(options.acceptDownloads,false);
 for(const url of ['http://127.0.0.1:4321/','http://127.0.0.1:4321/index.html?flow=seat','https://x.example/','http://127.0.0.1:4321/redirect']){
  await routeHandler({request:()=>({url:()=>url,method:()=> 'GET',isNavigationRequest:()=>true}),fulfill:async r=>fulfilled.push(r),abort:async()=>aborted.push(url),continue:()=>{throw Error('bypass');},fetch:()=>{throw Error('redirect bypass');}});
 }
 assert.equal(fulfilled.length,2);assert.equal(aborted.length,2);
 for(const response of fulfilled){assert.equal(response.status,200);assert.equal(response.body,'<p>owned</p>');assert.match(response.headers['content-security-policy'],/connect-src 'none'/);assert.equal(response.headers['x-dns-prefetch-control'],'off');assert.equal(response.headers.location,undefined);}
 let socketClosed=0;await wsHandler({close:async()=>socketClosed++,connectToServer:()=>{throw Error('socket bypass');}});assert.equal(socketClosed,1);assert.equal(closed,0);
});
