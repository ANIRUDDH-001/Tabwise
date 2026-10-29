import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evidenceRefreshKey,citationTarget} from '../lib/evidence-view.mjs';
test('new failed diagnostics refresh even when completeness remains incomplete',()=>{
 assert.notEqual(evidenceRefreshKey({status:'running',evidence_status:'incomplete'}),evidenceRefreshKey({status:'failed',evidence_status:'incomplete',diagnostic_evidence_available:true}));
});
test('only citations with a loaded lane origin become links',()=>{
 assert.equal(citationTarget('key:1',['key:1']),'#evidence-key:1');assert.equal(citationTarget('signal:missing-announcement',['key:1']),null);assert.equal(citationTarget('key:1',[]),null);
});
