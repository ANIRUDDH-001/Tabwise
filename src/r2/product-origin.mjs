// Read-only W5 producer-origin validation. Origin signatures are not independent
// native qualification, physical-input proof or a replacement for raw replay.
import {sha256} from '../../packages/contracts/index.mjs';
import {exact,same} from '../../packages/contracts/r2-product.mjs';
import {parseUniqueJson} from './strict-json.mjs';
import {canonical,verifyAdmissionRecord,bindingFromGate} from '../../scripts/tabwise/r2-admission.mjs';
import {loadAdmissionPolicy} from '../../scripts/tabwise/r2-admission-transport.mjs';
import {verifyNativePlanAdmission} from './native-plan.mjs';
import {validateRuntimeMetadata} from './runtime-metadata.mjs';
import {reviewedSourceRoot,reviewedR2Module} from './node-review.mjs';
const text=b=>new TextDecoder('utf-8',{fatal:true}).decode(b),parse=b=>parseUniqueJson(text(b));
const fail=()=>{throw Error('native product origin refused');};

function configuredAuthority(expected,plan){
 const p=loadAdmissionPolicy(),root=reviewedSourceRoot(),m=reviewedR2Module('r2-policy.mjs'),status=m.readR2Status(root);
 if(status?.enabled!==true||status.verdict!=='PASS'||!status.reviewer||status.reviewer===status.actor||status.reviewed_sha256!==expected.r2_source_sha256||m.r2Digest(root)!==expected.r2_source_sha256||reviewedR2Module('qualification-policy.mjs').qualificationDigest(root)!==expected.qualification_sha256)fail();
 return {id:p.authorization_id,binding:bindingFromGate({status,head:expected.revision,plan},p),consumer:{run_id:expected.github_run_id,attempt:1},publicKey:p.receipt_public_key};
}

// A supplied authority is useful only for nonqualifying fixture inspection.
// Production handle opening never forwards one and reads committed policy itself.
export function verifyNativeProductOrigin({files,expected,authority}){
 const prefix='product-producer/',raw=parse(files['run-manifest.json']),plan=parse(files['plan.json']);
 const a=authority??configuredAuthority(expected,plan),body=files[prefix+'product-run.json'],run=parse(body),admission=parse(files[prefix+'product-admission.json']);
 exact(run,['schema','producer_class','request_sha256','product_run_id','github_run_id','github_run_attempt','raw_run_manifest_sha256','files','native_qualified']);
 if(run.schema!=='tabwise-native-product-run/1'||run.producer_class!=='genuine-unqualified'||run.native_qualified!==false||run.product_run_id!==expected.product_run_id||run.github_run_id!==expected.github_run_id||run.github_run_attempt!==1||run.raw_run_manifest_sha256!==sha256(files['run-manifest.json'])||raw.run_class!=='synthetic'||raw.pages?.length!==1||raw.pages[0].class!=='synthetic'||raw.pages[0].exit_code!==0||raw.pages[0].id!==expected.page_id)fail();
 const names=['product-session-intent.json','product-session-result.json','product-session.json'].map(n=>expected.page_id+'/'+n);
 if(!Array.isArray(run.files)||!same(run.files.map(f=>f.path),names)||!same(Object.keys(files).filter(p=>p.startsWith(prefix)).sort(),[...names.map(n=>prefix+n),prefix+'product-run.json',prefix+'product-admission.json'].sort()))fail();
 for(const f of run.files){exact(f,['path','bytes','sha256']);const b=files[prefix+f.path];if(!b||b.length!==f.bytes||sha256(b)!==f.sha256)fail();}
 verifyAdmissionRecord(admission,{...a,manifest:sha256(body),pages:[expected.page_id]});
 const [intent,result,producer]=names.map(n=>parse(files[prefix+n]));
 exact(intent,['schema','request','github','consumption_receipt','request_receipt','page_grant']);
 if(intent.schema!=='tabwise-native-product-session-intent/1'||!same(intent.consumption_receipt,admission.receipt)||!same(intent.page_grant,admission.grants[0]))fail();
 const fixture=plan.pages[0].fixture,delivery={request:intent.request,spec_text:text(files['product-spec.json']),plan_text:text(files['plan.json']),fixture_text:text(files[fixture])};
 verifyNativePlanAdmission({delivery,githubRunId:expected.github_run_id,authority:{...a,historical:true},receipt:intent.consumption_receipt,requestReceipt:intent.request_receipt});
 const r=intent.request,g=intent.github;
 if(r.request_sha256!==run.request_sha256||r.product_run_id!==expected.product_run_id||r.spec_sha256!==expected.spec_sha256||r.fixture_sha256!==expected.fixture_sha256||r.plan_sha256!==expected.plan_sha256||r.r2_source_sha256!==expected.r2_source_sha256||r.qualification_sha256!==expected.qualification_sha256||r.revision!==expected.revision||r.actor!==expected.actor||g.runId!==expected.github_run_id||g.revision!==r.revision||g.actor!==r.actor||g.triggeringActor!==r.actor||g.workflow!==r.workflow||g.ref!=='refs/heads/main'||g.attempt!==1)fail();
 exact(producer,['schema','producer_class','raw_manifest_class','request_sha256','product_run_id','github_run_id','github_run_attempt','r2_source_sha256','qualification_sha256','page_id','session','page_manifest_sha256','intent_sha256','session_result_sha256','runtime','association','physical_quiescence_verified','native_qualified']);
 const p=expected.page_id,page=parse(files[p+'/manifest.json']),capture=parse(files[p+'/capture.json']);
 if(producer.schema!=='tabwise-native-product-session/1'||producer.producer_class!=='genuine-unqualified'||producer.raw_manifest_class!=='synthetic'||producer.native_qualified!==false||producer.physical_quiescence_verified!==false||producer.association!=='observation-window-only'||producer.request_sha256!==r.request_sha256||producer.product_run_id!==r.product_run_id||producer.github_run_id!==expected.github_run_id||producer.github_run_attempt!==1||producer.r2_source_sha256!==r.r2_source_sha256||producer.qualification_sha256!==r.qualification_sha256||producer.page_id!==p||producer.session!==expected.session||page.class!=='synthetic'||producer.page_manifest_sha256!==sha256(files[p+'/manifest.json'])||producer.intent_sha256!==sha256(files[prefix+names[0]])||producer.session_result_sha256!==sha256(files[prefix+names[1]]))fail();
 if(result.schema!=='tabwise-r2-session-result/1'||result.fixture_id!==p||result.completed!==true||result.nvda!=='stopped'||result.manifest_sha256!==producer.page_manifest_sha256||result.runtime_checks?.brand!==true||result.runtime_checks?.post_session_authentic!==true||result.cleanup_errors?.length!==0||result.reasons?.length!==0||result.unexpected_loopback_requests!==0||result.lifecycle?.clean!==true||capture.source!=='nvda'||capture.completed!==true||capture.outcome!=='COMPLETE'||!Array.isArray(capture.raw)||!capture.raw.length||capture.raw.some(e=>e.source!=='nvda'||typeof e.text!=='string'||!e.text||e.received?.clock!=='node-monotonic-ms')||!Array.isArray(capture.records)||capture.records.some(r=>r.page?.after?.identity_version!==2))fail();
 const runtime=validateRuntimeMetadata(producer.runtime),events=files[p+'/events.jsonl'],entry=page.files.filter(f=>f.path==='events.jsonl');
 if(!events||entry.length!==1||entry[0].bytes!==events.length||entry[0].sha256!==sha256(events)||!text(events).endsWith('\n'))fail();
 const rows=text(events).trimEnd().split('\n').map(parseUniqueJson).filter(e=>e.phase==='native-runtime');
 if(rows.length!==1||!same(rows[0],{phase:'native-runtime',runtime})||runtime.profile!==expected.profile||runtime.nvda_version!==expected.nvda_version)fail();
 return {producer_class:'genuine-unqualified',source_verified:false,native_qualified:false};
}
