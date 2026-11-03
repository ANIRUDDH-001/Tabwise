// Inactive product/native planning and reconciliation seam. No dispatch, input, approval,
// attestation or qualification capability. Durable store callbacks belong to the caller.
import {assertContract,sha256} from '../../packages/contracts/index.mjs';
import {stable,same,exact} from '../../packages/contracts/r2-product.mjs';
import {parseUniqueJson} from './strict-json.mjs';
import {parseR2Plan} from '../../scripts/tabwise/r2-run.mjs';
const hash=/^[a-f0-9]{64}$/,rev=/^[a-f0-9]{40}$/;
const norm=b=>Buffer.from(new TextDecoder('utf-8',{fatal:true}).decode(b).replaceAll('\r\n','\n'));
const fail=why=>{throw Error('native product bridge: '+why);};
const keys=['schema','product_run_id','user_id','journey_version_id','spec_sha256','plan_sha256','plan_bytes_sha256','fixture_sha256','page_id','plan_path','revision','actor','r2_source_sha256','qualification_sha256','workflow','execution_authorized'];
function checked(p){exact(p,[...keys,'request_sha256']);const body=Object.fromEntries(keys.map(k=>[k,p[k]]));if(p.execution_authorized!==false||p.workflow!=='.github/workflows/tabwise-r2.yml'||p.request_sha256!==sha256(stable(body)))fail('request digest');return p;}
export function prepareNativeProductRequest({userId,run,specBytes,planBytes,fixture,pageId,planPath,revision,actor,r2SourceSha256,qualificationSha256}){
 if(!userId||run?.user_id!==userId||run.status!=='admitted'||!run.journey_version_id)fail('owned admitted version required');
 for(const b of [specBytes,planBytes,fixture])if(!(b instanceof Uint8Array)||!b.length||b.length>100000)fail('bounded source bytes required');
 assertContract('run-spec',run.spec);
 if(run.id!==run.spec.run_id||!same(parseUniqueJson(Buffer.from(specBytes).toString('utf8')),run.spec)||run.spec_sha256&&run.spec_sha256!==sha256(specBytes))fail('exact stored spec required');
 if(!rev.test(revision)||!hash.test(r2SourceSha256)||!hash.test(qualificationSha256)||typeof actor!=='string'||!actor||actor.length>128||!/^fixtures\/r2\/plans\/[a-zA-Z0-9_-]+\.json$/.test(planPath??''))fail('reviewable revision/source/plan identity required');
 const plan=parseR2Plan(planBytes),page=plan.pages.find(p=>p.id===pageId);
 if(plan.repair||run.spec.variant==='patched')fail('repair requires separately bound R3 candidate');
 if(!page||page.fixture_sha256!==sha256(norm(fixture))||page.fixture_sha256!==run.spec.app_hash||page.task.length!==run.spec.steps.length||page.task.some((t,n)=>run.spec.steps[n].step!==n+1||t.press!==run.spec.steps[n].key||t.press==='type'))fail('plan/source/step binding');
 if(page.query&&page.query!==`?flow=${run.spec.journey_id.replace('fernway-','')}&variant=${run.spec.variant}`)fail('query/variant binding');
 const body={schema:'tabwise-native-product-request/1',product_run_id:run.id,user_id:userId,journey_version_id:run.journey_version_id,spec_sha256:sha256(specBytes),plan_sha256:sha256(norm(planBytes)),plan_bytes_sha256:sha256(planBytes),fixture_sha256:page.fixture_sha256,page_id:page.id,plan_path:planPath,revision,actor,r2_source_sha256:r2SourceSha256,qualification_sha256:qualificationSha256,workflow:'.github/workflows/tabwise-r2.yml',execution_authorized:false};
 return Object.freeze({...body,request_sha256:sha256(stable(body))});
}
export async function persistNativeProductRequest(request,store){
 checked(request);if(typeof store?.create!=='function'||typeof store?.read!=='function')fail('exclusive durable store required');
 const id=request.product_run_id,bytes=stable(request);
 const created=await store.create(id,bytes);
 if(typeof created!=='boolean')fail('ambiguous storage outcome');
 const saved=parseUniqueJson(await store.read(id));
 if(!same(saved,request))fail('idempotency conflict');
 return {request:checked(saved),replayed:!created,execution_authorized:false};
}
export function matchNativeProductRun(request,association,remote){
 checked(request);
 // Association must come from trusted persistent dispatch coordination. A workflow title
 // cannot establish which product request caused a GitHub run after an unknown POST outcome.
 if(!association)fail('persisted execution association required');
 exact(association,[...keys,'request_sha256','github_run_id']);
 if(!keys.every(k=>same(association[k],request[k]))||association.request_sha256!==request.request_sha256||!/^[1-9][0-9]{0,19}$/.test(association.github_run_id))fail('execution association mismatch');
 const id=association.github_run_id;
 if(!Number.isSafeInteger(remote?.id)||String(remote.id)!==id||remote.run_attempt!==1||remote.path!==request.workflow||remote.event!=='workflow_dispatch'||remote.head_branch!=='main'||remote.head_sha!==request.revision||remote.actor?.login!==request.actor||remote.display_title!==`tabwise-r2 ${id}`)fail('actual native workflow identity mismatch');
 return Object.freeze({...request,github_run_id:id,github_run_attempt:1,native_qualified:false});
}
export function selectNativeArtifacts(binding,artifacts){
 const {github_run_id:id,github_run_attempt:attempt}=binding??{};
 if(!/^[1-9][0-9]{0,19}$/.test(id??'')||attempt!==1||binding.workflow!=='.github/workflows/tabwise-r2.yml'||binding.native_qualified!==false||!Array.isArray(artifacts)||artifacts.length>100)fail('bound native run and bounded artifact page required');
 const pick=name=>{const found=artifacts.filter(a=>a.name===name);if(found.length!==1)fail('missing or duplicate '+name);const a=found[0];if(a.expired!==false||!Number.isSafeInteger(a.id)||a.id<1||!Number.isSafeInteger(a.size_in_bytes)||a.size_in_bytes<1||a.size_in_bytes>8000000)fail('invalid artifact metadata');return String(a.id);};
 const evidence_id=pick(`tabwise-r2-run-${id}-${attempt}`),attestation_id=pick(`tabwise-r2-attestation-${id}-${attempt}`);
 if(evidence_id===attestation_id)fail('artifact identity collision');
 return {evidence_id,attestation_id,native_qualified:false};
}
