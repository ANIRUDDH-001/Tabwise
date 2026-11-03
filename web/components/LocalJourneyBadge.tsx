'use client';
import {useEffect,useState} from 'react';
import {readDraft,readSavedJourney,listVersions,legacyVersions,editorRules,sameSteps} from '../lib/local-drafts.mjs';
// Client-only badge: what this browser holds for a journey. Rendered as neutral text until storage is read.
export default function LocalJourneyBadge({id}:{id:string}){
 const [text,setText]=useState('checking this browser…');
 useEffect(()=>{let live=true;(async()=>{
  let storage:Storage|null=null;try{storage=window.localStorage;}catch{storage=null;}
  if(!storage){if(live)setText('browser storage unavailable');return;}
  const rules=editorRules(id),draft=readDraft(storage,id,rules),saved=readSavedJourney(storage,id,rules);
  const indexed=listVersions(storage,id),legacy=await legacyVersions(storage,id,rules);
  const count=new Set([...indexed.map(v=>v.sha),...legacy.versions.map(v=>v.sha)]).size;
  const parts=[];if(draft.status==='ok'&&!sameSteps(draft.draft?.steps,saved?.steps))parts.push('Unsaved draft');
  parts.push(count?`${count} local version${count===1?'':'s'}`:'no local versions');
  if(live)setText(parts.join(' · '));
 })();return()=>{live=false;};},[id]);
 return <span className="local-badge">{text}</span>;
}
