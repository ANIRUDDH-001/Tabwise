import {sha256} from '../../packages/contracts/index.mjs';
import {parseUniqueJson} from './strict-json.mjs';
// Projection only. No timestamps, sequence identities or observations are synthesized.
// Full raw objects remain in capture.json; pointers address their exact serialized locations.
export function captureObservationSources({files,expected}) {
 const path=expected.page_id+'/capture.json',bytes=files[path];
 if(!(bytes instanceof Uint8Array))throw Error('capture source missing');
 const c=parseUniqueJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(c.schema!=='r2-capture/1'||c.fixture_id!==expected.page_id||!c.completed||c.outcome!=='COMPLETE'||c.source!=='nvda'||c.reasons?.length||c.unattributed?.length||c.unattributed_page?.length)throw Error('native capture incomplete or synthetic');
 const manifest=parseUniqueJson(new TextDecoder().decode(files[expected.page_id+'/manifest.json']));
 const entry=manifest.files.find(f=>f.path==='capture.json');
 if(!entry||entry.sha256!==sha256(bytes)||entry.bytes!==bytes.length)throw Error('capture source binding');
 if(c.records.length!==expected.spec.steps.length)throw Error('capture step coverage');
 const out=[],used=new Set();
 for(const [n,r] of c.records.entries()){
  const m=manifest.step_map.actions[n],step=expected.spec.steps[n].step;
  if(r.step!==m.action||r.press!==m.press||r.press!==expected.spec.steps[n].key||!['speech','observed-silence'].includes(r.capture_status)||r.reasons.length)throw Error('capture action binding');
  function add(pointer,lane,raw,clock,t,kind,text,target){
   if(!Number.isSafeInteger(raw.seq)||raw.seq<1||!Number.isFinite(t)||t<0)throw Error('raw observation identity');
   if(target!==null&&(typeof target!=='string'||target.length>200))throw Error('native target exceeds 200 characters');
   if(text!==null&&(typeof text!=='string'||text.length>16000))throw Error('native evidence text exceeds 16000 characters');
   const event={evidence_ref:'r2:'+lane+':'+raw.seq,step,seq:raw.seq,clock,t,kind,text,target,duration_ms:null,artifact_path:null};
   out.push({pointer:{path,pointer},row:{schema:'tabwise-r2-product-observation/1',lane,page_id:expected.page_id,session:expected.session,task:m.task,action:m.action,event}});
  }
  for(const [k,e] of r.page.events.entries()){
   // Preserve v1 projections. V2 includes identity and explicitly cites the later sealed snapshot;
   // the event's original sequence/time are retained, never assigned to that terminal observation.
   const text=e.identity_version===2?JSON.stringify({identity_version:2,source:e.source,active:e.active,
    active_identity:e.active_identity??null,target_identity:e.target_identity??null,related_identity:e.related_identity??null,
    ...(k===r.page.events.length-1?{terminal_focus:r.page.after,terminal_focus_source:'/records/'+n+'/page/after'}:{})}):null;
   add('/records/'+n+'/page/events/'+k,e.type==='keydown'?'keys':['focusin','focusout'].includes(e.type)?'focus':'app_events',e,'page-monotonic-ms',e.t,e.type,text,e.target??null);
  }
  if(!r.page.events.some(e=>e.seq===r.ack_seq&&e.type==='keydown'))throw Error('capture acknowledgement missing');
  for(const seq of r.raw_seq){
   const k=c.raw.findIndex(e=>e.seq===seq),e=c.raw[k];
   if(!e||used.has(seq)||e.source!=='nvda'||e.received.clock!=='node-monotonic-ms')throw Error('speech source binding');
   used.add(seq);add('/raw/'+k,'speech',e,e.received.clock,e.received.t,'speech',e.text,null);
  }
 }
 if(used.size!==c.raw.length)throw Error('unmapped raw speech');
 return out;
}
