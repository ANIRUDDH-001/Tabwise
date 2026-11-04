import {assertContract} from '../../../packages/contracts/index.mjs';
export function buildNativeRequestContext({run,fixture,revision,actor,r2SourceSha256,qualificationSha256}){
 assertContract('run-spec',run.spec);
 const flows={'fernway-seat':'seat','fernway-passenger':'passenger','fernway-search':'search'},flow=flows[run.spec.journey_id],variant=run.spec.variant;
 if(!flow||!['healthy','broken'].includes(variant))throw Error('supported baseline variant required');
 const plan={schema:'tabwise-r2-plan/1',split:'development',spec:{ackMs:1000,observationMs:1500,pollMs:25,timeoutMs:8000},handleTimeoutMs:27000,focusWaitMs:1000,pages:[{id:'product',fixture:'fernway/index.html',fixture_sha256:run.spec.app_hash,query:`?flow=${flow}&variant=${variant}`,task:run.spec.steps.map(s=>({step:`step-${s.step}`,press:s.key}))}]};
 return {specBytes:Buffer.from(JSON.stringify(run.spec)),planBytes:Buffer.from(JSON.stringify(plan)+'\n'),fixture,pageId:'product',planPath:'fixtures/r2/plans/product-candidate.json',revision,actor,r2SourceSha256,qualificationSha256};
}
