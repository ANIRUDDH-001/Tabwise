// Browser-only synthetic transport controls; no native result is asserted here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const base=process.env.TABWISE_BROWSER_BASE??'http://127.0.0.1:3137',id='32e02e48-78a1-463d-9107-0b5b7048d3dd',next='a0000000-0000-4000-8000-000000000001';
test('approved candidate repair is visible, keyboard reachable and recovers the same request key',async()=>{
 const browser=await chromium.launch({headless:true});try{for(const width of [1280,390]){
 const page=await browser.newPage({viewport:{width,height:850}}),keys=[];
 await page.route('**/api/candidate-runs/'+id,r=>r.fulfill({json:{product_run_id:id,journey_version_id:next,state:'EVIDENCE_READY',github_run_id:'41891175195'}}));
 await page.route('**/api/candidate-runs/'+id+'/evidence',r=>r.fulfill({json:{classification:'NONPRODUCTION_UNQUALIFIED',production_qualified:false,revision:'synthetic-browser-only',run_manifest_sha256:'a'.repeat(64),runtime:{profile:'synthetic',nvda_version:'synthetic'},rows:[]}}));
 await page.route('**/api/candidate-runs/'+id+'/repair',r=>{if(r.request().method()==='GET')return r.fulfill({json:{diff:'-opener.blur();\n+opener.focus();',review:{decision:'approved',decision_text:'Approve this exact focus-restoration patch',patch_sha256:'a'.repeat(64),model_basis_run_id:'synthetic-browser-only'}}});keys.push(r.request().headers()['idempotency-key']);return r.fulfill({status:503,json:{reason:'synthetic_interrupted_response'}});});
 await page.goto(base+'/candidate-runs/'+id);
 await expect(page.getByRole('heading',{name:'Approved focus repair'})).toBeVisible();
 const button=page.getByRole('button',{name:'Prepare approved repair rerun'});await button.focus();await page.keyboard.press('Enter');
 await expect(page.getByText('The approved rerun could not be prepared. Retry this same request.')).toBeVisible();await button.click();
 await expect.poll(()=>keys.length).toBe(2);assert.equal(keys[0],keys[1]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 await page.close();
 }}finally{await browser.close();}
});
test('completed repair navigation opens the existing rerun without allocating another request',async()=>{
 const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();let writes=0;
 await page.route('**/api/candidate-runs/'+id,r=>r.fulfill({json:{product_run_id:id,journey_version_id:next,state:'EVIDENCE_READY',github_run_id:'41891175195'}}));
 await page.route('**/api/candidate-runs/'+id+'/evidence',r=>r.fulfill({json:{classification:'NONPRODUCTION_UNQUALIFIED',production_qualified:false,revision:'synthetic',run_manifest_sha256:'a'.repeat(64),runtime:{profile:'synthetic',nvda_version:'synthetic'},rows:[]}}));
 await page.route('**/api/candidate-runs/'+id+'/repair',r=>{if(r.request().method()==='POST')writes++;return r.fulfill({json:{existing_run_id:next,diff:'synthetic diff',review:{decision:'approved',decision_text:'Approve this exact focus-restoration patch',patch_sha256:'a'.repeat(64),model_basis_run_id:id}}});});
 await page.goto(base+'/candidate-runs/'+id);await expect(page.getByRole('link',{name:'Open approved repair rerun'})).toHaveAttribute('href','/candidate-runs/'+next);await expect(page.getByRole('button',{name:'Prepare approved repair rerun'})).toHaveCount(0);assert.equal(writes,0);
 }finally{await browser.close();}
});
