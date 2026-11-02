import {test} from 'node:test';import assert from 'node:assert/strict';
import {workspaceNavigation} from '../lib/workspace-navigation.mjs';
test('D3 owned navigation targets owned sections and leaves historical evidence in the demo',()=>{
 const owned=workspaceNavigation(true);assert.equal(owned.find(([name])=>name==='Runs')[1],'/w/me/runs');assert.equal(owned.find(([name])=>name==='Reports')[1],'/w/me/reports');assert.ok(workspaceNavigation(false).some(([,path])=>path==='/r/r1-diagnostic'));
});
test('D6 owned navigation contains no hash anchors and no historical demo evidence',()=>{
 const owned=workspaceNavigation(true);
 assert.ok(owned.every(([,href])=>!href.includes('#')));
 assert.ok(owned.every(([,href])=>href.startsWith('/w/me')));
 assert.deepEqual(owned.map(([,href])=>href),['/w/me','/w/me/journeys','/w/me/runs','/w/me/reports']);
});
