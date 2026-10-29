import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceMessage,catalogView} from '../lib/workspace-state.mjs';
test('workspace distinguishes missing session, permissions and service failures',()=>{
 assert.match(workspaceMessage(401),/Sign in/);assert.match(workspaceMessage(403),/permission/);assert.match(workspaceMessage(503),/temporarily unavailable/);assert.match(workspaceMessage(500),/try again/);
});
test('catalog only exposes supported product identifiers and safe editor links',()=>{
 assert.deepEqual(catalogView([{id:'private-task',app_id:'secret',name:'Private'}, {id:'fernway-seat',app_id:'fernway',name:'Seat',supported:false}]),[{id:'fernway-seat',name:'Seat',supported:false,href:'/journeys/fernway-seat/edit'}]);
});
