import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const source=await readFile('fixtures/fernway/instrumented-v2/index.html','utf8');
test('ID-less radio is truthful, bounded and distinct from body; final healthy and broken focus independently observed',async()=>{
 const browser=await chromium.launch({headless:true});try{for(const variant of ['healthy','broken']){
  const context=await browser.newContext();try{
   await context.route('**/*',r=>r.fulfill({body:source,contentType:'text/html'}));const page=await context.newPage();await page.goto('http://127.0.0.1:31379/?flow=seat&variant='+variant);
   await page.locator('#choose-seat').click();await page.locator('input[type=radio]').first().focus();
   const snapshot=await page.evaluate(()=>window.__tabwiseFocusSnapshot());
   assert.equal(snapshot.active_identity.tag,'input');assert.equal(snapshot.active_identity.input_type,'radio');assert.equal(snapshot.active_identity.id,null);assert.equal(snapshot.active_identity.is_body,false);assert.equal(snapshot.active_identity.role,'radio');assert.ok(snapshot.active_identity.name);assert.ok(snapshot.active_identity.dialogs.length);assert.notEqual(snapshot.active,'body');
   const same=await page.evaluate(()=>window.__tabwiseFocusSnapshot());assert.equal(same.active,snapshot.active);
   await page.locator('#close-seat').click();const end=await page.evaluate(()=>window.__tabwiseFocusSnapshot());
   assert.equal(end.active_identity.is_body,variant==='broken');assert.equal(end.active,variant==='healthy'?'choose-seat':'body');
   const actual=await page.evaluate(()=>document.activeElement===document.body);assert.equal(actual,end.active_identity.is_body);
   const events=await page.evaluate(()=>window.__tabwiseEvents);assert.ok(events.some(e=>e.type==='focusout'));assert.ok(events.every((e,n)=>e.seq===n+1&&e.source==='page-authored'&&e.identity_version===2));
  }finally{await context.close();}
 }}finally{await browser.close();}
});
import {installR2PageRecorder} from '../../src/r2/page-recorder.mjs';
test('native recorder distinguishes missing related nodes and preserves terminal identity with nested dialogs and removal',async()=>{
 const browser=await chromium.launch({headless:true});try{const context=await browser.newContext();try{
  await context.addInitScript(installR2PageRecorder,{session:'offline-identity-v2',identityVersion:2});const page=await context.newPage();await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<dialog open id="outer"><dialog open id="inner"><label>Seat<input type="radio"></label><button id="body">Transient</button></dialog></dialog>'}));await page.goto('http://127.0.0.1:31379/nested');
  await page.locator('input').focus();const snapshot=await page.evaluate(()=>window.__tabwiseR2Journal());
  assert.equal(snapshot.active_identity.tag,'input');assert.equal(snapshot.active_identity.input_type,'radio');assert.equal(snapshot.active_identity.is_body,false);assert.equal(snapshot.active_identity.dialogs.length,2);
  await page.evaluate(()=>{const input=document.querySelector('input');input.blur();input.focus();input.remove();});const final=await page.evaluate(()=>window.__tabwiseR2Journal());
  assert.equal(final.active,'body');assert.equal(final.active_identity.is_body,true);
  assert.ok(final.events.some(e=>['focusin','focusout'].includes(e.type)&&e.related_identity.available===false));
 }finally{await context.close();}}finally{await browser.close();}
});
test('reserved IDs, duplicate IDs, detached related nodes, rapid focus and bounded names remain explicit',async()=>{
 const browser=await chromium.launch({headless:true});try{const context=await browser.newContext();try{
  await context.addInitScript(installR2PageRecorder,{session:'offline-adversarial-identity',identityVersion:2});await context.route('**/*',r=>r.fulfill({body:source,contentType:'text/html'}));const page=await context.newPage();await page.goto('http://127.0.0.1:31379/?flow=seat&variant=broken');
  const data=await page.evaluate(()=>{
   const a=document.createElement('input'),b=document.createElement('input'),detached=document.createElement('button');a.id=b.id='body';a.setAttribute('type','not-a-real-type');a.setAttribute('aria-label','X'.repeat(256));document.body.append(a,b);a.focus();const first=window.__tabwiseR2Journal();b.focus();a.focus();a.blur();a.dispatchEvent(new FocusEvent('focusin',{bubbles:true,relatedTarget:detached}));return {first,last:window.__tabwiseR2Journal(),fixture:window.__tabwiseFocusSnapshot(),actualBody:document.activeElement===document.body};
  });
  assert.equal(data.first.active_identity.input_type,'text');assert.equal(data.first.active_identity.is_body,false);assert.notEqual(data.first.active,'body');assert.equal(data.first.active_identity.name.length,256);assert.equal(data.first.active_identity.name_truncated,false);assert.equal(data.first.active_identity.id_unique,false);
  const inputs=data.last.events.filter(e=>e.type==='focusin'&&e.target_identity?.id==='body');assert.ok(new Set(inputs.map(e=>e.target)).size>=2);assert.equal(data.last.active_identity.is_body,true);assert.equal(data.actualBody,true);assert.equal(data.fixture.active_identity.is_body,true);
  const detached=data.last.events.at(-1);assert.equal(detached.related_identity.connected,false);assert.equal(detached.related_identity.tag,'button');assert.equal(detached.isTrusted,false);assert.notEqual(detached.related,'body');assert.ok(data.last.events.every((e,n)=>e.seq===n+1));
 }finally{await context.close();}}finally{await browser.close();}
});
