import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceMessage,catalogView} from '../lib/workspace-state.mjs';
test('workspace distinguishes missing session, permissions and service failures',()=>{
 assert.match(workspaceMessage(401),/Sign in/);assert.match(workspaceMessage(403),/permission/);assert.match(workspaceMessage(503),/temporarily unavailable/);assert.match(workspaceMessage(500),/try again/);
});
test('catalog only exposes supported product identifiers and safe editor links',()=>{
 assert.deepEqual(catalogView([{id:'private-task',app_id:'secret',name:'Private'}, {id:'fernway-seat',app_id:'fernway',name:'Seat',supported:false}]),[{id:'fernway-seat',name:'Seat',supported:false,href:'/journeys/fernway-seat/edit'}]);
});
import {workspaceState,workspaceSummary} from '../lib/workspace-state.mjs';
test('T-P0-04: configuration 503 says sign-in is not set up and offers no sign-in button',()=>{
 for(const reason of ['sign_in_configuration_pending','server_configuration_pending']){const s=workspaceState(503,reason);assert.equal(s.kind,'config');assert.match(s.message,/isn't set up/);assert.ok(!s.actions.includes('signin'));assert.deepEqual(s.actions,['demo','status']);assert.doesNotMatch(s.message,/temporarily unavailable|_/);}
});
test('T-P0-04: 401 offers sign-in; 500 and network failures offer retry; copy has no underscores',()=>{
 assert.deepEqual(workspaceState(401).actions,['signin','demo']);
 assert.ok(workspaceState(500,'workspace_service_unavailable').actions.includes('retry'));
 assert.ok(workspaceState(0).actions.includes('retry'));assert.match(workspaceState(0).message,/couldn't reach/);
 for(const [status,reason] of [[503,'sign_in_configuration_pending'],[401],[403],[503,'x'],[500,'workspace_service_unavailable'],[0]])assert.doesNotMatch(workspaceState(status,reason).message,/_/);
});
test('T-P0-03: workspace summary partitions sections and keeps the latest three',()=>{
 const runs=[1,2,3,4].map(i=>({id:`r${i}`,status:'completed',evidence_status:i%2?'complete':'pending'}));
 const s=workspaceSummary({versions:[{id:'a'},{id:'b'}],runs,catalog:null});
 assert.deepEqual(s.counts,{journeys:2,runs:4,reports:2});assert.equal(s.latest.runs.length,3);assert.deepEqual(s.reports.map(r=>r.id),['r1','r3']);assert.deepEqual(s.catalog,[]);
 assert.deepEqual(workspaceSummary(null).counts,{journeys:0,runs:0,reports:0});
});
test('workspace next action and saved-journey groups are derived only from the payload',async()=>{
 const {nextAction,savedJourneyGroups,journeyName,savedOn,workspaceSummary}=await import('../lib/workspace-state.mjs');
 const empty=workspaceSummary({versions:[],runs:[],catalog:[]});
 assert.equal(nextAction(empty).primary.href,'/journeys');assert.equal(nextAction(empty).secondary,null);assert.deepEqual(savedJourneyGroups(empty),[]);
 const catalog=[{id:'fernway-seat',name:'Seat selection',supported:true,href:'/journeys/fernway-seat/edit'}];
 const s=workspaceSummary({catalog,runs:[],versions:[{id:'a',journey_id:'fernway-seat',n:1,sha256:'x'},{id:'b',journey_id:'fernway-seat',n:2,sha256:'y',created_at:'2026-11-01T09:05:00Z'},{id:'c',journey_id:'unknown-id',n:1,sha256:'z'}]});
 const groups=savedJourneyGroups(s);assert.equal(groups.length,2);assert.equal(groups[0].name,'Seat selection');assert.equal(groups[0].latest.id,'b');assert.equal(groups[0].count,2);
 assert.equal(groups[1].name,'unknown-id');
 const next=nextAction(s);assert.equal(next.primary.href,'/journeys/fernway-seat/edit');assert.equal(next.secondary.href,'/journeys/versions/b');assert.doesNotMatch(JSON.stringify(next),/run/i);
 assert.equal(journeyName('nope',null),'nope');assert.equal(savedOn('2026-11-01T09:05:00Z'),'2026-11-01 09:05 UTC');assert.equal(savedOn('bad'),null);assert.equal(savedOn(undefined),null);
});
