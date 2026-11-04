import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessNativeRepair} from '../lib/server/repair-verdict.mjs';
function args(){const cap=active=>({source:'nvda',completed:true,outcome:'COMPLETE',reasons:[],records:[{step:'a1',press:'Enter',capture_status:'observed-silence',reasons:[],page:{before:{state:{dialogs:['dialog#1']}},after:{active,state:{dialogs:[]}}}}]});return {baselineCapture:cap('body'),rerunCapture:cap('choose-seat#1'),baselineEvidence:{lanes:{speech:[]}},rerunEvidence:{lanes:{speech:[]}},steps:[{step:1,key:'Enter'}],oracle:{kind:'focus',step:1}};}
// These are pure synthetic oracle tests, never native evidence or R7 acceptance.
test('non-body baseline and contradictory or unavailable v2 terminal identity cannot establish a repair',()=>{
 const a=args();a.baselineCapture.records[0].page.after.active='radio#3';assert.equal(assessNativeRepair(a).verdict,'INCONCLUSIVE');
 for(const identity of [undefined,{available:false},{available:true,is_body:true,connected:true,id:'choose-seat',tag:'button'},{available:true,is_body:false,connected:false,id:'choose-seat',tag:'button'}]){const b=args(),after=b.rerunCapture.records[0].page.after;after.identity_version=2;after.active_identity=identity;assert.equal(assessNativeRepair(b).verdict,'INCONCLUSIVE');}
});
// Strengthened after independent P0 review: historical display compatibility must never certify FIXED.
test('historical native v1 snapshots remain readable but terminal strings cannot certify a new repair',()=>{const a=args();a.rerunCapture.records[0].page.events=[{type:'focusin',target:'choose-seat#1'}];a.rerunCapture.records[0].page.after.active='body';assert.equal(assessNativeRepair(a).verdict,'INCONCLUSIVE');assert.equal(assessNativeRepair(args()).verdict,'INCONCLUSIVE');});
