import {withTimeout} from '../../src/speech/capture.mjs';
import {settingsMismatch,spokenTitleHasNonce} from '../../src/speech/validate.mjs';
import {foregroundMismatch} from '../../src/speech/foreground.mjs';
import {pageAck} from '../../src/speech/sendguard.mjs';
import {createSpeechObserver} from './observer.mjs';
import {assessObserverQualification,createQualificationTeardown} from './observer-qualification.mjs';
import {isQualificationRuntime} from './qualification-loader.mjs';

// Injected offline core; only the separately gated entry supplies an authentic physical runtime.
export async function runObserverQualification({runtime,browser,foreground,writer,nonce,clock={now:()=>performance.now(),wait:ms=>new Promise(resolve=>setTimeout(resolve,ms))},signal}){
 const {guard,nvda,cfg}=runtime,active=new Set(),reasons=[],intents=[];
 let page,observer,ack,receipt,assessment,before,after,primary,actionStarted=null,titleStarted=false,titleIntents=0;
 const result={schema:'tabwise-observer-qualification-result/1',provenance:isQualificationRuntime(runtime)?'owned-vendored-runtime':'injected-offline-test',nonce,versions:runtime.versions??null,timings:{started_ms:clock.now()},candidate_pass:false,relay_equivalence_verified:false,full_worker_ready:false,dispatch_authorized:false,physical_quiescence_verified:false,reasons};
 const stop=(reason,kind)=>{if(!guard.isStopped())guard.stop(reason,kind);};
 const abort=()=>stop('observer qualification cancelled','timeout');signal?.addEventListener('abort',abort,{once:true});
 const bounded=async(label,fn,ms)=>{
  const operation=Promise.resolve().then(fn);active.add(label);operation.then(()=>active.delete(label),()=>active.delete(label));
  const out=await withTimeout(operation,ms);if(out.timedOut){stop(`${label}: timed out`,'timeout');throw Error(`${label}: timed out`);}if(out.error)throw Error(`${label}: ${out.error}`);return out.value;
 };
 const live=()=>{if(runtime.getGate()!==guard||guard.isStopped()||signal?.aborted)throw Error('qualification guard identity/stopped');};
 const check=async context=>{
  live();const verdict=await foreground.check(),errors=foregroundMismatch(verdict,{pid:page?.pid,nonce});
  writer.append('focus',{...verdict,context:context??null,errors,observed_ms:clock.now()});return errors;
 };
 guard.onIntent(token=>{
  const codes=token.info?.keys?.map(key=>key.vk),control=JSON.stringify(codes)==='[162]',title=JSON.stringify(codes)==='[45,84]';
  writer.append('intents',{id:token.id,action:token.action.label,key:token.key,info:token.info,t:clock.now()});intents.push({id:token.id,key:token.key});
  if(token.info?.path!=='nvda'||(!control&&!title)||titleIntents||!titleStarted){stop('qualification unexpected physical-send intent','pre');throw Error('qualification send allowlist');}
  if(title)titleIntents++;
 });
 const close=createQualificationTeardown({guard,finalRead:async()=>{
  if(page)writer.append('page',{phase:'final',snapshot:await bounded('final page',()=>page.read(),cfg.cleanup_timeout_ms)});
  if(ack){const errors=await bounded('final acknowledgement',()=>ack.final(),cfg.cleanup_timeout_ms);writer.append('acks',{phase:'final',errors});if(errors.length)throw Error(errors.join('; '));}
  if(observer){result.final_observer=observer.read();result.observer_journal=observer.journal();}
 },observer:{close:async()=>{try{await observer?.close();}finally{foreground.close();}}},browser:{close:()=>bounded('browser close',()=>page?.close(),cfg.cleanup_timeout_ms)},nvda:{stop:()=>bounded('NVDA stop',()=>nvda.stop(),cfg.cleanup_timeout_ms)}});
 try{
  runtime.assertAuthentic();if(signal?.aborted)abort();live();writer.append('events',{phase:'start',t:clock.now()});
  receipt=await bounded('NVDA startup',()=>nvda.start({settings:structuredClone(cfg.nvda_settings)}),cfg.load_timeout_ms*2);live();
  if(!Number.isInteger(receipt?.pid)||receipt.pid<=0||receipt.relay_pid!==receipt.pid||receipt.reset_confirmed!==true)throw Error('owned NVDA receipt missing');result.startup_receipt=receipt;
  const settings=nvda.getSettings(),readback=Object.fromEntries(Object.entries(cfg.nvda_settings).flatMap(([section,values])=>Object.keys(values).map(key=>[`${section}.${key}`,settings?.[section]?.[key]??null])));
  result.settings=readback;const mismatch=settingsMismatch(cfg.nvda_settings,readback);if(mismatch.length)throw Error(mismatch.join('; '));
  page=await bounded('owned browser',()=>browser.open(),cfg.load_timeout_ms);live();result.browser={pid:page.pid,version:page.version??'injected',fixture_sha256:page.fixture_sha256??null};
  const initial=await bounded('page identity',()=>page.read(),cfg.load_timeout_ms);writer.append('page',{phase:'initial',snapshot:initial});if(initial.complete!==true||initial.nonce!==nonce)throw Error('owned page incomplete');
  ack=pageAck({read:from=>page.keys(from),ackMs:guard.bounds.ackMs});const reader=async token=>{const value=await ack(token);writer.append('acks',{send:token.id,...value});return value;};reader.before=token=>ack.before(token);guard.setAck(reader);guard.setCheck(check);
  let errors=await check();const until=clock.now()+cfg.focus_wait_ms;
  while(errors.length&&clock.now()<until){await bounded('foreground wait',()=>clock.wait(cfg.focus_poll_ms),cfg.load_timeout_ms);live();errors=await check();}
  if(errors.length)throw Error(errors.join('; '));
  result.pre_observer_settle_ms=cfg.silence_ms*2;await bounded('pre-observer settle',()=>clock.wait(result.pre_observer_settle_ms),cfg.load_timeout_ms);live();
  const relayBefore=await bounded('relay before',()=>runtime.relayOwnerPid(),cfg.load_timeout_ms);if(relayBefore!==receipt.pid)throw Error('relay ownership mismatch');
  observer=await createSpeechObserver({NVDAClient:runtime.NVDAClient,guard,getGate:runtime.getGate,relayOwnerPid:runtime.relayOwnerPid,startupReceipt:receipt,deadlineMs:clock.now()+cfg.load_timeout_ms,now:clock.now});
  before=observer.read();result.observer_before=before;if(!before.connected||!before.complete||before.phrases.length)throw Error('pre-action observer speech/incomplete');
  errors=await check();if(errors.length)throw Error(errors.join('; '));runtime.assertAuthentic();live();
  writer.append('events',{phase:'action-intent',action:'NVDA-T',capture:true,note:'Frozen capture:true internally uses guarded Control; no standalone stop-speech action',t:clock.now()});
  if(!guard.arm('observer:NVDA-T'))throw Error('title arm refused');actionStarted=clock.now();result.timings.title_requested_ms=actionStarted;titleStarted=true;
  try{await bounded('guarded title',()=>nvda.perform(nvda.keyboardCommands.reportTitle,{capture:true}),cfg.action_timeout_ms);}
  finally{guard.disarm();await new Promise(resolve=>setImmediate(resolve));const quiet=await guard.idle(1000);if(!quiet.quiet)stop('title send still running','timeout');}
  runtime.assertAuthentic();live();primary=await bounded('primary title phrase',()=>nvda.lastSpokenPhrase(),cfg.action_timeout_ms);result.timings.primary_returned_ms=clock.now();
  after=observer.read();const relayAfter=await bounded('relay after',()=>runtime.relayOwnerPid(),cfg.load_timeout_ms);
  assessment=assessObserverQualification({before,after,journal:observer.journal(),action_started_ms:actionStarted,primary_phrase:primary,owned_pid:receipt.pid,relay_pid_before:relayBefore,relay_pid_after:relayAfter});
  // Nonce identity must occur in one original observer phrase within the exact matched primary span.
  // Never reconstruct a nonce across speech entries, and never rewrite the original speech.
  if(!observer.journal().some(entry=>assessment.match_seq.includes(entry.seq)&&spokenTitleHasNonce(entry.text,nonce)))throw Error('matched primary title lacks frozen owned nonce marker');
  Object.assign(result,{assessment,primary_phrase:primary,observer_after:after,observer_normalization:observer.normalization});if(!assessment.candidate_pass)reasons.push(...assessment.reasons);
  const state=guard.status();if(titleIntents!==1||state.acks.missing||state.acks.unconfirmable!==state.sends||state.sends!==intents.length)throw Error('title physical-send/acknowledgement contract incomplete');
 }catch(error){reasons.push(error.message);stop(error.message,guard.status().sends>0?'send':'pre');}
 finally{result.teardown=await close();signal?.removeEventListener('abort',abort);}
 result.guard=guard.status();result.pending_operations=[...active];result.reasons.push(...result.teardown.errors);result.timings.finished_ms=clock.now();
 if(active.size)result.reasons.push('operations remain pending after bounded teardown');
 result.candidate_pass=!!assessment?.candidate_pass&&!guard.isStopped()&&!reasons.length&&result.teardown.quiescence==='QUIET_AT_TEARDOWN';
 writer.append('events',{phase:'finished',candidate_pass:result.candidate_pass,cleanup_pending:active.size>0,t:clock.now()});return result;
}
