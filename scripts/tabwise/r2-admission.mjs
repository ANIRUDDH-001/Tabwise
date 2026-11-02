// W5: permanent authority receipts and ephemeral coordinator grants. Built-ins only; no runtime imports.
import {createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify} from 'node:crypto';
const SHA=/^[a-f0-9]{64}$/, REV=/^[a-f0-9]{40}$/, ID=/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const fail=why=>{throw Error(`W5 admission refused: ${why}`);};
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const exact=(v,keys)=>{if(!plain(v)||Object.keys(v).sort().join(',')!==[...keys].sort().join(',')||Object.values(Object.getOwnPropertyDescriptors(v)).some(d=>!('value' in d)))fail('malformed fields');};
export function canonical(v){
 if(v===null||typeof v==='string'||typeof v==='boolean'||Number.isSafeInteger(v))return JSON.stringify(v);
 if(Array.isArray(v))return `[${v.map(canonical).join(',')}]`;
 if(!plain(v))fail('non-JSON value');return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
}
const copy=v=>JSON.parse(canonical(v));
const equal=(a,b)=>canonical(a)===canonical(b);
const digest=v=>createHash('sha256').update(canonical(v)).digest('hex');
const text=v=>typeof v==='string'&&v.length>0&&v.length<=512;
const iso=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
export const publicText=key=>key.export({type:'spki',format:'pem'});
function publicKey(value){if(typeof value!=='string'||value.length>1024)fail('public key');const k=createPublicKey(value);if(k.asymmetricKeyType!=='ed25519')fail('Ed25519 public key required');return k;}
function signed(payload,key){return {payload:copy(payload),signature:sign(null,Buffer.from(canonical(payload)),key).toString('base64')};}
function authentic(envelope,key){
 exact(envelope,['payload','signature']);if(typeof envelope.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature))fail('signature shape');
 const body=canonical(envelope.payload);if(body.length>65536||!verify(null,Buffer.from(body),publicKey(key),Buffer.from(envelope.signature,'base64')))fail('signature mismatch');return copy(envelope.payload);
}
export function validateBinding(b){
 exact(b,['purpose','repository','workflow','revision','actor','owner_approval_ref','review_ref','reviewed_files','reviewed_sha256','qualification_sha256','plan_sha256','fixtures','permitted_attempt','expires_at']);
 if(!['r2-execution','w2a-qualification'].includes(b.purpose)||b.repository!=='ANIRUDDH-001/Tabwise'||!/^\.github\/workflows\/[a-z0-9-]+\.yml$/.test(b.workflow??'')||!REV.test(b.revision??'')||!ID.test(b.actor??'')||!/^D-[0-9]+$/.test(b.owner_approval_ref??'')||!text(b.review_ref))fail('binding identity');
 if(b.purpose==='r2-execution'&&b.workflow!=='.github/workflows/tabwise-r2.yml')fail('purpose/workflow mismatch');
 if(!Array.isArray(b.reviewed_files)||!b.reviewed_files.length||b.reviewed_files.length>256||b.reviewed_files.some(p=>typeof p!=='string'||p.length>256||p.includes('..')||!/^\.?[a-zA-Z0-9_/-][a-zA-Z0-9_./-]*$/.test(p))||!equal(b.reviewed_files,[...new Set(b.reviewed_files)].sort()))fail('reviewed scope');
 if(!['reviewed_sha256','qualification_sha256','plan_sha256'].every(k=>SHA.test(b[k]??''))||b.permitted_attempt!==1||!iso(b.expires_at))fail('digest, attempt or expiry');
 if(!Array.isArray(b.fixtures)||!b.fixtures.length||b.fixtures.length>64)fail('fixtures');
 for(const f of b.fixtures){exact(f,['id','sha256']);if(!/^[a-z][a-z0-9-]{0,63}$/.test(f.id??'')||!SHA.test(f.sha256??''))fail('fixture identity');}
 if(new Set(b.fixtures.map(f=>f.id)).size!==b.fixtures.length)fail('duplicate fixture');return copy(b);
}
function validateConsumer(c){exact(c,['run_id','attempt']);if(!/^[1-9][0-9]{0,19}$/.test(c.run_id??'')||c.attempt!==1)fail('initial run attempt required');return copy(c);}
export function bindingFromGate(gate,{expires_at}){
 const s=gate.status;return validateBinding({purpose:'r2-execution',repository:'ANIRUDDH-001/Tabwise',workflow:'.github/workflows/tabwise-r2.yml',revision:gate.head,actor:s.actor,owner_approval_ref:s.owner_approval_ref,review_ref:s.review_ref,reviewed_files:s.reviewed_files,reviewed_sha256:s.reviewed_sha256,qualification_sha256:s.qualification_sha256,plan_sha256:s.plan_sha256,fixtures:gate.plan.pages.map(p=>({id:p.id,sha256:p.fixture_sha256})),permitted_attempt:1,expires_at});
}
function receiptPayload(p,{id,binding,consumer,now=Date.now(),historical=false}){
 exact(p,['schema','authorization_id','binding','consumer','coordinator_key','consumed_at','consumption_id']);validateBinding(p.binding);validateConsumer(p.consumer);publicKey(p.coordinator_key);
 if(p.schema!=='tabwise-r2-consumption/1'||!ID.test(id??'')||p.authorization_id!==id||!ID.test(p.authorization_id??'')||!iso(p.consumed_at)||!/^[a-f0-9-]{36}$/.test(p.consumption_id??'')||!equal(p.binding,binding)||!equal(p.consumer,consumer)||Date.parse(p.consumed_at)>=Date.parse(binding.expires_at)||Date.parse(p.consumed_at)>now)fail('receipt binding');
 if(!historical&&Date.parse(binding.expires_at)<=now)fail('authorization expired');return copy(p);
}
export function verifyReceipt(envelope,expected){return receiptPayload(authentic(envelope,expected.publicKey),expected);}
// Server-side adapter. authenticate MUST validate the real caller independently of body fields.
// No built-in production authentication fallback or private key provisioning is supplied by this offline task.
export function createAuthority({rpc,authenticate,signingKey}){
 if(typeof rpc!=='function'||typeof authenticate!=='function')fail('authority dependencies');
 const key=typeof signingKey==='string'?createPrivateKey(signingKey):signingKey;if(key?.asymmetricKeyType!=='ed25519'||key.type!=='private')fail('authority signing key');
 return async(request,identity)=>{
  exact(request,request?.action==='consume'?['action','id','binding','consumer','coordinator_key']:['action','id','binding','consumer']);
  const b=validateBinding(request.binding),c=validateConsumer(request.consumer);
  if(!['consume','read'].includes(request.action)||!ID.test(request.id??''))fail('authority action');
  const principal=await authenticate(copy(request),identity);
  if(!plain(principal)||['repository','workflow','revision','actor'].some(k=>principal[k]!==b[k])||principal.run_id!==c.run_id||principal.attempt!==c.attempt)fail('authenticated identity mismatch');
  if(request.action==='consume')publicKey(request.coordinator_key);
  const row=await rpc(request.action,copy(request));
  exact(row,['fresh','receipt']);if(typeof row.fresh!=='boolean'||request.action==='read'&&row.fresh)fail('database response');
  const p=receiptPayload(row.receipt,{id:request.id,binding:b,consumer:c});
  if(p.authorization_id!==request.id||row.fresh&&p.coordinator_key!==request.coordinator_key)fail('database receipt identity');
  return {fresh:row.fresh,receipt:signed(p,key)};
 };
}
function challengeValue(c){exact(c,['page','nonce','pid','ppid']);if(!/^[a-z][a-z0-9-]{0,63}$/.test(c.page??'')||!SHA.test(c.nonce??'')||![c.pid,c.ppid].every(v=>Number.isSafeInteger(v)&&v>0)||c.pid===c.ppid)fail('child challenge');return copy(c);}
export function verifyPageGrant(grant,{id,challenge,binding,consumer,publicKey:key,now=Date.now(),historical=false}){
 exact(grant,['receipt','grant']);const receipt=verifyReceipt(grant.receipt,{id,binding,consumer,publicKey:key,now,historical});
 const payload=authentic(grant.grant,receipt.coordinator_key);exact(payload,['schema','receipt_sha256','challenge']);challengeValue(payload.challenge);
 if(payload.schema!=='tabwise-r2-page-grant/1'||payload.receipt_sha256!==digest(grant.receipt)||!equal(payload.challenge,challenge)||!binding.fixtures.some(f=>f.id===challenge.page))fail('page grant binding');return payload;
}
export async function createCoordinator({id,binding,consumer,transport,publicKey:key}){
 binding=validateBinding(binding);consumer=validateConsumer(consumer);if(!ID.test(id??'')||typeof transport!=='function')fail('coordinator configuration');publicKey(key);
 const pair=generateKeyPairSync('ed25519');let response;
 try{response=await transport({action:'consume',id,binding,consumer,coordinator_key:publicText(pair.publicKey)});}catch{fail('consumption outcome uncertain; never retry launch');}
 exact(response,['fresh','receipt']);const receipt=verifyReceipt(response.receipt,{id,binding,consumer,publicKey:key});
 if(response.fresh!==true)fail('authorization consumed; readback cannot create a launch coordinator');
 if(receipt.authorization_id!==id||receipt.coordinator_key!==publicText(pair.publicKey))fail('coordinator receipt mismatch');
 const envelope=copy(response.receipt),used=new Set(),grants=[];
 return Object.freeze({get receipt(){return copy(envelope);},
  async grant(challenge,child){
   challenge=challengeValue(challenge);if(challenge.pid!==child?.pid||challenge.ppid!==child?.ppid||challenge.page!==child?.page||!binding.fixtures.some(f=>f.id===challenge.page)||used.has(challenge.page))fail('child mismatch or replay: page already used');
   // Spend the page before I/O. A failed/uncertain check never makes it reusable.
   used.add(challenge.page);
   const current=await transport({action:'read',id,binding,consumer});exact(current,['fresh','receipt']);
   verifyReceipt(current.receipt,{id,binding,consumer,publicKey:key});if(current.fresh!==false||!equal(current.receipt,envelope))fail('authority readback changed');
   const value={receipt:copy(envelope),grant:signed({schema:'tabwise-r2-page-grant/1',receipt_sha256:digest(envelope),challenge},pair.privateKey)};grants.push(value);return copy(value);
  },
  record(manifest){if(manifest!==null&&!SHA.test(manifest??''))fail('run manifest digest');const body={schema:'tabwise-r2-admission-record/1',receipt:copy(envelope),grants:copy(grants),run_manifest_sha256:manifest};return {...body,finalization:signed(body,pair.privateKey).signature};},
 });
}
export function verifyAdmissionRecord(record,{id,binding,consumer,publicKey:key,manifest,pages}){
 exact(record,['schema','receipt','grants','run_manifest_sha256','finalization']);const receipt=verifyReceipt(record.receipt,{id,binding,consumer,publicKey:key,historical:true});
 const {finalization,...body}=record;authentic({payload:body,signature:finalization},receipt.coordinator_key);
 if(record.schema!=='tabwise-r2-admission-record/1'||!SHA.test(manifest??'')||record.run_manifest_sha256!==manifest||!Array.isArray(pages)||!pages.length||!Array.isArray(record.grants)||record.grants.length!==pages.length)fail('admission record coverage');
 const challenges=[];
 for(const [i,g] of record.grants.entries()){
  const c=g?.grant?.payload?.challenge;if(c?.page!==pages[i]||!equal(g.receipt,record.receipt))fail('page grant order or receipt');
  verifyPageGrant(g,{id,challenge:c,binding,consumer,publicKey:key,historical:true});challenges.push(c);
 }
 if(new Set(challenges.map(c=>c.page)).size!==pages.length||new Set(challenges.map(c=>c.nonce)).size!==pages.length)fail('duplicate grant');return true;
}
// Child consumes one challenge reply in this process; signatures bind it to the immutable receipt's coordinator.
let pageRequested=false;
export async function requestPageAdmission({channel=process,id,binding,consumer,page,publicKey:key,timeoutMs=5000}){
 if(pageRequested||!channel.connected||typeof channel.send!=='function'||typeof channel.once!=='function'||!Number.isSafeInteger(channel.pid)||!Number.isSafeInteger(channel.ppid))fail('coordinator IPC required; direct page refused');
 pageRequested=true;const challenge={page,nonce:randomBytes(32).toString('hex'),pid:channel.pid,ppid:channel.ppid};
 return new Promise((resolve,reject)=>{
  const finish=(err,value)=>{clearTimeout(timer);channel.off('message',message);channel.off('disconnect',disconnected);if(channel.connected)channel.disconnect();err?reject(err):resolve(value);};
  const disconnected=()=>finish(Error('W5 coordinator disconnected before grant'));
  const message=value=>{try{verifyPageGrant(value,{id,challenge,binding,consumer,publicKey:key});finish(null,value);}catch(error){finish(error);}};
  const timer=setTimeout(()=>finish(Error('W5 page admission timed out')),timeoutMs);
  channel.once('message',message);channel.once('disconnect',disconnected);
  channel.send({schema:'tabwise-r2-page-challenge/1',challenge},error=>{if(error)finish(error);});
 });
}
// Adapter for the existing server-side Supabase client; it must return only after the RPC transaction commits.
export function createPostgresAuthority({client,signingKey,authenticate}){
 if(typeof client?.rpc!=='function')fail('Postgres RPC client missing');
 return createAuthority({signingKey,authenticate,rpc:async(action,request)=>{
  const name=action==='consume'?'w5_consume':action==='read'?'w5_read_receipt':null;if(!name)fail('unsupported RPC action');
  const {data,error}=await client.rpc(name,{p_request:request});if(error||!data)fail('database transaction outcome unavailable');return data;
 }});
}
