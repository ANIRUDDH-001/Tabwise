import {test} from 'node:test';import assert from 'node:assert/strict';
import {requireOwnedRun} from '../lib/server/run-record.mjs';
test('D4 database outage is503 before not-found or ownership evaluation',()=>{
 assert.throws(()=>requireOwnedRun({id:'u'},{data:null,error:{message:'outage'}}),error=>error.status===503);
 assert.throws(()=>requireOwnedRun({id:'u'},{data:null,error:null}),error=>error.status===404);
 assert.throws(()=>requireOwnedRun({id:'u'},{data:{user_id:'other'},error:null}),error=>error.status===404);
});
