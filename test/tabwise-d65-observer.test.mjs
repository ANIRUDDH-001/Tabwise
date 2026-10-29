import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createSpeechObserver} from '../scripts/tabwise/observer.mjs';
import {assessObserverQualification} from '../scripts/tabwise/observer-qualification.mjs';
function fake(){let stopped=false,created=0,client,registered;const stops=[];const guard={isStopped:()=>stopped,stop:(...args)=>{stopped=true;stops.push(args);}};registered=guard;class Client extends EventEmitter{constructor(){super();created++;client=this;}async connect(){}disconnect(){}loseTransport(){registered.stop('NVDA protocol: connection closed','send');}}
 return {guard,stops,get created(){return created;},get client(){return client;},replaceGate:g=>registered=g,args:{NVDAClient:Client,guard,getGate:()=>registered,relayOwnerPid:async()=>12,startupReceipt:{pid:12,relay_pid:12,reset_confirmed:true},deadlineMs:1000,now:()=>1}};}
test('N1 refuses non-identical registered guard before constructing a client',async()=>{
 const f=fake();f.replaceGate({isStopped:()=>false,stop:()=>{}});await assert.rejects(()=>createSpeechObserver(f.args),/guard|identity/);assert.equal(f.created,0);
});
test('N1 detects real-style silent transport loss through the exact registered singleton',async()=>{
 const f=fake(),observer=await createSpeechObserver(f.args);assert.equal(observer.read().connected,true);f.client.loseTransport();
 const lost=observer.read();assert.equal(lost.connected,false);assert.equal(lost.complete,false);assert.equal(f.stops.length,1);await observer.close();
});
test('N1 refuses identity changes on every read instead of inventing observed silence',async()=>{
 const f=fake(),observer=await createSpeechObserver(f.args);f.replaceGate({isStopped:()=>false,stop:()=>{}});
 assert.equal(observer.read().complete,false);assert.equal(observer.read().connected,false);assert.equal(f.stops.length,1);await observer.close();
});
function sample(phrases){return {before:{session:'s',phrases:[]},after:{session:'s',connected:true,complete:true,phrases},journal:phrases.map((text,i)=>({seq:i+1,t:20+i,text})),action_started_ms:20,primary_phrase:'Tabwise nonce-x. Google Chrome',owned_pid:12,relay_pid_before:12,relay_pid_after:12};}
test('N2 accepts only an exact ordered contiguous primary capture join and records its rule/span',()=>{
 const match=assessObserverQualification(sample(['Tabwise nonce-x','Google Chrome']));assert.equal(match.candidate_pass,true);assert.equal(match.match_rule,'exact-contiguous-join');assert.deepEqual(match.match_seq,[1,2]);
 for(const phrases of [['Google Chrome','Tabwise nonce-x'],['Tabwise nonce-x'],['Tabwise nonce-x','interleaved','Google Chrome'],['tabwise nonce-x','Google Chrome']])assert.equal(assessObserverQualification(sample(phrases)).candidate_pass,false);
 const one=assessObserverQualification(sample(['Tabwise nonce-x. Google Chrome']));assert.equal(one.candidate_pass,true);assert.equal(one.match_rule,'exact-single');assert.deepEqual(one.match_seq,[1]);
 const late=sample(['Tabwise nonce-x','Google Chrome']);late.journal[0].t=19;assert.equal(assessObserverQualification(late).candidate_pass,false);
});
