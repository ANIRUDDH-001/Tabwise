import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {installR2PageRecorder} from '../../src/r2/page-recorder.mjs';
import {readFileSync} from 'node:fs';
import {assessNativeRepair} from '../lib/server/repair-verdict.mjs';
async function run(body,fn,caps={},url='http://127.0.0.1:31378/'){const browser=await chromium.launch({headless:true});try{const c=await browser.newContext();await c.addInitScript(installR2PageRecorder,{session:'adversarial',identityVersion:2,...caps});const p=await c.newPage();await p.route('**/*',r=>r.fulfill({contentType:'text/html',body}));await p.goto(url);return await p.evaluate(fn);}finally{await browser.close();}}
test('recorder ignores page overrides of native DOM identity and name accessors',async()=>{
 const x=await run('<label for="r">Real label</label><input id="r" type="radio">',()=>{
 const n=document.querySelector('input');n.focus();
 for(const [proto,key,value] of [[Document.prototype,'body',n],[Element.prototype,'localName','body'],[Node.prototype,'isConnected',false],[Node.prototype,'parentElement',null],[HTMLInputElement.prototype,'labels',[]]])Object.defineProperty(proto,key,{configurable:true,get:()=>value});
 document.getElementById=()=>document.documentElement;
 Element.prototype.closest=()=>null;
 return window.__tabwiseR2Journal();
 });
 assert.equal(x.active_identity.tag,'input');assert.equal(x.active_identity.is_body,false);assert.equal(x.active_identity.connected,true);assert.equal(x.active_identity.name,'Real label');assert.equal(x.active_identity.name_trust,'page-authored-dom');
});
for(const count of [199,200,256,2048])test(`target with ${count} ID characters never becomes a valid over-bound event`,async()=>{
 const x=await run(`<input><script>window.idLength=${count}</script>`,()=>{const n=document.querySelector('input');n.id='X'.repeat(window.idLength);n.focus();return window.__tabwiseR2Journal();});
 assert(x.events.every(e=>!e.target||e.target.length<=200));
 if(count>=199){assert.equal(x.complete,false);assert(x.reasons.some(r=>r.includes('target')));}
});
test('event and byte caps fail closed and remain incomplete',async()=>{
 for(const caps of [{maxEvents:1},{maxBytes:300}]){
 const x=await run('<input><button>x</button>',()=>{document.querySelector('input').focus();document.querySelector('button').focus();return window.__tabwiseR2Journal();},caps);
 assert.equal(x.complete,false);assert.equal(x.overflow,true);
 }
});
test('duplicate label IDs are explicit and cannot silently select one name',async()=>{
 const x=await run('<span id="label">One</span><span id="label">Two</span><input aria-labelledby="label">',()=>{document.querySelector('input').focus();return window.__tabwiseR2Journal();});
 assert.equal(x.complete,false);assert(x.reasons.some(r=>r.includes('duplicate')));
});
test('over-bound native names are marked incomplete rather than silently accepted',async()=>{
 const x=await run('<input aria-label="'+ 'X'.repeat(1024)+'">',()=>{document.querySelector('input').focus();return window.__tabwiseR2Journal();});
 assert.equal(x.complete,false);assert.equal(x.active_identity.name_truncated,true);assert(x.reasons.some(r=>r.includes('bound')));
});
test('real historical Fernway dialog identities drive the pure oracle in labelled browser controls',async()=>{
 const source=readFileSync(new URL('../../fixtures/fernway/index.html',import.meta.url),'utf8');
 const cap=async healthy=>{
 const browser=await chromium.launch({headless:true});let page;
 try{const context=await browser.newContext();await context.addInitScript(installR2PageRecorder,{session:'fernway-browser-control',identityVersion:2});await context.route('**/*',r=>r.fulfill({body:source,contentType:'text/html'}));const p=await context.newPage();await p.goto('http://127.0.0.1:31378/?flow=seat&variant='+(healthy?'healthy':'broken'));await p.locator('#choose-seat').click();const before=await p.evaluate(()=>window.__tabwiseR2Journal());await p.locator('#close-seat').click();page={before,after:await p.evaluate(()=>window.__tabwiseR2Journal())};}finally{await browser.close();}
 assert.equal(page.after.complete,true);
 // Synthetic envelope only: browser observations cannot qualify native evidence.
 return {source:'nvda',completed:true,outcome:'COMPLETE',reasons:[],records:[{step:'a1',press:'Enter',capture_status:'observed-silence',reasons:[],page}]};
 };
 const baselineCapture=await cap(false),rerunCapture=await cap(true);
 const a={baselineCapture,rerunCapture,baselineEvidence:{lanes:{speech:[]}},rerunEvidence:{lanes:{speech:[]}},steps:[{step:1,key:'Enter'}],oracle:{kind:'focus',step:1}};
 assert.match(baselineCapture.records[0].page.before.state.dialogs[0],/^dialog#/);
 const result=assessNativeRepair(a);assert.equal(result.verdict,'FIXED',JSON.stringify({result,baseline:baselineCapture.records[0].page.after.active_identity,rerun:rerunCapture.records[0].page.after.active_identity}));
 assert.equal(assessNativeRepair({...a,rerunCapture:baselineCapture}).verdict,'NOT_FIXED');
});
