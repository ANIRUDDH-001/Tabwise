// Exact provider smoke test with an explicitly headless engine wrapper; no NVDA/OS input.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createQualificationBrowser} from '../scripts/tabwise/qualification-providers.mjs';
test('owned qualification page runs its real init journals/network capability checks in a headless browser',{timeout:10000},async()=>{
 let page;
 const engine={launchServer:options=>{assert.equal(options.headless,false);return chromium.launchServer({...options,headless:true});},connect:async endpoint=>{
  const browser=await chromium.connect(endpoint);return {version:()=>browser.version(),close:()=>browser.close(),newContext:async options=>{
   const context=await browser.newContext(options);return {addInitScript:(...args)=>context.addInitScript(...args),route:(...args)=>context.route(...args),routeWebSocket:(...args)=>context.routeWebSocket(...args),close:()=>context.close(),newPage:async()=>{page=await context.newPage();return page;}};
  }};
 }};
 const provider=createQualificationBrowser({chromium:engine,port:4321,nonce:'0123abcd',timeoutMs:3000}),opened=await provider.open();
 try{
  const initial=await opened.read();assert.equal(initial.network_restrictions,true);assert.equal(initial.title,'R1 sign-up 0123abcd');
  await page.evaluate(()=>dispatchEvent(new KeyboardEvent('keydown',{key:'Control',ctrlKey:true})));
  const events=await opened.keys(0);assert.equal(events.length,1);assert.equal(events[0].key,'Control');assert.equal((await opened.keys(events[0].seq)).length,0);
  await page.evaluate(()=>{document.title='foreign title';});await assert.rejects(()=>opened.read(),/identity/);
  console.log(`Qualification provider capability check: Chromium ${opened.version}; headless synthetic events only; whole-VM egress unverified`);
 }finally{await opened.close();}
});
