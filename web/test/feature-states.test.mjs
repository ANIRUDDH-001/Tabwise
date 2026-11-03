import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FEATURES,flowSteps,isUsable,TONE} from '../lib/feature-states.mjs';
test('only local recording is presented as usable; every gated feature explains why and links to status',()=>{
 assert.deepEqual(FEATURES.filter(f=>f.state==='available').map(f=>f.id),['recording']);
 for(const f of FEATURES){assert.ok(f.reason.length>20);assert.ok(f.href.startsWith('/'));assert.ok(TONE[f.state]);if(f.state!=='available')assert.equal(f.href,'/status');assert.doesNotMatch(f.chip,/pending/i);}
 assert.equal(isUsable('live-runs'),false);assert.equal(isUsable('spark'),false);
});
test('flow strip shows Spark as off and runs as gated',()=>{
 const steps=flowSteps();assert.equal(steps.length,4);assert.equal(steps[2].feature.state,'off');assert.equal(steps[1].feature.state,'gated');
});
test('D8: no journey list or landing page promises a pending run',()=>{
 for(const file of ['components/JourneyList.tsx','app/page.tsx','app/w/demo/page.tsx'])assert.doesNotMatch(readFileSync(new URL(`../${file}`,import.meta.url),'utf8'),/Run pending/,file);
});
