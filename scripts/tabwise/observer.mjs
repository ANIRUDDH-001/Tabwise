import {randomUUID} from 'node:crypto';
import {LIMITS} from '../../packages/contracts/limits.mjs';

// Candidate only. The caller must supply the cached, frozen vendored class after its gate is installed.
// No loader or physical input capability is exported here.
export async function createSpeechObserver({NVDAClient,guard,getGate,relayOwnerPid,startupReceipt,deadlineMs,now=()=>performance.now()}){
 if(typeof getGate!=='function'||getGate()!==guard)throw Error('observer registered guard identity mismatch');
 if(!Number.isInteger(startupReceipt?.pid)||startupReceipt.pid<=0||startupReceipt.relay_pid!==startupReceipt.pid||startupReceipt.reset_confirmed!==true||guard.isStopped()||!Number.isFinite(deadlineMs)||now()>=deadlineMs)throw Error('observer ownership/deadline not established');
 const client=new NVDAClient(),session=randomUUID(),phrases=[],journal=[];
 let connected=false,closed=false,failed=false,used=0,last=-Infinity;
 const fail=reason=>{if(failed||closed)return;failed=true;connected=false;guard.stop(`observer: ${reason}`,'send');};
 const registered=()=>{try{if(getGate()!==guard)throw Error('registered guard identity changed');return true;}catch(error){fail(error.message);return false;}};
 const speech=text=>{
  if(closed||failed)return;
  try{
   const t=now();if(typeof text!=='string'||!Number.isFinite(t)||t<last)throw Error('invalid speech/clock');
   const event={seq:phrases.length+1,t,clock:'node-monotonic-ms',text};
   const size=Buffer.byteLength(JSON.stringify(event))+Buffer.byteLength(JSON.stringify(text))+2;
   if(journal.length>=5000||used+size>LIMITS.JOURNAL_BYTES)throw Error('journal cap');
   journal.push(event);phrases.push(text);used+=size;last=t;
  }catch(error){fail(error.message);}
 };
 const lost=()=>fail('connection lost');const error=()=>fail('client error');
 client.on('speak',speech);client.on('close',lost);client.on('end',lost);client.on('error',error);
 const close=async()=>{
  if(closed)return;closed=true;connected=false;
  client.off('speak',speech);client.off('close',lost);client.off('end',lost);client.off('error',error);
  await client.disconnect();
 };
 try{
  await client.connect({capture:false,deadlineMs});
  const owner=await relayOwnerPid({deadlineMs});
  if(!registered()||failed||guard.isStopped()||now()>=deadlineMs||owner!==startupReceipt.pid)throw Error('observer ownership or connection changed');
  connected=true;
 }catch(error){fail(error.message);await close();throw error;}
 return Object.freeze({
  read:()=>{const live=registered()&&connected&&!closed&&!failed&&!guard.isStopped();return {source:'nvda',session,connected:live,complete:live,phrases:[...phrases]};},
  journal:()=>structuredClone(journal),close,
  normalization:'Frozen vendored relay speech strings: trim/collapse whitespace, discard non-string sequence parts, join with comma-space. Not raw audio or raw protocol frames.',
 });
}
