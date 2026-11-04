import {test} from 'node:test';import assert from 'node:assert/strict';import {input} from './helpers/native-request-correction.mjs';import {buildNativeRequestContext} from '../lib/server/native-request-context.mjs';import {prepareNativeProductRequest} from '../../src/r2/product-dispatch.mjs';import {validateProductDelivery} from '../../src/r2/product-delivery.mjs';
function sample(){const a=input(),c={...buildNativeRequestContext(a),run:a.run,userId:'owner'};return {request:prepareNativeProductRequest(c),spec_text:c.specBytes.toString(),plan_text:c.planBytes.toString(),fixture_text:c.fixture.toString()};}
test('exact bounded immutable delivery never grants input',()=>{assert.equal(validateProductDelivery(sample()).input_authorized,false);});
for(const k of ['spec_text','plan_text','fixture_text'])test('delivery substitution '+k,()=>{const d=sample();d[k]+='tampered';assert.throws(()=>validateProductDelivery(d));});

import {buildWorkflowProductExport} from '../../src/r2/product-workflow-export.mjs';
import * as boundary from '../../scripts/tabwise/product-workflow-boundary.mjs';

test('trusted delivery accepts generated request source without requiring a committed plan',()=>{
 assert.equal(typeof boundary.verifyBoundProductDelivery,'function','generated delivery source boundary is missing');
 const delivery=sample(),r=delivery.request,args={delivery,identity:{product_run_id:r.product_run_id,request_sha256:r.request_sha256},github:{runId:'123',revision:r.revision,actor:r.actor,triggeringActor:r.actor,workflow:r.workflow,ref:'refs/heads/main',attempt:1},sourceDigest:r.r2_source_sha256,qualificationDigest:r.qualification_sha256};
 const result=boundary.verifyBoundProductDelivery(args);assert.equal(result.plan_text,delivery.plan_text);assert.equal(result.input_authorized,false);
 for(const key of ['sourceDigest','qualificationDigest'])assert.throws(()=>boundary.verifyBoundProductDelivery({...args,[key]:'f'.repeat(64)}));
 for(const key of ['revision','actor','triggeringActor','workflow','ref','attempt','runId'])assert.throws(()=>boundary.verifyBoundProductDelivery({...args,github:{...args.github,[key]:'wrong'}}));
 assert.throws(()=>boundary.verifyBoundProductDelivery({...args,identity:{...args.identity,request_sha256:'f'.repeat(64)}}));
});
test('workflow export refuses absent/foreign execution identity before reading evidence',()=>{for(const github of [null,{workflow:'.github/workflows/other.yml'}])assert.throws(()=>buildWorkflowProductExport({delivery:sample(),files:{},github,nvdaVersion:'synthetic-only'}));});
