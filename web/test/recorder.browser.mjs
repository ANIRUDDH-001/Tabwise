// Run separately: node --test web/test/recorder.browser.mjs
// Actual React DOM lifecycle, isolated browser storage, no backend or desktop input.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url);
const {webpack}=require('next/dist/compiled/webpack/webpack');
let browser,bundle,css,scratch;
before(async()=>{
 scratch=await mkdtemp(join(tmpdir(),'tabwise-recorder-'));
 const loader=join(scratch,'loader.cjs'),entry=join(scratch,'entry.mjs');
 await writeFile(loader,`const swc=require(${JSON.stringify(require.resolve('next/dist/build/swc'))});module.exports=function(source){return swc.transformSync(source,{filename:this.resourcePath,jsc:{parser:{syntax:'typescript',tsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'es6'}}).code;};`);
 await writeFile(entry,`import {createElement} from 'react';import {createRoot} from 'react-dom/client';import Recorder from ${JSON.stringify(join(root,'web/components/Recorder.tsx'))};const root=createRoot(document.getElementById('root'));window.renderRecorder=(id,flow)=>root.render(createElement(Recorder,{id,flow}));window.renderRecorder('fernway-passenger','passenger');`);
 await new Promise((accept,reject)=>{
  const compiler=webpack({mode:'development',devtool:false,entry,output:{path:scratch,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js','.mjs'],modules:[join(root,'web/node_modules'),join(root,'node_modules')],alias:{'@tabwise/contracts':join(root,'packages/contracts')}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader}]}});
  compiler.run((error,stats)=>compiler.close(()=>error||stats.hasErrors()?reject(error??Error(stats.toString({all:false,errors:true}))):accept()));
 });
 bundle=await readFile(join(scratch,'bundle.js'),'utf8');css=await readFile(join(root,'web/app/globals.css'),'utf8');
 browser=await chromium.launch({headless:true});
});
after(async()=>{
 await browser?.close();
 if(scratch){
  if(dirname(resolve(scratch))!==resolve(tmpdir())||!basename(scratch).startsWith('tabwise-recorder-'))throw Error('Unexpected temporary test directory');
  await rm(scratch,{recursive:true,force:true});
 }
});
async function editor(t,width=1280){
 const context=await browser.newContext({viewport:{width,height:1000},hasTouch:true});t.after(()=>context.close());
 const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',error=>console.error('Recorder browser error:',error.message));
 await page.route('**/*',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/bundle.js')return route.fulfill({contentType:'text/javascript',body:bundle});
  if(path==='/fernway')return route.fulfill({contentType:'text/html',body:'<button>Fixture</button><script>window.__tabwiseSetRecording=()=>{};<\/script>'});
  if(path!=='/')return route.abort();
  return route.fulfill({contentType:'text/html',body:`<style>${css}</style><main class="workspace-main"><div id="root"></div></main><script>window.process={env:{NODE_ENV:'development'}};</script><script src="/bundle.js"></script>`});
 });
 await page.goto('http://127.0.0.1:3199/');await page.getByRole('button',{name:'Save local version',exact:true}).waitFor({state:'attached'});
 return page;
}
const stepCount=page=>page.locator('.step-list > li').count();
async function recordOne(page){
 await page.getByRole('button',{name:'Clear steps',exact:true}).click();await page.getByRole('button',{name:'Record keys',exact:true}).click();
 await page.frames()[1].evaluate(()=>parent.postMessage({type:'tabwise-key',key:'Tab'},location.origin));
 await page.waitForFunction(()=>document.querySelectorAll('.step-list > li').length===1);
 await page.getByRole('button',{name:'Stop recording',exact:true}).click();
}
async function savedVersion(page){
 await page.getByRole('button',{name:'Save local version',exact:true}).click();
 await page.getByRole('button',{name:'Load into editor',exact:true}).first().waitFor({state:'attached'});
}
test('A: refused draft write aborts version switching and retains current steps',async t=>{
 const page=await editor(t);await savedVersion(page);await recordOne(page);
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('denied','SecurityError');};});
 page.on('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Load into editor',exact:true}).click();
 await page.waitForTimeout(100);assert.equal(await stepCount(page),1);
 assert.match(await page.locator('[role="status"]').innerText(),/couldn't.*load|not loaded/i);
});
test('B: failed index write never reports success or clears the unsaved draft',async t=>{
 const page=await editor(t);await recordOne(page);
 await page.evaluate(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('tabwise-versions:'))throw new DOMException('full','QuotaExceededError');return set.call(this,key,value);};});
 await page.getByRole('button',{name:'Save local version',exact:true}).click();await page.waitForTimeout(150);
 assert.doesNotMatch(await page.locator('[role="status"]').innerText(),/^Saved/);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('tabwise-draft:fernway-passenger')).steps.length),1);
 assert.equal(await stepCount(page),1);
});
test('C: rerendering the same Recorder for another journey isolates state and listener writes',async t=>{
 const page=await editor(t);await recordOne(page);
 await page.evaluate(()=>window.renderRecorder('fernway-seat','seat'));
 await page.waitForFunction(()=>document.querySelector('iframe').getAttribute('src').includes('flow=seat'));
 assert.equal(await stepCount(page),5,'new journey starts with its own steps');
 await recordOne(page);
 const drafts=await page.evaluate(()=>['fernway-passenger','fernway-seat'].map(id=>JSON.parse(localStorage.getItem(`tabwise-draft:${id}`))));
 assert.deepEqual(drafts.map(d=>[d.journeyId,d.steps.length]),[['fernway-passenger',1],['fernway-seat',1]]);
 await page.evaluate(()=>window.renderRecorder('fernway-passenger','passenger'));
 await page.getByRole('region',{name:'Unsaved draft'}).waitFor();
 await page.getByRole('button',{name:'Restore',exact:true}).click();assert.equal(await stepCount(page),1);
});
for(const width of [375,768])test(`D: local-version read-only actions at ${width}px are visible and fit`,async t=>{
 const page=await editor(t);await savedVersion(page);await page.setViewportSize({width,height:1000});
 const view=page.getByRole('button',{name:'View steps',exact:true});await view.waitFor({timeout:2000});
 await view.focus();await page.keyboard.press('Enter');
 await page.getByRole('list',{name:'Saved version steps'}).waitFor();
 assert.equal(await page.getByRole('list',{name:'Saved version steps'}).locator(':scope > li').count(),6);
 await page.getByRole('button',{name:'Close preview',exact:true}).tap();await view.tap();
 await page.getByRole('list',{name:'Saved version steps'}).waitFor();assert.equal(await stepCount(page),6,'preview never replaces editor steps');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 if(width===375)assert.ok(await page.getByText('Recording needs a wider screen',{exact:false}).isVisible());
});
