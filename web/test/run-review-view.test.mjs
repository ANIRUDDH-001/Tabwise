import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewView} from '../lib/server/run-review-view.mjs';

const finding={id:'f1',source:'spark',step:2,title:'Missing announcement',mechanism:'Status not spoken',evidence_refs:['sha256:a'],confidence:'medium',location:{path:'index.html'}};
const diagnosis={id:'d1',model:'muse-spark-1.3',output:{verdict:'barrier_found',private:'never expose'}};

test('complete evidence exposes bounded diagnosis claims without raw output or paths',()=>{
 const view=reviewView('complete',[finding],[diagnosis]);
 assert.deepEqual(view,{findings:[{id:'f1',source:'spark',step:2,title:'Missing announcement',mechanism:'Status not spoken',confidence:'medium',evidence_count:1}],diagnoses:[{id:'d1',model:'muse-spark-1.3',verdict:'barrier_found'}]});
});
test('incomplete or absent evidence cannot present a scored finding',()=>{
 for(const status of ['pending','incomplete',null])assert.deepEqual(reviewView(status,[finding],[diagnosis]),{findings:[],diagnoses:[]});
});
test('unexpected rows and fields are omitted',()=>{
 assert.deepEqual(reviewView('complete',[{...finding,source:'unknown'},null],[{...diagnosis,model:'unknown'},null]),{findings:[],diagnoses:[]});
});
