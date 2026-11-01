// Start a credential-disabled local Next server, then:
// TABWISE_SMOKE_URL=http://127.0.0.1:3101 node --test web/test/web-smoke.browser.mjs
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const base=process.env.TABWISE_SMOKE_URL??'http://127.0.0.1:3101';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Local smoke server required');
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
async function pageFor(t,width=1280){
 const context=await browser.newContext({viewport:{width,height:1000}});t.after(()=>context.close());
 const page=await context.newPage();page.setDefaultTimeout(10000);
 await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 return page;
}
test('public flow: picker, real fixture recording, immediate reload, restore and two versions',async t=>{
 const page=await pageFor(t);await page.goto(base);
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Journeys',exact:true}).click();
 await page.getByRole('link',{name:'Open editor: Passenger details'}).click();
 await page.getByRole('button',{name:'Clear steps',exact:true}).click();
 await page.getByRole('button',{name:'Record keys',exact:true}).click();
 await page.locator('iframe').focus();for(let i=0;i<3;i++)await page.keyboard.press('Tab');
 await expect(page.locator('.step-list > li')).toHaveCount(3);await page.reload();
 await page.getByRole('button',{name:'Restore',exact:true}).click();await expect(page.locator('.step-list > li')).toHaveCount(3);
 await page.getByRole('button',{name:'Save local version',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Saved as version');
 await page.getByRole('button',{name:'Toggle checkpoint for step 1'}).click();
 await page.getByRole('button',{name:'Save local version',exact:true}).click();
 await expect(page.getByRole('button',{name:'View steps',exact:true})).toHaveCount(2);
 await page.reload();await expect(page.locator('.step-list > li')).toHaveCount(3);
 await expect(page.getByRole('button',{name:'Toggle checkpoint for step 1'})).toHaveAttribute('aria-pressed','true');
 for(const width of [375,768]){
  await page.setViewportSize({width,height:1000});await page.getByRole('button',{name:'View steps',exact:true}).first().click();
  await expect(page.getByRole('list',{name:'Saved version steps'})).toBeVisible();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`editor overflow ${width}`);
  await page.getByRole('button',{name:'Close preview',exact:true}).click();
 }
});
test('unavailable auth uses HTML, strips untrusted reasons and offers working navigation',async t=>{
 const page=await pageFor(t);
 const login=await page.request.get(base+'/auth/login',{maxRedirects:0});assert.equal(login.status(),303);
 assert.equal(new URL(login.headers().location).pathname,'/auth/unavailable');
 assert.equal(new URL(login.headers().location).searchParams.get('reason'),'github_oauth_provider_pending');
 await page.goto(base+'/auth/login');await expect(page.getByRole('heading',{level:1})).toHaveText('Sign-in is unavailable');
 const callback=await page.request.get(base+'/auth/callback',{maxRedirects:0});assert.equal(callback.status(),303);
 assert.equal(new URL(callback.headers().location).searchParams.get('reason'),'oauth_code_missing');
 await page.goto(base+'/auth/unavailable?reason='+encodeURIComponent('<script>bad-reason</script>'));
 assert.ok(!(await page.locator('main').innerText()).includes('bad-reason'));
 await page.getByRole('link',{name:'Open the demo',exact:true}).click();await expect(page).toHaveURL(base+'/w/demo');
});
test('workspace routes expose truthful configuration states; mobile menu and trace tabs work',async t=>{
 const page=await pageFor(t,375);
 for(const path of ['/w/me/journeys','/w/me/runs','/w/me/reports','/w/me/ops']){
  assert.equal((await page.goto(base+path)).status(),200);
  await expect(page.getByText(/isn't set up/).first()).toBeVisible();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path);
 }
 await page.getByRole('button',{name:'Menu',exact:true}).click();await expect(page.getByRole('navigation',{name:'Site menu'})).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Menu',exact:true})).toBeFocused();
 await page.goto(base+'/runs/r1-20261028T134638Z');
 const timeline=page.getByRole('tab',{name:'Timeline',exact:true});await timeline.focus();await page.keyboard.press('End');
 await expect(page.getByRole('tab',{name:'Verify',exact:true})).toBeFocused();await expect(page.getByRole('tab',{name:'Verify',exact:true})).toHaveAttribute('aria-selected','true');
 assert.equal((await page.goto(base+'/verifications/abc')).status(),404);
});
test('blocked patch and verification pages state the real reason, not loading or a temporary outage',async t=>{
 const page=await pageFor(t),id='00000000-0000-4000-8000-000000000000';
 await page.goto(base+'/patches/'+id);await expect(page.locator('main').getByRole('alert')).toContainText("Sign-in isn't set up");
 await expect(page.locator('main .chip').first()).toHaveText('Unavailable');
 await page.goto(base+'/verifications/'+id);await expect(page.getByText("Sign-in isn't set up").first()).toBeVisible();
 assert.ok(!(await page.locator('main').innerText()).includes('temporarily unavailable'));
});
