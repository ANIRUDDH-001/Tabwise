// Candidate source delivery only. Writes no approval/status file and launches nothing.
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {prepareNativeProductRequest} from './product-dispatch.mjs';
import {reviewedR2Module} from './node-review.mjs';
import {same} from '../../packages/contracts/r2-product.mjs';
export function writeNativeRequestPackage({request,context,outputDir}){
 const checked=prepareNativeProductRequest(context);
 if(!same(checked,request))throw Error('candidate request/source mismatch');
 const plan=reviewedR2Module('r2-run.mjs').parseR2Plan(context.planBytes);
 if(plan.pages.length!==1||plan.pages[0].id!==request.page_id||plan.repair)throw Error('one baseline candidate page required');
 const reserved=new Set(['plan.json','product-spec.json','candidate.json']);
 if(reserved.has(plan.pages[0].fixture))throw Error('candidate file collision');
 // Exclusive directory creation prevents overwriting another request or frozen evidence.
 mkdirSync(outputDir);
 const fixturePath=join(outputDir,plan.pages[0].fixture);mkdirSync(dirname(fixturePath),{recursive:true});
 writeFileSync(fixturePath,context.fixture,{flag:'wx'});writeFileSync(join(outputDir,'plan.json'),context.planBytes,{flag:'wx'});writeFileSync(join(outputDir,'product-spec.json'),context.specBytes,{flag:'wx'});
 writeFileSync(join(outputDir,'candidate.json'),JSON.stringify({request,execution_authorized:false,native_qualified:false})+'\n',{flag:'wx'});
 // Validate through the exact existing worker fixture loader, without loading a runtime.
 const bytes=reviewedR2Module('r2-run.mjs').loadR2Fixture(join(outputDir,'plan.json'),plan.pages[0]);
 return {outputDir,fixture_bytes:bytes.length,request_sha256:request.request_sha256,execution_authorized:false,native_qualified:false};
}
