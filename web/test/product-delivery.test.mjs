import {test} from 'node:test';import assert from 'node:assert/strict';import {input} from './helpers/native-request-correction.mjs';import {buildNativeRequestContext} from '../lib/server/native-request-context.mjs';import {prepareNativeProductRequest} from '../../src/r2/product-dispatch.mjs';import {validateProductDelivery} from '../../src/r2/product-delivery.mjs';
function sample(){const a=input(),c={...buildNativeRequestContext(a),run:a.run,userId:'owner'};return {request:prepareNativeProductRequest(c),spec_text:c.specBytes.toString(),plan_text:c.planBytes.toString(),fixture_text:c.fixture.toString()};}
test('exact bounded immutable delivery never grants input',()=>{assert.equal(validateProductDelivery(sample()).input_authorized,false);});
for(const k of ['spec_text','plan_text','fixture_text'])test('delivery substitution '+k,()=>{const d=sample();d[k]+='tampered';assert.throws(()=>validateProductDelivery(d));});

import {buildWorkflowProductExport} from '../../src/r2/product-workflow-export.mjs';
test('workflow export refuses absent/foreign execution identity before reading evidence',()=>{for(const github of [null,{workflow:'.github/workflows/other.yml'}])assert.throws(()=>buildWorkflowProductExport({delivery:sample(),files:{},github,nvdaVersion:'synthetic-only'}));});
