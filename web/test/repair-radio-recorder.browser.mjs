import {test} from 'node:test';import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {installR2PageRecorder} from '../../src/r2/page-recorder.mjs';
test('recorder observes unique radio DOM identity and detects a same-name/value clone despite patched accessors',async()=>{
 const browser=await chromium.launch({headless:true});try{const context=await browser.newContext();await context.addInitScript(installR2PageRecorder,{session:'radio-browser-only',identityVersion:2});const page=await context.newPage();await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<label><input type="radio" name="seat" value="Window"> Window</label><label><input type="radio" name="seat" value="Aisle"> Aisle</label>'}));await page.goto('http://127.0.0.1:31378/');
 const observations=await page.evaluate(()=>{const input=document.querySelector('input');input.focus();const original=window.__tabwiseR2Journal();const clone=input.cloneNode();document.body.append(clone);Element.prototype.getAttribute=()=>null;Document.prototype.querySelectorAll=()=>[];const duplicate=window.__tabwiseR2Journal();return {original,duplicate};});
 assert.equal(observations.original.complete,true);assert.deepEqual(observations.original.active_identity.control_identity,{kind:'named-radio/1',name:'seat',value:'Window',unique:true});assert.equal(observations.duplicate.active_identity.control_identity.unique,false);
 }finally{await browser.close();}
});
