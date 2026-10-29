import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium} from '@playwright/test';
import {createIsolatedContext,BROWSER_ARGS} from '../scripts/tabwise/network.mjs';

test('headless isolation blocks alternate-port requests, sockets, resources and redirect navigation',{timeout:20000},async()=>{
 let hits=0;const sink=createServer((req,res)=>{hits++;res.writeHead(302,{location:'http://127.0.0.1:9/'});res.end();});
 await new Promise(resolve=>sink.listen(0,'127.0.0.1',resolve));
 const target=`http://127.0.0.1:${sink.address().port}`,port=sink.address().port===4321?4322:4321;
 const source=`<!doctype html><title>Isolation fixture</title><link rel="prefetch" href="${target}/prefetch"><style>@import url(${target}/style);</style><img src="${target}/image"><script>
  window.done=false;
  fetch('${target}/fetch').catch(()=>{});
  navigator.sendBeacon('${target}/beacon','test');
  try{new EventSource('${target}/events');}catch{}
  try{new WebSocket('${target.replace('http:','ws:')}/socket');}catch{}
  import('${target}/module').catch(()=>{});
  if(navigator.serviceWorker)navigator.serviceWorker.register('/worker.js').catch(()=>{});
  window.done=true;
 </script>`;
 const browser=await chromium.launch({headless:true,args:[...BROWSER_ARGS]});
 try{
  const context=await createIsolatedContext(browser,{port,source});const page=await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);assert.equal(await page.evaluate(()=>window.done),true);
  await assert.rejects(()=>page.goto(`${target}/redirect`,{timeout:3000}));
  assert.equal(hits,0);await context.close();
 }finally{await browser.close();await new Promise(resolve=>sink.close(resolve));}
});
