import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import * as module from '../scripts/tabwise/observer.mjs';
import * as qualification from '../scripts/tabwise/observer-qualification.mjs';
function setup(overrides={}){
 let client,stopped=false,t=0;const stops=[],connects=[];
 class Client extends EventEmitter{constructor(){super();client=this;}async connect(options){connects.push(options);}disconnect(){this.closed=true;}}
 const guard={isStopped:()=>stopped,stop:(...args)=>{stopped=true;stops.push(args);}};
 return {args:{NVDAClient:Client,guard,relayOwnerPid:async()=>123,startupReceipt:{pid:123,relay_pid:123,reset_confirmed:true},deadlineMs:1000,now:()=>++t,...overrides},get client(){return client;},stops,connects};
}
test('observer only uses read-only client surface and keeps an immutable append-only event history',async()=>{
 const source=readFileSync('scripts/tabwise/observer.mjs','utf8');for(const forbidden of ['sendKeyCode','enqueueAndTap','spokenPhraseLog'])assert.equal(source.includes(forbidden),false,forbidden);
 const fake=setup(),observer=await module.createSpeechObserver(fake.args);
 assert.equal(fake.connects[0].capture,false);assert.equal(fake.connects[0].deadlineMs,1000);
 const first=observer.read();for(const text of ['one','two','three'])fake.client.emit('speak',text);
 const next=observer.read();assert.equal(first.phrases.length,0);assert.deepEqual(next.phrases,['one','two','three']);
 next.phrases[0]='forged';assert.equal(observer.read().phrases[0],'one');assert.equal(observer.read().session,first.session);
 assert.deepEqual(observer.journal().map(e=>e.seq),[1,2,3]);
 fake.client.emit('close');assert.equal(observer.read().connected,false);assert.equal(observer.read().complete,false);assert.equal(fake.stops.length,1);
 await observer.close();await observer.close();assert.equal(fake.client.closed,true);
});
test('observer ownership mismatch, handler failures and journal overflow fail closed',async()=>{
 const mismatch=setup({relayOwnerPid:async()=>999});await assert.rejects(()=>module.createSpeechObserver(mismatch.args),/ownership/);assert.equal(mismatch.client.closed,true);
 const bad=setup(),observer=await module.createSpeechObserver(bad.args);bad.client.emit('speak',{not:'speech'});assert.equal(observer.read().complete,false);assert.equal(bad.stops.length,1);await observer.close();
 const capped=setup(),limited=await module.createSpeechObserver(capped.args);capped.client.emit('speak','x'.repeat(512001));assert.equal(limited.read().complete,false);assert.equal(limited.read().phrases.length,0);await limited.close();
});
test('qualification assesses a bounded matching title without claiming relay equivalence',()=>{
 const sample={before:{session:'s',phrases:[]},after:{session:'s',connected:true,complete:true,phrases:['Tabwise owned fixture']},journal:[{seq:1,t:25,text:'Tabwise owned fixture'}],action_started_ms:20,primary_phrase:'Tabwise owned fixture',owned_pid:123,relay_pid_before:123,relay_pid_after:123};
 const result=qualification.assessObserverQualification(sample);assert.equal(result.candidate_pass,true);assert.equal(result.relay_equivalence_verified,false);assert.equal(result.first_match_lag_ms,5);
 for(const change of [{relay_pid_after:999},{primary_phrase:'different'},{before:{session:'s',phrases:['unexpected']}},{after:{...sample.after,connected:false}}])assert.equal(qualification.assessObserverQualification({...sample,...change}).candidate_pass,false);
});
test('teardown disarms, waits, reads boundaries, closes observer/browser, then stops NVDA',async()=>{
 const calls=[];const options={guard:{disarm:()=>calls.push('disarm'),quiesce:async()=>{calls.push('quiesce');return {quiet:true};},stop:()=>calls.push('stop')},finalRead:async()=>calls.push('read'),observer:{close:async()=>calls.push('observer')},browser:{close:async()=>calls.push('browser')},nvda:{stop:async()=>calls.push('nvda')}};
 const close=qualification.createQualificationTeardown(options);assert.equal((await close()).quiescence,'QUIET_AT_TEARDOWN');await close();assert.deepEqual(calls,['disarm','quiesce','read','observer','browser','nvda']);
 calls.length=0;options.guard.quiesce=async()=>({quiet:false});const live=await qualification.createQualificationTeardown(options)();assert.equal(live.quiescence,'LIVE_AT_TEARDOWN');assert.equal(calls.includes('browser'),false);assert.equal(calls.at(-1),'nvda');
});
test('teardown retains failures and still disconnects observer and stops NVDA last',async()=>{
 const calls=[];
 const close=qualification.createQualificationTeardown({guard:{disarm:()=>{throw Error('disarm');},quiesce:async()=>{throw Error('quiesce');},stop:()=>calls.push('sticky-stop')},finalRead:async()=>{throw Error('read');},observer:{close:async()=>{calls.push('observer');throw Error('close');}},browser:{close:async()=>calls.push('browser')},nvda:{stop:async()=>calls.push('nvda')}});
 const result=await close();assert.equal(result.errors.length,4);assert.equal(result.quiescence,'LIVE_AT_TEARDOWN');assert.equal(result.physical_quiescence_verified,false);assert.deepEqual(calls,['sticky-stop','observer','nvda']);
});
