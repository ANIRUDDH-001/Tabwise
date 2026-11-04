// Synthetic UI controls only; no genuine NVDA, authentication or qualification.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const base='http://localhost:3137',id='00000000-0000-4000-8000-000000000011',version='00000000-0000-4000-8000-000000000021';
test('candidate desktop/mobile timeline retains qualification boundary and original references',async()=>{
 const browser=await chromium.launch({headless:true});
 try{for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:900}});let imports=0,state='RUN_BOUND';
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.route('**/api/candidate-runs/'+id,r=>r.fulfill({json:{product_run_id:id,journey_version_id:version,state,github_run_id:'123'}}));
  await page.route('**/api/candidate-runs/'+id+'/evidence',r=>{if(r.request().method()==='POST'){imports++;return r.fulfill({status:409,json:{reason:'candidate_evidence_unavailable'}});}return r.fulfill({json:{classification:'NONPRODUCTION_UNQUALIFIED',production_qualified:false,revision:'a'.repeat(40),run_manifest_sha256:'b'.repeat(64),runtime:{profile:'A15',nvda_version:'2026.1'},rows:[{pointer:{path:'candidate-seat/capture.json',pointer:'/raw/0'},row:{lane:'speech',event:{step:5,evidence_ref:'r2:speech:1',clock:'node-monotonic-ms',t:42,seq:1,kind:'speech',text:'Synthetic dialog speech',target:null}}}]}});});
  await page.goto(base+'/candidate-runs/'+id);await expect(page.getByText('Nonproduction · Unqualified',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Import completed observations'}).click();await expect(page.getByRole('status')).toContainText('could not be confirmed');assert.equal(imports,1);await expect(page.getByRole('heading',{name:'Speech',exact:true})).toHaveCount(0);
  state='EVIDENCE_READY';await page.getByRole('button',{name:'Refresh status'}).click();await expect(page.getByText('Synthetic dialog speech',{exact:true})).toBeVisible();
  await page.getByText('Original reference',{exact:true}).click();await expect(page.getByText('candidate-seat/capture.json/raw/0',{exact:false})).toBeVisible();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'horizontal overflow');
  await page.reload();await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('#main')).toBeFocused();
  await page.close();
 }}finally{await browser.close();}
});
test('candidate preparation reuses its saved idempotency key after interrupted response',async()=>{
 const browser=await chromium.launch({headless:true});
 try{const page=await browser.newPage(),keys=[];
 await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await page.route('**/api/candidate-runs',r=>{keys.push(r.request().headers()['idempotency-key']);return r.fulfill({status:409,json:{reason:'candidate_request_conflict'}});});
 await page.goto(base+'/candidate-runs/new?version='+version);await page.getByRole('button',{name:'Save candidate request'}).click();await expect(page.getByRole('status')).toContainText('could not be confirmed');
 await page.reload();await page.getByRole('button',{name:'Save candidate request'}).click();await expect(page.getByRole('status')).toContainText('could not be confirmed');assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
 }finally{await browser.close();}
});
test('owned saved version leads to candidate preparation and a resumable workspace link',async()=>{
 const browser=await chromium.launch({headless:true});
 try{const page=await browser.newPage();await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await page.route('**/api/journeys/versions/'+version,r=>r.fulfill({json:{id:version,journey_id:'fernway-seat',n:1,sha256:'a'.repeat(64),created_at:'2026-11-04T00:00:00Z',steps:['Tab','Enter','Tab','Tab','Enter'].map((key,n)=>({step:n+1,key,text:null,checkpoint:true}))}}));
 await page.route('**/api/candidate-runs',r=>r.fulfill({json:{product_run_id:id}}));
 await page.route('**/api/candidate-runs/'+id,r=>r.fulfill({json:{product_run_id:id,journey_version_id:version,state:'PREPARED',github_run_id:null}}));
 await page.route('**/api/workspace',r=>r.fulfill({json:{catalog:[],versions:[],runs:[],candidates:[{product_run_id:id,state:'PREPARED',classification:'NONPRODUCTION_UNQUALIFIED',production_qualified:false}]}}));
 await page.goto(base+'/journeys/versions/'+version);await page.getByRole('link',{name:'Prepare candidate test'}).click();await page.getByRole('button',{name:'Save candidate request'}).click();await expect(page.getByRole('heading',{name:'Candidate test',exact:true})).toBeVisible();await expect(page.getByRole('status')).toContainText('authorization is still required');
 await page.goto(base+'/w/me/runs');await page.getByRole('link',{name:'Candidate '+id.slice(0,8),exact:true}).click();await expect(page.getByRole('heading',{name:'Candidate test',exact:true})).toBeVisible();
 }finally{await browser.close();}
});
