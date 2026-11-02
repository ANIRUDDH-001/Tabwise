import {test} from 'node:test';import assert from 'node:assert/strict';
import {draftKey,saveDraft,readDraft,clearDraft,validateSteps,editorRules,versionIndexKey,recordVersion,listVersions,legacyVersions,readVersion,journeyDigest,STEP_LIMIT,sameSteps,relativeTime} from '../lib/local-drafts.mjs';
import {PALETTE} from '../../packages/contracts/palette.mjs';
function memory(seed={}){const map=new Map(Object.entries(seed));return {map,get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>{map.set(k,String(v));},removeItem:k=>{map.delete(k);}};}
const throwing={get length(){throw Error('denied');},key(){throw Error('denied');},getItem(){throw new DOMException('denied','SecurityError');},setItem(){throw new DOMException('denied','SecurityError');},removeItem(){throw Error('denied');}};
const quota={...memory(),setItem(){throw new DOMException('full','QuotaExceededError');}};
const A='fernway-passenger',B='fernway-seat';
const steps=[{step:1,key:'Tab',text:null,checkpoint:false},{step:2,key:'type',text:PALETTE.name,checkpoint:false},{step:3,key:'Enter',text:null,checkpoint:true}];
test('save, read and clear a draft',()=>{
 const s=memory();assert.deepEqual(saveDraft(s,A,steps,1000),{ok:true});
 assert.equal(JSON.parse(s.getItem(draftKey(A))).schema,1);
 const r=readDraft(s,A);assert.equal(r.status,'ok');assert.deepEqual(r.draft.steps,steps);assert.equal(r.draft.updatedAt,1000);
 clearDraft(s,A);assert.equal(readDraft(s,A).status,'none');
});
test('saveDraft never throws and reports quota, denied and unavailable storage',()=>{
 assert.deepEqual(saveDraft(quota,A,steps),{ok:false,reason:'quota'});
 assert.deepEqual(saveDraft(throwing,A,steps),{ok:false,reason:'denied'});
 assert.deepEqual(saveDraft(null,A,steps),{ok:false,reason:'unavailable'});
 assert.equal(readDraft(throwing,A).status,'none');assert.equal(readDraft(null,A).status,'none');
 assert.doesNotThrow(()=>clearDraft(throwing,A));
});
test('corrupt JSON is treated as absent',()=>{const s=memory({[draftKey(A)]:'{not json'});assert.equal(readDraft(s,A).status,'none');});
test('a draft for journey A is never returned for journey B',()=>{
 const s=memory();saveDraft(s,A,steps);assert.equal(readDraft(s,B).status,'none');
 s.setItem(draftKey(B),s.getItem(draftKey(A)));const r=readDraft(s,B);assert.equal(r.status,'invalid');assert.equal(r.draft,null);
});
test('validateSteps rejects wrong journey, unsupported key, out-of-palette text and over-limit length',()=>{
 const rules=editorRules(A);
 assert.deepEqual(validateSteps(A,steps,rules),{ok:true});
 assert.equal(validateSteps(B,steps,rules).ok,false);
 assert.equal(validateSteps(A,[{step:1,key:'Escape',text:null,checkpoint:false}],rules).reason,'unsupported_key');
 assert.equal(validateSteps(A,[{step:1,key:'type',text:'my password',checkpoint:false}],rules).reason,'unsupported_text');
 assert.equal(validateSteps(A,[{step:1,key:'Tab',text:'x',checkpoint:false}],rules).reason,'unsupported_text');
 assert.equal(validateSteps(A,Array.from({length:STEP_LIMIT+1},(_,i)=>({step:i+1,key:'Tab',text:null,checkpoint:false})),rules).reason,'too_many_steps');
 assert.equal(validateSteps(A,'nope',rules).ok,false);
});
test('immediate flush: append a step, flush synchronously, a fresh reader sees it with no timer elapsed',()=>{
 const s=memory();const current=[...steps];saveDraft(s,A,current,1);current.push({step:4,key:'Tab',text:null,checkpoint:false});
 saveDraft(s,A,current,2);const reloaded=readDraft(s,A);assert.equal(reloaded.draft.steps.length,4);
});
test('version index: newest first, de-duplicated by sha, capped at 50',()=>{
 const s=memory();
 for(let i=0;i<55;i++)recordVersion(s,A,{sha:i.toString(16).padStart(64,'0'),savedAt:i,stepCount:3});
 recordVersion(s,A,{sha:(3).toString(16).padStart(64,'0'),savedAt:100,stepCount:2});
 const list=listVersions(s,A);assert.equal(list.length,50);assert.equal(list[0].savedAt,100);
 assert.equal(new Set(list.map(v=>v.sha)).size,50);assert.deepEqual(listVersions(s,B),[]);
 s.setItem(versionIndexKey(B),'corrupt');assert.deepEqual(listVersions(s,B),[]);
});
test('legacy scan lists valid records and skips invalid, foreign and corrupt ones without mutating storage',async()=>{
 const journey={version:'0.1.0',journey_id:A,name:'passenger',steps};const sha=await journeyDigest(journey);
 const foreign={version:'0.1.0',journey_id:B,name:'seat',steps};const fsha=await journeyDigest(foreign);
 const seed={[`tabwise-version:${sha}`]:JSON.stringify({...journey,sha256:sha}),[`tabwise-version:${fsha}`]:JSON.stringify({...foreign,sha256:fsha}),'tabwise-version:bad':'{oops',[`tabwise-version:${'f'.repeat(64)}`]:JSON.stringify({...journey,sha256:'f'.repeat(64)}),'tabwise-version:evil':JSON.stringify({...journey,steps:[{step:1,key:'type',text:'secret',checkpoint:false}]}),other:'x'};
 const s=memory(seed);const before=JSON.stringify([...s.map]);
 const result=await legacyVersions(s,A,editorRules(A));
 assert.deepEqual(result.versions.map(v=>v.sha),[sha]);assert.equal(result.skipped,3);
 assert.equal(JSON.stringify([...s.map]),before);assert.equal(s.getItem(versionIndexKey(A)),null);
 assert.deepEqual(await legacyVersions(throwing,A,editorRules(A)),{versions:[],skipped:0});
 const loaded=await readVersion(s,sha,editorRules(A));assert.deepEqual(loaded.steps,steps);
 assert.equal(await readVersion(s,fsha,editorRules(A)),null);
});
test('helpers compare steps and describe time',()=>{
 assert.ok(sameSteps(steps,structuredClone(steps)));assert.ok(!sameSteps(steps,steps.slice(1)));
 assert.equal(relativeTime(0,30_000),'just now');assert.equal(relativeTime(0,5*60_000),'5 minutes ago');assert.equal(relativeTime(0,2*3600_000),'2 hours ago');
});
