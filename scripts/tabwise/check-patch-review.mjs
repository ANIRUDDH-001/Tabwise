// Owned local headless QA only. Synthetic API fixtures are never product/demo evidence.
import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {sha256} from '../../packages/contracts/index.mjs';
const id='00000000-0000-4000-8000-000000000061',base='http://127.0.0.1:3100';
const diff='--- a/index.html\n+++ b/index.html\n@@ -1 +1 @@\n-<p>Seat</p>\n+<p role="status">Seat</p>\n';
const patch={patch_id:id,run_id:'00000000-0000-4000-8000-000000000060',status:'proposed',diff,files:['index.html'],patch_sha256:sha256(diff),base_sha256:'a'.repeat(64),rationale:'Synthetic keyboard QA, not a real proposal.',expected_speech_after:['Synthetic predicted speech'],finding:{title:'Synthetic review fixture',mechanism:'Owned UI test data only.',evidence_refs:['key:1'],confidence:'low'},validation:{ok:true,errors:[]},reviewed_at:null};
const browser=await chromium.launch({headless:true});
try{
 for(const mode of ['approve','reject','stale','unavailable']){
  const context=await browser.newContext(),page=await context.newPage(),posts=[];
  await page.route(`**/api/patches/${id}`,async route=>{
   if(mode==='unavailable')return route.fulfill({status:503,json:{reason:'configuration_pending'}});
   if(route.request().method()==='POST'){
    const body=route.request().postDataJSON();posts.push(body);assert.equal(body.patch_sha256,patch.patch_sha256);
    return route.fulfill({json:{patch_id:id,status:body.decision,dispatch:false}});
   }
   return route.fulfill({json:{...patch,validation:mode==='stale'?{ok:false,errors:['stale_patch_source']}:patch.validation}});
  });
  await page.goto(`${base}/patches/${id}`);
  if(mode==='unavailable')await page.getByRole('heading',{name:'Patch unavailable',exact:true}).waitFor();
  else{
   await page.getByRole('heading',{name:patch.finding.title}).waitFor();
   assert.equal(await page.getByRole('region',{name:'Proposed patch diff'}).textContent(),diff);
   const approve=page.getByRole('button',{name:'Approve this change'}),reject=page.getByRole('button',{name:'Reject change'});
   if(mode==='stale'){assert.equal(await approve.isDisabled(),true);assert.equal(await reject.isDisabled(),true);}
   else{
    const target=mode==='approve'?approve:reject;
    for(let attempt=0;attempt<40&&!await target.evaluate(e=>e===document.activeElement);attempt++)await page.keyboard.press('Tab');
    assert.equal(await target.evaluate(e=>e===document.activeElement),true);await page.keyboard.press('Enter');
    await page.getByRole('status').filter({hasText:mode==='approve'?'Approval saved':'Rejection saved'}).waitFor();
    assert.equal(posts.length,1);assert.equal(posts[0].decision,mode==='approve'?'approved':'rejected');assert.equal(await approve.isDisabled(),true);
   }
  }
  assert.equal((await new AxeBuilder({page}).analyze()).violations.length,0,mode);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${mode} mobile`);
  await context.close();
 }
 const context=await browser.newContext(),page=await context.newPage();
 await page.route(`**/api/runs/${id}`,route=>route.fulfill({json:{run_id:id,status:'failed',reason:'worker_failed',evidence_status:'incomplete',diagnostic_evidence_available:true,patches:[],stages:[]}}));
 await page.goto(`${base}/runs/${id}`);await page.getByText('Partial diagnostics were retained. They are INCONCLUSIVE and cannot establish a repair.',{exact:true}).waitFor();
 assert.equal((await new AxeBuilder({page}).analyze()).violations.length,0,'retained failed-run diagnostics');await context.close();
 console.log('PASS synthetic local patch review: keyboard approve/reject, stale refusal, unavailable/failed-diagnostics states, axe0 and mobile; no dispatch');
}finally{await browser.close();}
