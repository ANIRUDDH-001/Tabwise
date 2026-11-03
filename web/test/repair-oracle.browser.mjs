// Credential-disabled browser regression with explicitly synthetic UI/API fixtures.
// No real approval, database write, workflow dispatch, NVDA or desktop input.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const base=process.env.TABWISE_SMOKE_URL??'http://localhost:3137';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('local browser server required');
test('patch check requires explicit input and owned readback; lost response and stale readback fail closed',async()=>{
 const id='00000000-0000-4000-8000-000000000121';let oracle=null,posts=0,reruns=0;
 const patch={patch_id:id,run_id:'00000000-0000-4000-8000-000000000122',journey_id:'fernway-seat',journey_version_id:'00000000-0000-4000-8000-000000000123',status:'approved',diff:'Synthetic browser-only diff',files:['index.html'],base_sha256:'a'.repeat(64),patch_sha256:'b'.repeat(64),rationale:'Synthetic UI fixture',expected_speech_after:[],finding:{title:'Synthetic focus fixture',step:2,mechanism:'Synthetic review state',evidence_refs:[],confidence:'low'},validation:{ok:true,errors:[]},reviewed_at:null,application:{id:'synthetic-candidate',source_sha256:'c'.repeat(64),created_at:''},application_available:true};
 const browser=await chromium.launch({headless:true});try{const context=await browser.newContext();const page=await context.newPage();
  await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.route(`**/api/patches/${id}`,route=>route.fulfill({json:{...patch,oracle,oracle_available:true}}));
  await page.route(`**/api/patches/${id}/oracle`,async route=>{posts++;const body=route.request().postDataJSON();assert.deepEqual(body,{kind:'focus',step:2,review_ref:'Synthetic owner UI review',base_sha256:patch.base_sha256,patch_sha256:patch.patch_sha256});oracle={patch_id:id,baseline_run_id:patch.run_id,base_sha256:patch.base_sha256,kind:'focus',step:2,user_id:'synthetic-owner',reviewed_by:'synthetic-owner',review_ref:body.review_ref};await route.fulfill({status:503,json:{reason:'oracle_registration_refused'}});});
  await page.route('**/api/runs',route=>{reruns++;return route.fulfill({status:503,json:{reason:'worker_review_and_execution_approval_pending'}});});
  await page.goto(base+'/patches/'+id);const rerun=page.getByRole('button',{name:'Request qualified rerun',exact:true});await expect(rerun).toBeDisabled();
  const freeze=page.getByRole('button',{name:'Freeze reviewed check',exact:true});await expect(freeze).toBeDisabled();assert.equal(posts,0);assert.equal(reruns,0);
  await page.getByLabel('Check to measure').selectOption('focus');await page.getByLabel('Your review reference').fill('Synthetic owner UI review');await freeze.click();
  await expect(page.getByRole('region',{name:'Rerun check review'}).getByRole('alert')).toContainText('Reload');await expect(rerun).toBeDisabled();assert.equal(posts,1);assert.equal(reruns,0);
  await page.getByRole('button',{name:'Reload stored check',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Frozen check: focus'})).toBeVisible();await expect(rerun).toBeEnabled();
  await rerun.click();await expect(page.getByRole('alert').filter({hasText:'Live runs are gated'})).toBeVisible();assert.equal(reruns,1);
  oracle={...oracle,base_sha256:'d'.repeat(64)};await page.getByRole('button',{name:'Reload stored check',exact:true}).click();await expect(rerun).toBeDisabled();await expect(page.getByText('Stored check status is unavailable. Rerun admission remains blocked.')).toBeVisible();
 }finally{await browser.close();}
});
