// Separate contract; the original product artifact-manifest is unchanged.
import {assertContract,sha256,LIMITS} from './index.mjs';
export const SCHEMA='tabwise-r2-product-artifact/1',HASH=/^[a-f0-9]{64}$/;
export const IDENTITY_KEYS=['repository','workflow','revision','actor','github_run_id','github_run_attempt','r2_run_id','r2_source_sha256','qualification_sha256','plan_sha256','page_id','session','fixture_sha256','run_manifest_sha256','page_manifest_sha256','product_run_id','journey_id','spec_sha256','app_hash','profile','nvda_version'];
export function exact(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).sort().join(',')!==[...keys].sort().join(','))throw Error('bridge fields');}
export function stable(v){if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(!v||Object.getPrototypeOf(v)!==Object.prototype)throw Error('bridge JSON');return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';}
export const same=(a,b)=>stable(a)===stable(b);
export const safePath=p=>typeof p==='string'&&p.length<=240&&/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*(?:\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*)*$/.test(p)&&!p.split('/').some(x=>x==='.'||x==='..');
export function identity(v){exact(v,IDENTITY_KEYS);if(v.repository!=='ANIRUDDH-001/Tabwise'||v.workflow!=='.github/workflows/tabwise-r2.yml'||!/^[a-f0-9]{40}$/.test(v.revision)||!/^[1-9][0-9]{0,19}$/.test(v.github_run_id)||v.github_run_attempt!==1||v.r2_run_id!==v.github_run_id+'-1'||v.profile!=='A15')throw Error('bridge execution identity');
 for(const k of ['r2_source_sha256','qualification_sha256','plan_sha256','fixture_sha256','run_manifest_sha256','page_manifest_sha256','spec_sha256','app_hash'])if(!HASH.test(v[k]))throw Error('bridge digest');
 for(const k of ['actor','page_id','session','nvda_version'])if(typeof v[k]!=='string'||!v[k]||v[k].length>128)throw Error('bridge identity text');
}
export function validateR2ProductArtifact(m,files){const errors=[];try{
 exact(m,['schema','version','run_id','spec_sha256','evidence_sha256','files','stage_timings','runner','r2_identity','export_sha256','native_attestation_sha256','evidence_status']);identity(m.r2_identity);
 if(m.schema!==SCHEMA||m.version!=='0.1.0'||!HASH.test(m.spec_sha256)||!HASH.test(m.evidence_sha256)||!HASH.test(m.export_sha256)||!['complete','incomplete'].includes(m.evidence_status)||m.native_attestation_sha256!==null&&!HASH.test(m.native_attestation_sha256))throw Error('bridge manifest identity');
 const w=m.runner;exact(w,['workflow','event','head_branch','head_sha','actor','github_run_id','github_run_attempt','profile','nvda_version']);const i=m.r2_identity;
 if(w.workflow!==i.workflow||w.head_sha!==i.revision||w.actor!==i.actor||w.github_run_id!==i.github_run_id||w.github_run_attempt!==i.github_run_attempt||w.event!=='workflow_dispatch'||w.head_branch!=='main'||w.profile!==i.profile||w.nvda_version!==i.nvda_version)throw Error('actual R2 worker identity');
 if(!Array.isArray(m.files)||m.files.length<1||m.files.length>100||!same(m.files.map(f=>f.path),Object.keys(files).sort()))throw Error('bridge file coverage');
 let total=0;for(const f of m.files){exact(f,['path','sha256','bytes','kind']);const b=files[f.path];if(!safePath(f.path)||!['journal','screenshot','evidence','axe','source'].includes(f.kind)||!(b instanceof Uint8Array)||b.length!==f.bytes||sha256(b)!==f.sha256)throw Error('bridge file hash');total+=b.length;if(f.kind==='screenshot'&&b.length>LIMITS.SCREENSHOT_BYTES||f.kind==='journal'&&b.length>LIMITS.JOURNAL_BYTES)throw Error('bridge file cap');}
 if(total>LIMITS.RUN_BYTES||sha256(files['evidence.json'])!==m.evidence_sha256||sha256(files['r2-export.json'])!==m.export_sha256)throw Error('bridge size or subjects');
 const e=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(files['evidence.json']));assertContract('evidence-bundle',e);
 if(e.run_id!==m.run_id||e.evidence_status!==m.evidence_status||e.journey_id!==i.journey_id||i.product_run_id!==m.run_id||i.spec_sha256!==m.spec_sha256)throw Error('bridge evidence identity');
 if(m.evidence_status==='complete'&&(e.provenance!=='observed-nvda'||m.native_attestation_sha256===null||!files['native-attestation.json']||sha256(files['native-attestation.json'])!==m.native_attestation_sha256))throw Error('native evidence required');
 if(!Array.isArray(m.stage_timings))throw Error('stage timings missing');for(const t of m.stage_timings){exact(t,['stage','started_ms','finished_ms']);if(typeof t.stage!=='string'||!t.stage||!Number.isSafeInteger(t.started_ms)||!Number.isSafeInteger(t.finished_ms)||t.started_ms<0||t.finished_ms<t.started_ms)throw Error('stage timings');}
 }catch(e){errors.push(e.message);}return {ok:errors.length===0,errors};}

export function assertR2ProductHeader(m){
 exact(m,['schema','version','run_id','spec_sha256','evidence_sha256','files','stage_timings','runner','r2_identity','export_sha256','native_attestation_sha256','evidence_status']);identity(m.r2_identity);
 if(m.schema!==SCHEMA||m.version!=='0.1.0'||!HASH.test(m.spec_sha256)||!HASH.test(m.evidence_sha256)||!HASH.test(m.export_sha256)||!['complete','incomplete'].includes(m.evidence_status)||m.native_attestation_sha256!==null&&!HASH.test(m.native_attestation_sha256)||!Array.isArray(m.files)||m.files.length<1||m.files.length>100)throw Error('bridge header');
 const paths=[];for(const f of m.files){exact(f,['path','sha256','bytes','kind']);if(!safePath(f.path)||!HASH.test(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<0||f.bytes>LIMITS.RUN_BYTES||!['journal','screenshot','evidence','axe','source'].includes(f.kind))throw Error('bridge file header');paths.push(f.path);}
 if(!same(paths,[...new Set(paths)].sort()))throw Error('bridge file header order');return m;
}
