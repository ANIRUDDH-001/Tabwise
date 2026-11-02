import {sha256} from '../../packages/contracts/index.mjs';
import {R1_SCOPE_NOTE} from './r1-evidence.mjs';
// Successful R1 run (T-P0-10 Step 2a). Separate from the failed-run anchor in snapshot.mjs, which is unchanged.
// ZIP digest matches docs/ledger/RUNS.md; file digests were computed from that ZIP's extracted bytes.
export const R1_PASS_ANCHOR=Object.freeze({run_id:'r1-20261028T153344Z',github_run_id:'40716824856',artifact_name:'r1-evidence-40716824856-1',artifact_id:'12829526270',
 archive_sha256:'419807699a32e3752f6e6637f275803b9db803c960991f0b4d8ecfe8844fc885',source_commit:'0c93fa73e0c111a2df65302adfe0006d63f50a39',
 // Public projection independently checked against the anchored ZIP. Binds step boundaries,
 // keys and disclosure metadata as well as flattened speech; re-sealing edits cannot bless them.
 public_snapshot_sha256:'a3b06aa94effe8fb573c097576c230afbd89766201c2678c4911cce4b858e10b',
 // Send-guard totals from the validated summary.json; not all sends were confirmed (81/171).
 send_guard:Object.freeze({sends:171,misdelivered:false,refused:0,unsettled:0,acks:Object.freeze({confirmed:81,unconfirmable:90,missing:0})}),
 files:Object.freeze({
 'summary.json':'f49a4e34ce3b991f8e2d3d3bf6300c160d45e50ff3394cd85914f82100dc1de3',
 'attempt-1.jsonl':'c42db48135807ae41f1419e0092a1f2e9771c2d97019f5f82db57b85c6a66e72',
 'attempt-2.jsonl':'0f7d6f2a3808f940b0d6d0368bd097168d7dbb793d15d351d47778f7e3523dbe',
 'attempt-3.jsonl':'9430db6c4aeff01448ddb4043af91d53c2a6ac783ae2f2c4c21bef4f82512b18',
 'raw-1.json':'99b1e0dde36734fe5781d431fdb46e00b50ddbe507eea339e1cdb1b3d479defd',
 'raw-2.json':'99b1e0dde36734fe5781d431fdb46e00b50ddbe507eea339e1cdb1b3d479defd',
 'raw-3.json':'99b1e0dde36734fe5781d431fdb46e00b50ddbe507eea339e1cdb1b3d479defd',
})});
// Exact public field whitelist. Anything else (process ids, nonces, window titles, runner data, focus/send streams) is refused.
export const PASS_FIELDS=Object.freeze(['format','run_id','result','status','github_run_id','github_url','artifact_name','artifact_id','archive_sha256','source_commit','started','finished','profile','fixture','settings','send_guard','attempts','model_provenance','source_hashes','limitations','snapshot_sha256']);
const FORBIDDEN=/^(process_id|relay_pid|pid|nonce|title_phrase|focus|sends?_log|runner|image_os|image_version|workflow_ref|evidence_dir|lock|dependencies|versions|checkout|ts|files)$/;
const A15={'keyboard.speakTypedCharacters':1,'keyboard.speakTypedWords':0,'virtualBuffers.enableOnPageLoad':false,'virtualBuffers.autoSayAllOnPageLoad':false};
function forbiddenKeys(value,path='',out=[]){if(value&&typeof value==='object')for(const [k,v] of Object.entries(value)){if(!Array.isArray(value)&&FORBIDDEN.test(k))out.push(path+k);forbiddenKeys(v,`${path}${k}.`,out);}return out;}
export function validatePassSnapshot(snapshot){
 try{return validatePassFields(snapshot);}catch{return {ok:false,errors:['malformed public snapshot']};}
}
function validatePassFields(snapshot){
 const errors=[];
 if(!snapshot||typeof snapshot!=='object')return {ok:false,errors:['missing snapshot']};
 const keys=Object.keys(snapshot);
 if(JSON.stringify([...keys].sort())!==JSON.stringify([...PASS_FIELDS].sort()))errors.push('public field whitelist');
 for(const key of forbiddenKeys(snapshot))errors.push(`non-public field ${key}`);
 const {snapshot_sha256,...body}=snapshot;
 if(sha256(JSON.stringify(body))!==snapshot_sha256)errors.push('snapshot integrity');
 if(snapshot_sha256!==R1_PASS_ANCHOR.public_snapshot_sha256)errors.push('public projection differs from archived source');
 const only=(value,fields,path)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==[...fields].sort().join('|'))errors.push(`non-public field or shape ${path}`);};
 only(snapshot.model_provenance,['status','model','cost'],'model_provenance');
 only(snapshot.send_guard,['sends','misdelivered','refused','unsettled','acks'],'send_guard');
 only(snapshot.send_guard?.acks,['confirmed','unconfirmable','missing'],'acks');
 for(const attempt of snapshot.attempts??[]){
  only(attempt,['attempt','status','fresh','complete','steps_recorded','steps'],'attempt');
  for(const step of attempt.steps??[])only(step,['step','keys','phrases','timed_out','error'],'step');
 }
 if(snapshot.format!=='tabwise-r1-pass-public/1')errors.push('format');
 for(const field of ['run_id','github_run_id','artifact_name','artifact_id','archive_sha256','source_commit'])if(snapshot[field]!==R1_PASS_ANCHOR[field])errors.push(`R1 PASS identity ${field}`);
 if(snapshot.github_url!==`https://github.com/ANIRUDDH-001/Tabwise/actions/runs/${R1_PASS_ANCHOR.github_run_id}`)errors.push('github url');
 if(JSON.stringify(snapshot.source_hashes)!==JSON.stringify(R1_PASS_ANCHOR.files))errors.push('source hashes differ from anchor');
 if(snapshot.result!=='PASS'||snapshot.status!=='finished')errors.push('result');
 if(JSON.stringify(snapshot.settings)!==JSON.stringify(A15))errors.push('A15 profile settings');
 if(snapshot.model_provenance?.status!=='not_run')errors.push('R1 has no model output');
 const g=snapshot.send_guard;
 if(JSON.stringify(g)!==JSON.stringify(R1_PASS_ANCHOR.send_guard))errors.push('send guard differs from anchor');
 if(!g||g.misdelivered!==false||g.refused!==0||g.unsettled!==0||g.acks?.missing!==0||g.acks.confirmed+g.acks.unconfirmable+g.acks.missing!==g.sends)errors.push('send guard');
 const attempts=Array.isArray(snapshot.attempts)?snapshot.attempts:[];
 if(attempts.length!==3)errors.push('attempt count');
 attempts.forEach((a,i)=>{
  if(a.attempt!==i+1||a.status!=='completed'||a.fresh!==true||a.complete!==true)errors.push(`attempt ${i+1} state`);
  if(!Array.isArray(a.steps)||a.steps.length!==a.steps_recorded||a.steps_recorded!==10)errors.push(`attempt ${i+1} steps`);
  // Published speech must re-serialise to the anchored raw-N.json bytes, so speech cannot be edited and resealed.
  try{if(sha256(JSON.stringify(a.steps.flatMap(s=>s.phrases),null,2)+'\n')!==R1_PASS_ANCHOR.files[`raw-${i+1}.json`])errors.push(`attempt ${i+1} speech differs from archived raw speech`);}catch{errors.push(`attempt ${i+1} speech`);}
  for(const s of a.steps??[])if(s.timed_out!==false||s.error!==null||!Array.isArray(s.keys)||!Array.isArray(s.phrases))errors.push(`attempt ${i+1} step ${s.step}`);
 });
 if(!Array.isArray(snapshot.limitations)||!snapshot.limitations.some(l=>l.includes(`${g?.acks?.confirmed} of ${g?.sends}`)))errors.push('acknowledgement limitation required');
 return {ok:errors.length===0,errors};
}
// The speech heard on the first attempt, joined per step, for display.
export function passSpeech(snapshot){return snapshot.attempts[0].steps.map(s=>({step:s.step,keys:s.keys.join(s.keys.length>3?'':' '),speech:s.phrases.join(' · ')}));}
// Server-side view of the validated successful run. Throws rather than render a PASS from unvalidated data.
export function r1PassView(data){
 const result=validatePassSnapshot(data);if(!result.ok)throw Error('R1 PASS snapshot invalid: '+result.errors.join('; '));
 const g=data.send_guard;
 return {run_id:data.run_id,result:'PASS',label:'Successful R1 capture',tone:'ok',scope:R1_SCOPE_NOTE,attempts:data.attempts.length,steps:data.attempts[0].steps_recorded,
  acks:`${g.acks.confirmed} of ${g.sends} key sends had a confirmed page acknowledgement; ${g.acks.unconfirmable} could not be confirmed; ${g.acks.missing} were missing.`,
  quote:data.attempts[0].steps[8].phrases.join(' '),speech:passSpeech(data)};
}
// Pass-through status for r1View/R1ScopeNote, computed on the server.
export const passStatus=data=>({validated:validatePassSnapshot(data).ok,result:'PASS'});
