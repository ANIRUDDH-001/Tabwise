import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dispatchAdmitted,prepareIngest} from '../lib/server/jobs.mjs';
import {fixtures} from '../../packages/contracts/fixtures.mjs';
test('duplicate admission cannot dispatch twice; unknown dispatch failure has no automatic retry',async()=>{
 const run={id:fixtures['run-spec'].valid.run_id,status:'admitted',spec:fixtures['run-spec'].valid};
 let claimed=false,sends=0;const transitions=[];
 const adapters={claim:async()=>{if(claimed)return false;claimed=true;return true;},saveSpec:async()=>{},dispatch:async()=>{sends++;throw Error('unknown POST outcome');},transition:async(...args)=>transitions.push(args)};
 await assert.rejects(()=>dispatchAdmitted(run,adapters),/unknown POST/);
 await dispatchAdmitted(run,adapters);assert.equal(sends,1);assert.equal(transitions[0][2],'failed');
});
test('ingest refuses unreviewed and synthetic evidence even with matching file hashes',()=>{
 const m=structuredClone(fixtures['artifact-manifest'].valid);
 assert.equal(prepareIngest({run:{},manifest:m,files:{'evidence.json':Buffer.from('{}')},expected:{},workerReview:'BLOCK'}).ok,false);
});
