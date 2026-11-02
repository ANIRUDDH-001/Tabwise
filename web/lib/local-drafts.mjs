// Browser-local drafts and versions (T-P0-06, REV-03). Pure: storage is injected; nothing here throws.
import {PALETTE,KEYS} from '../../packages/contracts/palette.mjs';
export const STEP_LIMIT=25;
export const INDEX_CAP=50;
export const draftKey=id=>`tabwise-draft:${id}`;
export const journeyKey=id=>`tabwise-journey:${id}`;
export const versionKey=sha=>`tabwise-version:${sha}`;
export const versionIndexKey=id=>`tabwise-versions:${id}`;
const SHA=/^[a-f0-9]{64}$/;

export function editorRules(journeyId){return {journeyId,keys:[...KEYS],palette:Object.values(PALETTE),limit:STEP_LIMIT};}

function get(storage,key){try{return storage?storage.getItem(key):null;}catch{return null;}}
function parse(text){if(typeof text!=='string')return null;try{return JSON.parse(text);}catch{return null;}}
function failure(error){
 const name=error&&typeof error==='object'?String(error.name):'';
 if(name==='QuotaExceededError'||name==='NS_ERROR_DOM_QUOTA_REACHED'||error?.code===22)return 'quota';
 return 'denied';
}
function set(storage,key,value){
 if(!storage)return {ok:false,reason:'unavailable'};
 try{storage.setItem(key,value);return storage.getItem(key)===value?{ok:true}:{ok:false,reason:'readback_failed'};}catch(error){return {ok:false,reason:failure(error)};}
}

export function validateSteps(journeyId,steps,rules){
 if(!rules||journeyId!==rules.journeyId)return {ok:false,reason:'wrong_journey'};
 if(!Array.isArray(steps))return {ok:false,reason:'not_a_list'};
 if(steps.length>rules.limit)return {ok:false,reason:'too_many_steps'};
 for(const step of steps){
  if(!step||typeof step!=='object')return {ok:false,reason:'malformed_step'};
  if(!rules.keys.includes(step.key))return {ok:false,reason:'unsupported_key'};
  if(step.key==='type'?!rules.palette.includes(step.text):step.text!==null)return {ok:false,reason:'unsupported_text'};
  if(step.checkpoint!==undefined&&typeof step.checkpoint!=='boolean')return {ok:false,reason:'malformed_step'};
 }
 return {ok:true};
}
export const renumber=steps=>steps.map((s,i)=>({step:i+1,key:s.key,text:s.text??null,checkpoint:s.checkpoint===true}));
export function sameSteps(a,b){return JSON.stringify(renumber(a??[]))===JSON.stringify(renumber(b??[]));}

export function saveDraft(storage,id,steps,now=Date.now()){
 return set(storage,draftKey(id),JSON.stringify({journeyId:id,steps:renumber(steps),updatedAt:now,schema:1}));
}
// {status:'none'} when absent/corrupt; {status:'invalid'} when present but not restorable here; {status:'ok',draft}.
export function readDraft(storage,id,rules=editorRules(id)){
 const value=parse(get(storage,draftKey(id)));
 if(!value||typeof value!=='object')return {status:'none',draft:null};
 if(value.schema!==1||!validateSteps(value.journeyId,value.steps,rules).ok)return {status:'invalid',draft:null};
 return {status:'ok',draft:{journeyId:value.journeyId,steps:renumber(value.steps),updatedAt:Number(value.updatedAt)||0}};
}
export function clearDraft(storage,id){try{if(!storage)return {ok:false};storage.removeItem(draftKey(id));return {ok:storage.getItem(draftKey(id))===null};}catch{return {ok:false};}}

// The last locally saved journey (`tabwise-journey:{id}`), validated.
export function readSavedJourney(storage,id,rules=editorRules(id)){
 const value=parse(get(storage,journeyKey(id)));
 if(!value||!validateSteps(value.journey_id??id,value.steps,rules).ok)return null;
 return {steps:renumber(value.steps),sha:SHA.test(value.sha256)?value.sha256:null};
}

export function listVersions(storage,id){
 const value=parse(get(storage,versionIndexKey(id)));
 if(!Array.isArray(value))return [];
 return value.filter(v=>v&&SHA.test(v.sha)&&Number.isFinite(v.savedAt)&&Number.isInteger(v.stepCount));
}
export function recordVersion(storage,id,entry){
 if(!entry||!SHA.test(entry.sha))return {ok:false,reason:'invalid_entry'};
 // Never replace a corrupt/unreadable index with a fresh list: older versions must survive.
 try{const raw=storage?.getItem(versionIndexKey(id));if(raw!==null&&raw!==undefined){const value=parse(raw);if(!Array.isArray(value)||!value.every(v=>v&&SHA.test(v.sha)&&Number.isFinite(v.savedAt)&&Number.isInteger(v.stepCount)))return {ok:false,reason:'corrupt_index'};}}catch{return {ok:false,reason:'denied'};}
 const list=[{sha:entry.sha,savedAt:entry.savedAt,stepCount:entry.stepCount},...listVersions(storage,id).filter(v=>v.sha!==entry.sha)].slice(0,INDEX_CAP);
 return set(storage,versionIndexKey(id),JSON.stringify(list));
}

// A partial save may retain a discoverable payload, but must never acknowledge full success.
export function storeLocalVersion(storage,id,stored,now=Date.now()){
 const payload=JSON.stringify(stored);
 const version=set(storage,versionKey(stored.sha256),payload);if(!version.ok)return version;
 const index=recordVersion(storage,id,{sha:stored.sha256,savedAt:now,stepCount:stored.steps.length});if(!index.ok)return index;
 return set(storage,journeyKey(id),payload);
}

export async function journeyDigest(journey){
 const body={version:journey.version,journey_id:journey.journey_id,name:journey.name,steps:journey.steps};
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body)));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
async function validRecord(record,journeyId,rules,sha){
 if(!record||typeof record!=='object'||record.journey_id!==journeyId)return false;
 if(!validateSteps(record.journey_id,record.steps,rules).ok)return false;
 if(record.sha256!==undefined&&record.sha256!==sha)return false;
 try{return (await journeyDigest(record))===sha;}catch{return false;}
}
// One stored version by sha, only if it belongs to this journey and its digest matches.
export async function readVersion(storage,sha,rules){
 if(!SHA.test(sha))return null;const record=parse(get(storage,versionKey(sha)));
 return await validRecord(record,rules.journeyId,rules,sha)?{sha,steps:renumber(record.steps)}:null;
}
// Read-only scan of `tabwise-version:*`. Never deletes, rewrites or adopts records.
export async function legacyVersions(storage,journeyId,rules){
 const keys=[];
 try{for(let i=0;i<storage.length;i++){const key=storage.key(i);if(typeof key==='string'&&key.startsWith('tabwise-version:'))keys.push(key);}}catch{return {versions:[],skipped:0};}
 const versions=[];let skipped=0;
 for(const key of keys){
  const sha=key.slice('tabwise-version:'.length),record=parse(get(storage,key));
  if(record&&typeof record==='object'&&record.journey_id!==undefined&&record.journey_id!==journeyId)continue;
  if(SHA.test(sha)&&await validRecord(record,journeyId,rules,sha))versions.push({sha,savedAt:null,stepCount:record.steps.length,legacy:true});
  else skipped++;
 }
 return {versions,skipped};
}

export function relativeTime(then,now=Date.now()){
 const s=Math.max(0,Math.round((now-then)/1000));
 if(s<60)return 'just now';const m=Math.round(s/60);if(m<60)return `${m} minute${m===1?'':'s'} ago`;
 const h=Math.round(m/60);if(h<48)return `${h} hour${h===1?'':'s'} ago`;const d=Math.round(h/24);return `${d} days ago`;
}
