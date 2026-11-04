// Synthetic UI/API controls only. No native dispatch, approval, credentials or qualification.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const base='http://localhost:3137',id='00000000-0000-4000-8000-000000000011';
test('native request actions follow server capabilities and failed ingestion preserves unverified state',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage(),calls=[];let state={state:'PREPARED',message:'Synthetic saved request',can_dispatch:true,can_ingest:false,native_qualified:false,request_sha256:'a'.repeat(64)};
  await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.route(`**/api/runs/${id}`,route=>route.fulfill({json:{run_id:id,status:'admitted',stages:[],patches:[],evidence_status:'pending'}}));
  await page.route(`**/api/runs/${id}/evidence*`,route=>route.fulfill({json:{events:[],references:[],evidence_status:'pending'}}));
  await page.route(`**/api/runs/${id}/native-request`,route=>route.fulfill({json:state}));
  await page.route(`**/api/runs/${id}/native-dispatch`,route=>{calls.push('dispatch');state={...state,state:'RUN_BOUND',message:'Synthetic source-bound worker',can_dispatch:false,can_ingest:true};return route.fulfill({json:{state:'DISPATCH_ACCEPTED'}});});
  await page.route(`**/api/runs/${id}/native-ingest`,route=>{calls.push('ingest');return route.fulfill({status:409,json:{reason:'synthetic_integrity_refusal'}});});
  await page.goto(base+'/runs/'+id);
  await expect(page.getByRole('button',{name:'Request native run',exact:true})).toBeVisible();
  assert.deepEqual(calls,[]);
  await page.getByRole('button',{name:'Request native run',exact:true}).click();
  await expect(page.getByRole('button',{name:'Retrieve and check evidence',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Request native run',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Retrieve and check evidence',exact:true}).click();
  await expect(page.getByText('Evidence could not be accepted.',{exact:false})).toBeVisible();
  assert.deepEqual(calls,['dispatch','ingest']);
  state={...state,can_dispatch:false,can_ingest:false,message:'Synthetic disabled qualification'};
  await page.getByRole('button',{name:'Refresh request',exact:true}).click();
  await expect(page.getByRole('button',{name:'Retrieve and check evidence',exact:true})).toHaveCount(0);
 }finally{await browser.close();}
});
test('native evidence action updates when live run status changes without manual refresh',async()=>{
 const browser=await chromium.launch({headless:true});let status='dispatched',reads=0;
 try{const page=await browser.newPage();await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 await page.route(`**/api/runs/${id}`,route=>route.fulfill({json:{run_id:id,status,stages:[],patches:[],evidence_status:'pending'}}));
 await page.route(`**/api/runs/${id}/evidence*`,route=>route.fulfill({json:{events:[],references:[],evidence_status:'pending'}}));
 await page.route(`**/api/runs/${id}/native-request`,route=>{reads++;return route.fulfill({json:{state:'RUN_BOUND',message:'Synthetic bound worker',can_dispatch:false,can_ingest:status==='uploading',native_qualified:false}});});
 await page.goto(base+'/runs/'+id);await expect(page.getByText('Synthetic bound worker',{exact:true})).toBeVisible();assert.equal(reads,1);await expect(page.getByRole('button',{name:'Retrieve and check evidence',exact:true})).toHaveCount(0);
 status='uploading';await expect(page.getByRole('button',{name:'Retrieve and check evidence',exact:true})).toBeVisible({timeout:12000});assert.equal(reads,2);
 }finally{await browser.close();}
});
