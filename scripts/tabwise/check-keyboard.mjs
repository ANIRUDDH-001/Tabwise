import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext(),page=await context.newPage();
 async function tabTo(locator){for(let i=0;i<100;i++){if(await locator.evaluate(el=>el===document.activeElement))return;await page.keyboard.press('Tab');}throw Error('Keyboard target unreachable');}
 await page.goto('http://127.0.0.1:3100/');
 await tabTo(page.getByRole('link',{name:'Workspace',exact:true}));await page.keyboard.press('Enter');await page.waitForURL('**/w/demo');
 await tabTo(page.getByRole('link',{name:/Passenger details/}));await page.keyboard.press('Enter');await page.waitForURL('**/journeys/fernway-passenger/edit');
 await tabTo(page.getByRole('button',{name:'Clear draft',exact:true}));await page.keyboard.press('Enter');
 await tabTo(page.getByRole('button',{name:'Record keys',exact:true}));await page.keyboard.press('Enter');
 await page.keyboard.press('Tab');
 assert.equal(await page.frames()[1].evaluate(()=>document.activeElement.id),'name','recording must start at the first app control');
 await page.keyboard.type('x');await page.getByRole('heading',{name:'Choose test data'}).waitFor({timeout:3000});
 await tabTo(page.getByRole('button',{name:'AshaTest',exact:true}));await page.keyboard.press('Enter');
 await tabTo(page.getByRole('button',{name:'Stop recording',exact:true}));await page.keyboard.press('Enter');
 await tabTo(page.getByRole('button',{name:'Save local version',exact:true}));await page.keyboard.press('Enter');
 await page.getByRole('status').filter({hasText:'Saved locally'}).waitFor();
 const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('tabwise-journey:fernway-passenger')));
 assert.equal(draft.steps[0].key,'Tab');assert.ok(draft.steps.some(s=>s.text==='AshaTest'));assert.ok(!draft.steps.some(s=>s.text==='x'));
 console.log('PASS keyboard-only landing → workspace → recorder → palette → immutable local save');
 await context.close();
}finally{await browser.close();}
