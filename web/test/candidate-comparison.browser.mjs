// Synthetic UI controls only, not a native repair assertion.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const base=process.env.TABWISE_BROWSER_BASE??'http://127.0.0.1:3137',id='3de4c6ce-8e3b-4ef8-8176-ff989d3e41b1',baseline='32e02e48-78a1-463d-9107-0b5b7048d3dd';
test('candidate report preserves all four verdicts and shows inconclusive checks without a passing claim',async()=>{
 const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:390,height:850}});let verdict='INCONCLUSIVE',saved=false;
 await page.route('**/api/candidate-runs/'+id,r=>r.fulfill({json:{product_run_id:id,journey_version_id:baseline,state:'EVIDENCE_READY',github_run_id:'41893882465',repair:{baseline_run_id:baseline,patch_sha256:'a'.repeat(64),source_sha256:'b'.repeat(64)}}}));
 await page.route('**/api/candidate-runs/'+id+'/evidence',r=>r.fulfill({json:{classification:'NONPRODUCTION_UNQUALIFIED',production_qualified:false,revision:'synthetic',run_manifest_sha256:'a'.repeat(64),runtime:{profile:'synthetic',nvda_version:'synthetic'},rows:[]}}));
 await page.route('**/api/candidate-runs/'+id+'/comparison',r=>{if(r.request().method()==='POST')saved=true;if(!saved)return r.fulfill({status:404,json:{reason:'candidate_comparison_pending'}});return r.fulfill({json:{verdict,reason:'Synthetic control: protected identity not established.',baseline_run_id:baseline,patch_sha256:'a'.repeat(64),observed_terminal_focus:{baseline:'body',rerun:'choose-seat#1'},checks:{symptom_gone:null,other_steps_preserved:null,evidence_complete:false}}});});
 await page.goto(base+'/candidate-runs/'+id);const button=page.getByRole('button',{name:'Compare baseline and rerun'});await button.focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{name:'INCONCLUSIVE',exact:true})).toBeVisible();await expect(page.getByText('Not established',{exact:true})).toHaveCount(2);
 for(verdict of ['FIXED','NOT_FIXED','REGRESSED']){await page.reload();await expect(page.getByRole('heading',{name:verdict.replaceAll('_',' '),exact:true})).toBeVisible();}
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 }finally{await browser.close();}
});
