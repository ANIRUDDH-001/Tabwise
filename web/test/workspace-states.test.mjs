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
