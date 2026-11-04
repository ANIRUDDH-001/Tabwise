import test from 'node:test';import assert from 'node:assert/strict';
import {dispatchNativeProduct} from '../lib/server/native-integration.mjs';
import {input} from './helpers/native-request-correction.mjs';import {buildNativeRequestContext} from '../lib/server/native-request-context.mjs';import {prepareNativeProductRequest} from '../../src/r2/product-dispatch.mjs';import {binding,configuration} from './helpers/r2-bridge-fixture.mjs';
test('delivery-enabled sender explicitly selects product mode and never duplicates an unknown dispatch',async()=>{
 const a=input(),r=prepareNativeProductRequest({...buildNativeRequestContext(a),run:a.run,userId:'owner'}),b={...binding(),plan_sha256:r.plan_sha256},c={...configuration(b),enabled:true,sender_enabled:true,delivery_enabled:true,binding:b};
 let row={user_id:'owner',request:r,request_sha256:r.request_sha256,state:'PREPARED'},posts=0,payload;
 const store={read:async()=>row,transition:async(u,id,h,action)=>row={...row,state:action==='intent'?'DISPATCH_INTENT':'DISPATCH_UNKNOWN',dispatch_nonce:'fresh-persisted-intent-nonce'}};
 const call=()=>dispatchNativeProduct({configuration:c,userId:'owner',runId:r.product_run_id,requestSha256:r.request_sha256,store,send:async(path,p)=>{posts++;payload=p;throw Error('lost transport response');}});
 await call();await call();assert.equal(posts,1);assert.equal(row.state,'DISPATCH_UNKNOWN');
 assert.equal(payload.inputs.product_bound,'true');assert.equal(payload.inputs.product_run_id,r.product_run_id);assert.equal(payload.inputs.product_request_sha256,r.request_sha256);assert.equal(payload.inputs.product_nonce,row.dispatch_nonce);
});
