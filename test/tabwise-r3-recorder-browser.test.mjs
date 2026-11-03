import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {r2SessionData} from '../scripts/tabwise/r2-run.mjs';
import {sha256} from '../packages/contracts/index.mjs';
import {installR2PageRecorder} from '../src/r2/page-recorder.mjs';
// Browser-only fixture/recorder integration. No NVDA, desktop input or native qualification.
test('shipped Fernway dialog and final focus match the narrow repair oracle identities',async()=>{
 const source=await readFile('fixtures/fernway/index.html','utf8'),browser=await chromium.launch({headless:true});
 try{for(const variant of ['broken','healthy']){
  const context=await browser.newContext();try{
   await context.addInitScript(installR2PageRecorder,{session:'synthetic-browser-recorder'});
   await context.route('**/*',route=>route.fulfill({body:source,contentType:'text/html'}));
   const page=await context.newPage();const data=r2SessionData({spec:{},handleTimeoutMs:1000,focusWaitMs:1000},{id:'fernway-seat',fixture_sha256:sha256(source),query:'?flow=seat&variant=broken',task:[]},Buffer.from(source),'D:/synthetic-browser-evidence');
   await page.goto('http://127.0.0.1:31377/index.html'+(variant==='broken'?data.approved.query:'?flow=seat&variant=healthy'));
   await page.locator('#choose-seat').click();const before=await page.evaluate(()=>window.__tabwiseR2Journal());
   assert.equal(before.state.dialogs.length,1);assert.match(before.state.dialogs[0],/^dialog#[1-9][0-9]*$/);
   await page.getByRole('button',{name:'Close',exact:true}).click();const after=await page.evaluate(()=>window.__tabwiseR2Journal());
   assert.deepEqual(after.state.dialogs,[]);
   if(variant==='healthy')assert.match(after.active,/^choose-seat#[1-9][0-9]*$/);else assert.equal(after.active,'body');
  }finally{await context.close();}
 }}finally{await browser.close();}
});
