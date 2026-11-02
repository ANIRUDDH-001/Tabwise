import {test} from 'node:test';import assert from 'node:assert/strict';
import {primaryNavigation,topNavigation,isActive,activeHref,sectionFor,currentInList,breadcrumbsFor,R1_RUN_ID} from '../lib/site-navigation.mjs';
const UUID='0f8fad5b-d9cb-469f-a165-70867728950e';
// Every route from plan A.6 with its expected section.
const ROUTES={
 '/':'public','/w/demo':'demo','/w/me':'workspace','/w/me/ops':'workspace','/w/me/journeys':'workspace','/w/me/runs':'workspace','/w/me/reports':'workspace',
 '/apps/fernway':'demo','/journeys':'demo','/journeys/fernway-passenger/edit':'demo',[`/journeys/versions/${UUID}`]:'workspace',
 [`/runs/${R1_RUN_ID}`]:'demo',[`/runs/${UUID}`]:'workspace',[`/runs/${UUID}/report`]:'workspace','/r/r1-diagnostic':'demo',
 [`/patches/${UUID}`]:'workspace',[`/verifications/${UUID}`]:'workspace','/status':'status','/auth/unavailable':'workspace',
};
const lists=()=>[...primaryNavigation().map(g=>g.items.map(i=>i.href)),primaryNavigation().flatMap(g=>g.items.map(i=>i.href)),topNavigation().flatMap(g=>g.items.map(i=>i.href))];
test('every route maps to exactly one expected section',()=>{for(const [route,section] of Object.entries(ROUTES))assert.equal(sectionFor(route),section,route);});
test('isActive: exact for roots, segment prefix otherwise, never on query or hash',()=>{
 assert.equal(isActive('/w/me','/w/me'),true);assert.equal(isActive('/w/me','/w/me/runs'),false);
 assert.equal(isActive('/w/me/runs','/w/me/runs'),true);assert.equal(isActive('/w/me/runs','/w/me/runs/'),true);
 assert.equal(isActive('/journeys','/journeys/fernway-seat/edit'),true);assert.equal(isActive('/journeys','/journeysx'),false);
 assert.equal(isActive('/','/status'),false);assert.equal(isActive('/w/me#runs','/w/me'),false);assert.equal(isActive('/w/me/runs','/w/me?tab=runs'),false);
 assert.equal(isActive('/status','/status?x=1#y'),true);
});
test('REV-05: within every navigation list at most one item is exactly active, and exactly one when the route is represented',()=>{
 for(const route of Object.keys(ROUTES))for(const hrefs of lists()){
  const active=hrefs.filter(h=>h===activeHref(hrefs,route));assert.ok(active.length<=1,route);
  if(hrefs.includes(route))assert.equal(activeHref(hrefs,route),route,`${route} in ${hrefs}`);
 }
});
test('detail pages highlight their parent item without claiming to be that page',()=>{
 const work=primaryNavigation().find(g=>g.id==='workspace').items.map(i=>i.href);
 assert.deepEqual(currentInList(work,`/runs/${UUID}`),{href:'/w/me/runs',exact:false});
 assert.deepEqual(currentInList(work,`/runs/${UUID}/report`),{href:'/w/me/reports',exact:false});
 assert.deepEqual(currentInList(work,`/journeys/versions/${UUID}`),{href:'/w/me/journeys',exact:false});
 assert.deepEqual(currentInList(work,'/w/me/runs'),{href:'/w/me/runs',exact:true});
 assert.equal(currentInList(work,'/w/demo'),null);
});
test('no navigation surface contains hash links or hard-coded journeys',()=>{
 for(const hrefs of lists())for(const href of hrefs){assert.ok(!href.includes('#'),href);assert.ok(!href.includes('/edit'),href);}
 const groups=primaryNavigation().map(g=>g.label);assert.deepEqual(groups,['Demo','Your workspace','Status']);
});
test('journeys link is active on the picker and every editor',()=>{
 const top=topNavigation().flatMap(g=>g.items.map(i=>i.href));
 assert.equal(activeHref(top,'/journeys'),'/journeys');assert.equal(activeHref(top,'/journeys/fernway-search/edit'),'/journeys');
});
test('breadcrumbs describe the real hierarchy and end with the current page',()=>{
 const crumbs=p=>breadcrumbsFor(p).map(c=>[c.href,c.label]);
 assert.deepEqual(crumbs('/'),[]);
 assert.deepEqual(crumbs('/w/me/runs'),[['/w/me','Your workspace'],[null,'Runs']]);
 assert.deepEqual(crumbs('/r/r1-diagnostic'),[['/w/demo','Demo'],[`/runs/${R1_RUN_ID}`,'R1 trace'],[null,'R1 report']]);
 assert.deepEqual(crumbs(`/runs/${UUID}/report`),[['/w/me','Your workspace'],['/w/me/reports','Reports'],[`/runs/${UUID}`,'Run 0f8fad5b'],[null,'Report']]);
 assert.deepEqual(breadcrumbsFor('/journeys/fernway-seat/edit',{'fernway-seat':'Seat selection'}).map(c=>c.label),['Demo','Journeys','Seat selection']);
 for(const route of Object.keys(ROUTES).filter(r=>r!=='/')){const list=breadcrumbsFor(route);assert.ok(list.length>=1,route);assert.equal(list.at(-1).href,null,route);assert.ok(list.slice(0,-1).every(c=>typeof c.href==='string'&&!c.href.includes('#')),route);}
});
