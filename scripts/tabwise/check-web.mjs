import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';

const base='http://127.0.0.1:3100',out=resolve(process.argv[2]??'web/.next/qa');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});const measured=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();
 for(const route of ['/','/w/demo','/apps/fernway','/journeys/fernway-passenger/edit','/runs/r1-20261028T134638Z','/r/r1-diagnostic','/status','/w/me','/verifications/pending','/w/me/ops','/runs/00000000-0000-4000-8000-000000000001','/journeys/fernway-seat/edit','/journeys/fernway-search/edit']){
  const response=await page.goto(base+route);assert.equal(response.status(),200,route);
  const axe=await new AxeBuilder({page}).analyze();measured.push({route,violations:axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
 }
 await page.goto(base);await page.screenshot({path:join(out,'landing.png'),fullPage:true});
 await page.goto(base+'/runs/r1-20261028T134638Z');await page.getByRole('tab',{name:'Fix',exact:true}).click();await page.getByRole('heading',{name:'No patch has been generated.'}).waitFor();
 await page.getByRole('tab',{name:'Timeline',exact:true}).click();await page.screenshot({path:join(out,'timeline.png'),fullPage:true});
 await page.goto(base+'/journeys/fernway-passenger/edit');await page.getByRole('button',{name:'Save local version',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved locally'}).waitFor();
 assert.ok(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('tabwise-version:'))));
 await page.getByRole('button',{name:'Clear draft',exact:true}).click();await page.getByRole('button',{name:'Record keys',exact:true}).click();
 // Browser-level keys inside the owned fixture, never desktop input.
 await page.locator('iframe').focus();await page.keyboard.press('Tab');await page.keyboard.type('x');await page.getByRole('heading',{name:'Choose test data'}).waitFor();
 await page.getByRole('button',{name:'AshaTest',exact:true}).click();await page.getByRole('button',{name:'Stop recording',exact:true}).click();
 await page.getByRole('button',{name:'Save local version',exact:true}).click();
 const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('tabwise-journey:fernway-passenger')));
 assert.ok(draft.steps.some(s=>s.text==='AshaTest'));assert.ok(!draft.steps.some(s=>s.text==='x'));
 await context.close();
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true});const small=await mobile.newPage();
 for(const route of ['/','/w/demo','/runs/r1-20261028T134638Z','/r/r1-diagnostic']){await small.goto(base+route);assert.equal(await small.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,`mobile overflow ${route}`);}
 await small.goto(base);await small.screenshot({path:join(out,'landing-mobile.png'),fullPage:true});await mobile.close();
 writeFileSync(join(out,'web-checks.json'),JSON.stringify({measured,recorder:'palette-only local save passed',mobile:'four routes no horizontal overflow'},null,2));
 console.log(JSON.stringify({routes:measured.length,axe_violations:measured.map(r=>({route:r.route,count:r.violations.length})),recorder:'PASS',mobile:'PASS',output:out},null,2));
 assert.equal(measured.flatMap(r=>r.violations).length,0,'axe findings; inspect web-checks.json');
}finally{await browser.close();}
