// Owner-run only against a preview, using two independently authenticated GitHub sessions.
// Never prints cookies, tokens, response bodies or user identities.
import assert from 'node:assert/strict';
const base=new URL(process.env.TABWISE_E2E_URL??'');
assert(base.protocol==='https:'&&base.hostname.endsWith('.vercel.app')&&base.hostname!=='tabwise-meta.vercel.app','preview URL required');
const owner=process.env.TABWISE_E2E_OWNER_COOKIE,other=process.env.TABWISE_E2E_OTHER_COOKIE,run=process.env.TABWISE_E2E_ADMITTED_RUN;
assert(owner&&other&&owner!==other&&/^[a-f0-9-]{36}$/.test(run??''),'two real sessions and an owned admitted run required');
const call=async(path,cookie,method='GET',body)=>{
 const r=await fetch(new URL(path,base),{redirect:'manual',signal:AbortSignal.timeout(20000),method,headers:{cookie,origin:base.origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 let data;try{data=await r.json();}catch{data=null;}return {status:r.status,data};
};
const a=await call('/api/workspace',owner),b=await call('/api/workspace',other);
assert.equal(a.status,200,'real owner session');assert.equal(b.status,200,'real second session');
const journey={version:'0.1.0',journey_id:'fernway-seat',name:'Hosted acceptance',steps:[{step:1,key:'Tab',text:null,checkpoint:true}]};
const saved=[];
for(let i=0;i<2;i++){const s=await call('/api/journeys',owner,'POST',journey);assert.equal(s.status,201,'save');saved.push(s.data);const p='/api/journeys/versions/'+s.data.id;const read=await call(p,owner);assert.equal(read.status,200);assert.deepEqual(read.data.steps,journey.steps);assert.equal(read.data.sha256,s.data.sha256);assert.equal((await call(p,other)).status,404);}
assert.equal(saved[1].n,saved[0].n+1);assert.equal(saved[1].sha256,saved[0].sha256);
assert.equal((await call('/api/journeys/versions/'+saved[0].id,owner)).data.sha256,saved[0].sha256);
assert.equal((await call('/api/runs/'+run+'/native-request',other,'POST')).status,404);
const prepared=await call('/api/runs/'+run+'/native-request',owner,'POST');assert.equal(prepared.status,200,'owned admitted run preparation');
const persisted=await call('/api/runs/'+run+'/native-request',owner);assert.equal(persisted.status,200);assert.equal(persisted.data.state,'PREPARED');assert.equal(persisted.data.request_sha256,prepared.data.request_sha256);assert.equal(persisted.data.can_dispatch,false);assert.equal(persisted.data.native_qualified,false);
const missing='00000000-0000-4000-8000-000000000000';
for(const suffix of ['', '/apply','/oracle']){const r=await call('/api/patches/'+missing+suffix,other,'POST',{});assert([400,404,409].includes(r.status),'invalid or missing repair refused; not a repair ownership test');}
// Do not invoke dispatch, ingestion, diagnosis or provider APIs. Owner checks read-only ledgers separately.
console.log('PASS preview persistence/isolation/refusal checks; real OAuth requires the separate browser checklist; outbound/paid absence requires ledger reconciliation.');
