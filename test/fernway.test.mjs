import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Fernway three keyboard flows have healthy semantics, broken variants and zero axe violations',{timeout:30000},async()=>{
  const html=readFileSync(new URL('../fixtures/fernway/index.html',import.meta.url));
  const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true});
  try {
    for(const flow of ['passenger','seat','search']) for(const variant of ['healthy','broken']) {
      const context=await browser.newContext();
      const page=await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}/?flow=${flow}&variant=${variant}`);
      assert.equal((await new AxeBuilder({page}).analyze()).violations.length,0,`${flow}/${variant} initial`);
      if(flow==='passenger') {
        await page.keyboard.press('Tab');await page.keyboard.type('Asha Test');
        await page.keyboard.press('Tab');await page.keyboard.type('invalid-email');
        await page.keyboard.press('Tab');await page.keyboard.press('Enter');
        assert.equal(await page.locator('#email-error').textContent(),'Enter a valid email address to continue.');
        assert.equal(await page.locator('#email-error').getAttribute('role'),variant==='healthy'?'alert':null);
      } else if(flow==='seat') {
        await page.keyboard.press('Tab');await page.keyboard.press('Enter');
        assert.equal(await page.locator('dialog').evaluate(el=>el.open),true);
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(()=>document.activeElement.id),variant==='healthy'?'choose-seat':'');
      } else {
        await page.keyboard.press('Tab');await page.keyboard.press('Enter');
        assert.equal(await page.locator('#search-status').textContent(),'Your train search is ready.');
        assert.equal(await page.locator('#search-status').getAttribute('role'),variant==='healthy'?'status':null);
      }
      assert.equal((await new AxeBuilder({page}).analyze()).violations.length,0,`${flow}/${variant} final`);
      assert.ok(await page.evaluate(()=>window.__tabwiseEvents.length)>0);
      await context.close();
    }
  } finally {await browser.close();await new Promise(r=>server.close(r));}
});
