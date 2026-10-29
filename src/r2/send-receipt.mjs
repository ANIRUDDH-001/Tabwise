// M2A: offline, injected receipt collection only. No transport, input, browser,
// capture deadline change or R2 page-ack judgement. The supplied gate must be the
// actual frozen sendGate instance owned by the caller; this is not a gate loader
// or runtime attestation. Token authority stays in the gate's private WeakMap.
import {VK, pageKeyOf} from '../speech/sendguard.mjs';
import {withTimeout} from '../speech/capture.mjs';
import {SUPPORTED_PRESS} from '../../scripts/tabwise/input-policy.mjs';

const installed = new WeakSet();
// Ledgers this module built. Lets a consumer refuse a ledger-shaped object it did not get from here.
const ledgers = new WeakSet();
export const isSendReceiptLedger = value => ledgers.has(value);
const copy = value => structuredClone(value);
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const count = n => Number.isSafeInteger(n) && n >= 0;
const expected = press => ({key:press === 'Space' ? ' ' : press.replace('Shift+',''),shift:press === 'Shift+Tab'});
const vks = press => press === 'Shift+Tab' ? [VK.Shift,VK.Tab] : [{Tab:VK.Tab,Enter:VK.Enter,Space:VK.Space}[press]];

/**
 * createSendReceiptLedger({gate,getGate,ackReader,onIntent,actions,now})
 * Install BEFORE arming the gate, with an already frozen ackReader function.
 * This keeps its .before identity immutable even though the gate sees a wrapper.
 * Caller explicitly supplies the existing intent
 * callback (or a deliberate no-op for a fresh gate); setters expose no getters.
 * The ledger owns these hooks, chains onIntent and does not expose its wrappers.
 * begin(step,{deadlineAt}) precedes the executor request. deadlineAt is an absolute
 * Node-monotonic COLLECTION bound, never a scoring/acknowledgement deadline.
 * await finish(step,{settleTimeoutMs=3000}) checks gate.idle with a bounded wait
 * (positive integer, at most 5000ms), then checks final gate state. This collection
 * wait is NOT the acknowledgement deadline or proof of physical quiescence.
 * expire(step) records an
 * external timeout/cancellation. read() returns detached, serializable diagnostics.
 * No commit/send/release/arm call is performed by this module.
 */
export function createSendReceiptLedger({gate,getGate,ackReader,onIntent,actions,now}) {
  if (!gate || !Object.isFrozen(gate) || ['setAck','onIntent','status','stop','isStopped','idle'].some(k=>typeof gate[k] !== 'function') ||
    typeof getGate !== 'function' || getGate() !== gate || typeof now !== 'function' ||
    typeof ackReader !== 'function' || typeof ackReader.before !== 'function' || typeof onIntent !== 'function') throw Error('receipt: missing owned gate/reader bindings');
  if(!Object.isFrozen(ackReader))throw Error('receipt: immutable frozen acknowledgement reader required');
  if (installed.has(gate)) throw Error('receipt: gate already has a ledger');
  if (!Array.isArray(actions) || !actions.length || actions.length > 1000 ||
    actions.some(a=>typeof a?.step !== 'string' || !/^a[0-9]{1,12}$/.test(a.step) || a.step.trim() !== a.step || !SUPPORTED_PRESS.includes(a.press)) ||
    new Set(actions.map(a=>a.step)).size !== actions.length) throw Error('receipt: invalid action contract');
  const journey=actions.map(({step,press})=>({step,press})), before=ackReader.before;
  const receipts=[],errors=[],known=new WeakMap();
  let active=null,next=0,lastTime=-Infinity,lastId=0,lastSends,failed=false;
  function refuse(message) {
    const reason=`receipt: ${message}`;failed=true;
    if(!errors.includes(reason))errors.push(reason);
    if(active&&!active.errors.includes(reason))active.errors.push(reason);
    gate.stop(reason,'protocol');return Error(reason);
  }
  function stamp() {
    const t=now();
    if(!Number.isFinite(t)||t<0||t<lastTime)throw refuse('invalid or regressing clock timestamp');
    lastTime=t;return t;
  }
  function state() {
    if(getGate()!==gate)throw refuse('registered gate identity changed');
    const s=gate.status();
    if(!s||!count(s.sends)||!count(s.live)||!count(s.refused)||typeof s.stopped!=='boolean'||typeof s.misdelivered!=='boolean'||
      !s.acks||['confirmed','missing','unconfirmable'].some(k=>!count(s.acks[k])))throw refuse('invalid gate counters');
    return copy({sends:s.sends,live:s.live,refused:s.refused,stopped:s.stopped,misdelivered:s.misdelivered,acks:s.acks});
  }
  function current(step) {
    if(!active||active.step!==step||active.finished_at!==null)throw refuse('action identity/order mismatch or no active action');
    return active;
  }
  function timely(r,t) {
    if(r.expired||r.finished_at!==null||r!==active||t>r.deadline_at){r.late=true;throw refuse('receipt after collection timeout or closed action');}
  }
  function tokenRecord(token,allowClosed=false) {
    const binding=known.get(token);
    if(!binding||(!allowClosed&&binding.record!==active))throw refuse('unknown gate token identity');
    const r=binding.record;
    if(token.action!==binding.action||token.action.label!==r.action_label||token.key!==r.press||!same(token.info,binding.info))throw refuse('token label/key/identity changed');
    state();return r;
  }
  const initial=state();
  if(initial.stopped||initial.live!==0)throw Error('receipt: gate not available for installation');
  lastSends=initial.sends;

  gate.onIntent(token=>{
    try {
      const t=stamp(),r=active;
      if(failed||!r)throw refuse('token outside active action');
      timely(r,t);
      if(r.token||known.has(token))throw refuse('duplicate send: one token per action');
      if(!Object.isFrozen(token)||!Object.isFrozen(token.action)||!Number.isSafeInteger(token.id)||token.id<=lastId||
        !count(token.epoch)||token.action.label!==r.action_label)throw refuse('token identity, order or action label mismatch');
      if(token.key!==r.press||token.info?.path!=='nvda'||!Array.isArray(token.info.keys)||
        !same(token.info.keys.map(k=>k.vk),vks(r.press))||!same(pageKeyOf(token.info),r.expected_key))throw refuse('token key differs from action contract');
      if(state().sends!==r.gate_started.sends)throw refuse('send counter changed before token');
      known.set(token,{record:r,action:token.action,info:copy(token.info)});lastId=token.id;
      r.token={id:token.id,epoch:token.epoch,action_label:token.action.label,key:token.key,info:copy(token.info)};
      r.token_observed_at=t;
      try {
        const returned=onIntent(token);
        let then;
        try {then=returned?.then;}catch(error){
          // A native rejected Promise may hide .then behind a throwing getter.
          // Consume that rejection without invoking its replacement accessor.
          try {Reflect.apply(Promise.prototype.then,returned,[()=>{},()=>{}]);}catch{}
          throw error;
        }
        if(typeof then==='function'){
          const error=refuse('intent callback must be synchronous; thenable returned');
          // Assimilate the captured method once, after stopping the gate. Never
          // await an asynchronous intent or allow its failure to go unhandled.
          Promise.resolve({then:(resolve,reject)=>{
            const child=Reflect.apply(then,returned,[resolve,reject]);
            // Some thenables return a rejected native child as well as invoking
            // a continuation. Drain it too; do not recursively run more thenables.
            try {Reflect.apply(Promise.prototype.then,child,[()=>{},()=>{}]);}catch{}
          }}).catch(()=>{});
          throw error;
        }
      }catch(error){
        if(!failed)refuse(`intent callback failed: ${error?.message??String(error)}`);
        throw error; // Preserve the original synchronous callback exception.
      }
    } catch(error) { if(!failed)throw refuse(error.message);throw error; }
  });

  const wrapped=async function(token) {
    // First operation on entry: never stamp this boundary after awaiting the reader.
    const entered=stamp(),r=tokenRecord(token);
    if(r.released_at!==null)throw refuse('duplicate release receipt');
    r.released_at=entered;r.gate_at_release=state();
    try {
      if(r.before_settled_at===null||r.before_result?.length!==0)throw refuse('release before successful before-call boundary');
      if(r.gate_at_release.sends!==r.gate_before_call.sends+1)throw refuse('release send counter inconsistent');
      r.commit={kind:'gate-state-inference',not_before:r.before_settled_at,not_after:entered,
        sends_before:r.gate_before_call.sends,sends_after:r.gate_at_release.sends};
      timely(r,entered);
      r.r1_ack.state='pending';
      const answer=await Reflect.apply(ackReader,this,[token]);
      const ended=stamp();tokenRecord(token,true);
      if(!answer||typeof answer.ack!=='boolean'||!Array.isArray(answer.reasons)||answer.reasons.some(v=>typeof v!=='string'))throw refuse('invalid R1 acknowledgement result');
      if(r.expired||r!==active||r.finished_at!==null||ended>r.deadline_at||state().acks.missing>r.gate_started.acks.missing){
        r.late=true;r.late_ack_result=copy(answer);throw refuse('R1 reader result after timeout or closed action');
      }
      r.r1_ack={state:'returned',result:copy(answer),completed_at:ended};
      r.gate_after_reader=state();
      if(r.gate_after_reader.sends!==r.gate_at_release.sends)throw refuse('send counter changed during reader');
      return answer;
    } catch(error) {
      if(r.r1_ack.state!=='returned')r.r1_ack.state=r.expired||r.late?'late':'failed';
      if(!failed)throw refuse(error.message);throw error;
    }
  };
  wrapped.before=async function(token) {
    const entered=stamp(),r=tokenRecord(token);
    try {
      if(r.before_call_at!==null)throw refuse('duplicate before-call boundary');
      r.before_call_at=entered;r.gate_before_call=state();timely(r,entered);
      if(ackReader.before!==before)throw refuse('before-reader capability changed');
      if(r.gate_before_call.sends!==r.gate_started.sends)throw refuse('before-call send counter inconsistent');
      const answer=await Reflect.apply(before,this,[token]);
      const ended=stamp();tokenRecord(token);timely(r,ended);
      if(!Array.isArray(answer)||answer.some(v=>typeof v!=='string'))throw refuse('invalid before-call result');
      if(state().sends!==r.gate_before_call.sends)throw refuse('send counter changed during before-call');
      r.before_result=copy(answer);r.before_settled_at=ended;
      return answer;
    } catch(error) { if(!failed)throw refuse(error.message);throw error; }
  };
  gate.setAck(Object.freeze(wrapped));installed.add(gate);

  const ledger=Object.freeze({
    begin(step,{deadlineAt}={}) {
      if(active)throw refuse('concurrent active actions');
      if(failed||journey[next]?.step!==step)throw refuse('action identity/order mismatch');
      const t=stamp(),s=state();
      if(!Number.isFinite(deadlineAt)||deadlineAt<=t)throw refuse('invalid collection deadline timestamp');
      if(s.stopped||s.sends!==lastSends||s.live!==0)throw refuse('gate stopped, busy or send counter changed outside action');
      const action=journey[next];
      active={...action,action_label:`tabwise:${step}`,expected_key:expected(action.press),
        token:null,token_observed_at:null,started_at:t,deadline_at:deadlineAt,before_call_at:null,before_settled_at:null,
        before_result:null,released_at:null,commit:null,r1_ack:{state:'not-entered',result:null,completed_at:null},
        gate_started:s,gate_before_call:null,gate_at_release:null,gate_after_reader:null,gate_finished:null,
        finished_at:null,finishing:false,release_settlement:{wait_ms:null,quiet:false,timed_out:false,error:null},
        expired:false,late:false,late_ack_result:null,complete:false,errors:[],
        physical_delivery_verified:false,guarded_execution_verified:false,quiescence:'UNVERIFIED',r2_page_ack_verified:false};
      receipts.push(active);return copy(active);
    },
    expire(step) {
      const r=current(step);r.expired=true;refuse('collection timeout/cancellation');return copy(r);
    },
    async finish(step,{settleTimeoutMs=3000}={}) {
      const r=current(step);
      if(r.finishing)throw refuse('duplicate concurrent receipt finalization');
      if(!Number.isSafeInteger(settleTimeoutMs)||settleTimeoutMs<=0||settleTimeoutMs>5000)throw refuse('invalid settlement wait bound');
      r.finishing=true;
      try {
        state(); // Recheck registration before consulting the owned gate.
        const settled=await withTimeout(Promise.resolve().then(()=>gate.idle(settleTimeoutMs)),settleTimeoutMs);
        r.release_settlement={wait_ms:settleTimeoutMs,quiet:!settled.timedOut&&!settled.error&&settled.value?.quiet===true,
          timed_out:settled.timedOut,error:settled.error??null};
        const t=stamp(),s=state();r.finished_at=t;r.gate_finished=s;
        if(t>r.deadline_at){r.expired=true;r.late=true;}
        if(!r.release_settlement.quiet)throw refuse('gate release settlement pending, failed or timed out');
        const delta=s.sends-r.gate_started.sends;
        if(delta<0||delta>1||(r.released_at!==null&&delta!==1))throw refuse('final send counter inconsistent');
        if(!r.commit||r.r1_ack.state!=='returned'||r.r1_ack.result?.ack!==true||r.r1_ack.result.reasons.length)throw refuse('missing successful R1 release acknowledgement');
        if(s.acks.confirmed!==r.gate_started.acks.confirmed+1||s.acks.missing!==r.gate_started.acks.missing||s.acks.unconfirmable!==r.gate_started.acks.unconfirmable)throw refuse('final acknowledgement counters inconsistent');
        if(failed||r.expired||s.stopped||s.misdelivered||s.live!==0)throw refuse('gate stopped, timeout or unfinished operation');
        r.complete=true;
      } catch(error) { if(!failed)refuse(error.message); }
      // A failed clock can leave finished_at unknown; never substitute a fake time.
      r.finishing=false;active=null;next++;if(r.gate_finished)lastSends=r.gate_finished.sends;
      return copy(r);
    },
    read:()=>copy({schema:'r2-gate-release-receipts/1',clock:'node-monotonic-ms',
      provenance:{kind:'synthetic',attestation:'UNATTESTED',scope:'owned gate callbacks and counters; no physical boundary attestation'},
      guarded_execution_verified:false,physical_delivery_verified:false,quiescence:'UNVERIFIED',r2_page_ack_verified:false,
      complete:!failed&&receipts.length===journey.length&&receipts.every(r=>r.complete),receipts,errors}),
  });
  ledgers.add(ledger);return ledger;
}
