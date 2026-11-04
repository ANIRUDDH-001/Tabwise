import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from '@playwright/test';
const source=readFileSync(new URL('../../fixtures/fernway/instrumented-v2/index.html',import.meta.url),'utf8');
test('symbolic dialog targets survive separately from unavailable DOM identity',async()=>{
 const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();await page.route('**/*',r=>r.fulfill({body:source,contentType:'text/html'}));await page.goto('http://127.0.0.1:31378/?flow=seat&variant=healthy');await page.locator('#choose-seat').click();await page.locator('#close-seat').click();
 const events=await page.evaluate(()=>window.__tabwiseEvents.filter(e=>['dialog-open','dialog-close'].includes(e.type)));
 assert.deepEqual(events.map(e=>e.type),['dialog-open','dialog-close']);for(const e of events){assert.equal(e.logical_target,'seat-dialog');assert.equal(e.target,'unknown');assert.equal(e.target_identity.available,false);assert.equal(e.target_identity.reason,'unavailable');}
 }finally{await browser.close();}
});
test('duplicate IDs and ID-less controls retain distinct actual node keys',async()=>{
 const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();await page.route('**/*',r=>r.fulfill({body:source,contentType:'text/html'}));await page.goto('http://127.0.0.1:31378/?flow=seat');
 const events=await page.evaluate(()=>{for(let i=0;i<2;i++){const b=document.createElement('button');b.id='duplicate';document.body.append(b);b.focus();}const b=document.createElement('button');document.body.append(b);b.focus();return window.__tabwiseEvents.filter(e=>e.type==='focusin').slice(-3);});
 assert.equal(new Set(events.map(e=>e.target_identity.node_key)).size,3);assert.equal(new Set(events.slice(0,2).map(e=>e.target)).size,2);for(const e of events){assert.equal(e.logical_target,null);assert.equal(e.target_identity.available,true);assert.equal(e.target_identity.is_body,false);}assert.equal(events[2].target_identity.id,null);
 }finally{await browser.close();}
});
test('symbolic lookup with duplicate IDs retains logical intent and refuses a DOM association',async()=>{
 const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();await page.route('**/*',r=>r.fulfill({body:source,contentType:'text/html'}));await page.goto('http://127.0.0.1:31378/?flow=seat');await page.evaluate(()=>{for(let i=0;i<2;i++){const n=document.createElement('span');n.id='seat-dialog';document.body.append(n);}});await page.locator('#choose-seat').click();const event=await page.evaluate(()=>window.__tabwiseEvents.find(e=>e.type==='dialog-open'));assert.equal(event.logical_target,'seat-dialog');assert.equal(event.target,'unknown');assert.equal(event.target_identity.available,false);assert.equal(event.target_identity.reason,'ambiguous-id');}finally{await browser.close();}
});
