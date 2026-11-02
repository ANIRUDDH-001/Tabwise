import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recordVersion,versionIndexKey,saveDraft,readDraft,storeLocalVersion,versionKey,journeyKey} from '../lib/local-drafts.mjs';
const id='fernway-seat',entry={sha:'a'.repeat(64),savedAt:1,stepCount:1};
const steps=[{step:1,key:'Tab',text:null,checkpoint:false}];
function memory(){const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),map};}
test('corrupt index is refused without overwriting existing records',()=>{
 const storage=memory();storage.setItem(versionIndexKey(id),'corrupt');storage.setItem('tabwise-version:old','keep');
 assert.equal(recordVersion(storage,id,entry).ok,false);
 assert.equal(storage.getItem(versionIndexKey(id)),'corrupt');assert.equal(storage.getItem('tabwise-version:old'),'keep');
});
test('silent partial writes are not acknowledged as durable drafts or indexes',()=>{
 const storage=memory();storage.setItem=(key,value)=>storage.map.set(key,value.slice(0,-1));
 assert.equal(saveDraft(storage,id,steps).ok,false);assert.equal(readDraft(storage,id).draft,null);
 assert.equal(recordVersion(storage,id,entry).ok,false);
});
test('index failures report quota or denied and leave previous versions intact',()=>{
 for(const name of ['QuotaExceededError','SecurityError']){
  const storage=memory();recordVersion(storage,id,entry);const previous=storage.getItem(versionIndexKey(id));
  storage.setItem=()=>{throw new DOMException('refused',name);};
  assert.equal(recordVersion(storage,id,{...entry,sha:'b'.repeat(64)}).ok,false);
  assert.equal(storage.getItem(versionIndexKey(id)),previous);
 }
});
test('saving an identical hash keeps one discoverable entry',()=>{
 const storage=memory();assert.equal(recordVersion(storage,id,entry).ok,true);
 assert.equal(recordVersion(storage,id,{...entry,savedAt:2}).ok,true);
 assert.deepEqual(JSON.parse(storage.getItem(versionIndexKey(id))),[{...entry,savedAt:2}]);
});
test('local save acknowledges success only after payload, index and current pointer persist',()=>{
 const stored={journey_id:id,sha256:entry.sha,steps};
 for(const failedKey of [versionKey(entry.sha),versionIndexKey(id),journeyKey(id)]){
  const storage=memory(),set=storage.setItem;storage.setItem=(key,value)=>{if(key===failedKey)throw new DOMException('full','QuotaExceededError');set(key,value);};
  assert.equal(storeLocalVersion(storage,id,stored).ok,false,failedKey);
 }
 const storage=memory();assert.equal(storeLocalVersion(storage,id,stored).ok,true);
 assert.equal(storage.getItem(versionKey(entry.sha)),JSON.stringify(stored));
 assert.equal(JSON.parse(storage.getItem(versionIndexKey(id)))[0].sha,entry.sha);
 assert.equal(storage.getItem(journeyKey(id)),JSON.stringify(stored));
});
