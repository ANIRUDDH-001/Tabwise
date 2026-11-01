'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {PALETTE,KEYS} from '@tabwise/contracts/palette';
import {saveJourneyToAccount} from '../lib/account-save.mjs';
import {STEP_LIMIT,editorRules,saveDraft,readDraft,clearDraft,readSavedJourney,listVersions,legacyVersions,readVersion,storeLocalVersion,journeyDigest,renumber,sameSteps,relativeTime} from '../lib/local-drafts.mjs';
import InlineStatus from './ui/InlineStatus';
import StatusChip from './ui/StatusChip';
type Step={step:number,key:string,text:string|null,checkpoint:boolean};
type VersionRow={sha:string,savedAt:number|null,stepCount:number,legacy?:boolean};
const initial:Record<string,Step[]>={
 passenger:[{step:1,key:'Tab',text:null,checkpoint:false},{step:2,key:'type',text:PALETTE.name,checkpoint:false},{step:3,key:'Tab',text:null,checkpoint:false},{step:4,key:'type',text:PALETTE.invalid_email,checkpoint:false},{step:5,key:'Tab',text:null,checkpoint:false},{step:6,key:'Enter',text:null,checkpoint:true}],
 seat:[{step:1,key:'Tab',text:null,checkpoint:false},{step:2,key:'Enter',text:null,checkpoint:true},{step:3,key:'Tab',text:null,checkpoint:false},{step:4,key:'Tab',text:null,checkpoint:false},{step:5,key:'Enter',text:null,checkpoint:true}],
 search:[{step:1,key:'Tab',text:null,checkpoint:false},{step:2,key:'Enter',text:null,checkpoint:true}],
};
const STORAGE_WARNING="Browser storage couldn't confirm a complete save. Keep this page open: unsaved steps may be lost on reload.";
function browserStorage():Storage|null{try{return window.localStorage;}catch{return null;}}
export default function Recorder({id,flow}:{id:string,flow:string}){
 // Journey identity owns all refs, timers and listeners, even when the parent reuses Recorder.
 return <RecorderSession key={`${id}:${flow}`} id={id} flow={flow}/>;
}
function RecorderSession({id,flow}:{id:string,flow:string}){
 const rules=useRef(editorRules(id)).current;
 const [steps,setStepsState]=useState<Step[]>(initial[flow]),[recording,setRecording]=useState(false),[palette,setPalette]=useState(false),[message,setMessage]=useState(''),[variant,setVariant]=useState('broken');
 const [savingAccount,setSavingAccount]=useState(false),[storageWarning,setStorageWarning]=useState(false);
 const [banner,setBanner]=useState<{steps:Step[],updatedAt:number}|null>(null),[versions,setVersions]=useState<VersionRow[]>([]),[skipped,setSkipped]=useState(0);
 const [preview,setPreview]=useState<{sha:string,steps:Step[]}|null>(null),[savingLocal,setSavingLocal]=useState(false);
 const frame=useRef<HTMLIFrameElement>(null);
 const recordingRef=useRef(false),stepsRef=useRef<Step[]>(initial[flow]),dirty=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 function setFrameRecording(enabled:boolean){recordingRef.current=enabled;const target=frame.current?.contentWindow as (Window & {__tabwiseSetRecording?:(value:boolean)=>void})|null;target?.__tabwiseSetRecording?.(enabled);}
 // Synchronous draft write (REV-03). Reports failure truthfully; never throws.
 const flush=useCallback(()=>{
  clearTimeout(timer.current);if(!dirty.current)return {ok:true};
  const result=saveDraft(browserStorage(),id,stepsRef.current);
  setStorageWarning(!result.ok);
  return result;
 },[id]);
 // Every user edit goes through commit: state + ref + debounced autosave; recorded steps flush immediately.
 function commit(next:Step[],immediate=false){
  stepsRef.current=renumber(next) as Step[];dirty.current=true;setStepsState(stepsRef.current);
  clearTimeout(timer.current);
  if(immediate)flush();else timer.current=setTimeout(flush,500);
 }
 const refreshVersions=useCallback(async()=>{
  const storage=browserStorage();if(!storage){setVersions([]);return;}
  const indexed:VersionRow[]=listVersions(storage,id),legacy=await legacyVersions(storage,id,rules);
  const known=new Set(indexed.map(v=>v.sha));
  setVersions([...indexed,...legacy.versions.filter((v:VersionRow)=>!known.has(v.sha))]);setSkipped(legacy.skipped);
 },[id,rules]);
 // Mount: load the last saved journey; offer (never auto-apply) a valid draft that differs from it.
 useEffect(()=>{
  const storage=browserStorage();
  if(!storage){setStorageWarning(true);return;}
  const saved=readSavedJourney(storage,id,rules);
  if(saved){stepsRef.current=saved.steps as Step[];setStepsState(stepsRef.current);}
  const draft=readDraft(storage,id,rules);
  if(draft.status==='invalid')setMessage("A saved draft couldn't be restored.");
  if(draft.status==='ok'&&draft.draft&&!sameSteps(draft.draft.steps,stepsRef.current))setBanner({steps:draft.draft.steps as Step[],updatedAt:draft.draft.updatedAt});
  refreshVersions();
 },[id,rules,refreshVersions]);
 // Lifecycle flushes: hidden tab and page unload.
 useEffect(()=>{
  const onVisibility=()=>{if(document.visibilityState==='hidden')flush();};
  window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',onVisibility);
  return()=>{window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',onVisibility);flush();};
 },[flush]);
 useEffect(()=>{
  const listener=(event:MessageEvent)=>{
   if(event.origin!==location.origin||event.source!==frame.current?.contentWindow||!recordingRef.current)return;
   if(event.data?.type==='tabwise-palette-needed'){setPalette(true);return;}
   if(event.data?.type==='tabwise-pointer'){setMessage('Keyboard only: mouse actions are not recorded.');return;}
   if(event.data?.type==='tabwise-key'){
    const key=event.data.shift&&event.data.key==='Tab'?'Shift+Tab':event.data.key===' '?'Space':event.data.key;
    if(KEYS.includes(key)&&key!=='type'&&stepsRef.current.length<STEP_LIMIT)commit([...stepsRef.current,{step:0,key,text:null,checkpoint:false}],true);
   }
  };window.addEventListener('message',listener);return()=>window.removeEventListener('message',listener);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 function record(){const enabled=!recording;setFrameRecording(enabled);setRecording(enabled);setPalette(false);setMessage(enabled?'Recording keyboard actions inside Fernway. Printable input opens the fixed test-data palette.':'Recording stopped. Review your steps before saving.');if(enabled)frame.current?.focus();}
 function choose(value:string){frame.current?.contentWindow?.postMessage({type:'tabwise-palette',value},location.origin);if(stepsRef.current.length<STEP_LIMIT)commit([...stepsRef.current,{step:0,key:'type',text:value,checkpoint:false}],true);setPalette(false);frame.current?.focus();}
 function restore(){if(!banner)return;commit(banner.steps,true);setBanner(null);setMessage('Draft restored. It keeps autosaving in this browser.');}
 function discard(){if(!clearDraft(browserStorage(),id).ok){setMessage("The draft couldn't be discarded. It is still available to restore.");return;}setBanner(null);setMessage('Draft discarded.');}
 async function saveAccount(){
  if(savingAccount||recording)return;if(!steps.length){setMessage('Add at least one step before saving.');return;}
  setSavingAccount(true);setMessage('Saving to your account…');
  try{const result=await saveJourneyToAccount({version:'0.1.0',journey_id:id,name:flow,steps:renumber(steps)});setMessage(`Saved to your account · version ${result.n} · SHA256 ${result.sha256}. No run has started.`);}
  catch(error){setMessage(error instanceof Error?error.message:'Saving could not be confirmed. Check your workspace.');}
  finally{setSavingAccount(false);}
 }
 async function save(){
  if(savingLocal)return;
  setFrameRecording(false);setRecording(false);if(!steps.length){setMessage('Add at least one step before saving.');return;}
  const journey={version:'0.1.0',journey_id:id,name:flow,steps:renumber(stepsRef.current)};
  setSavingLocal(true);
  try{
   const sha=await journeyDigest(journey),storage=browserStorage();
   const result=storeLocalVersion(storage,id,{...journey,sha256:sha});
   if(!result.ok)throw Error('incomplete save');
   if(sameSteps(stepsRef.current,journey.steps)){clearDraft(storage,id);dirty.current=false;clearTimeout(timer.current);setBanner(null);}
   setStorageWarning(false);setMessage(`Saved as version ${sha.slice(0,7)} · SHA256 ${sha}`);refreshVersions();
  }catch{flush();setMessage('The local save could not be completed. Your steps are still open. Any previously saved versions have been kept.');setStorageWarning(true);}
  finally{setSavingLocal(false);}
 }
 async function load(row:VersionRow){
  const storage=browserStorage();const value=await readVersion(storage,row.sha,rules);
  if(!value){setMessage("That version couldn't be read or failed its integrity check.");return;}
  if(dirty.current&&!sameSteps(stepsRef.current,value.steps)){
   if(!window.confirm('Load this version? Your current unsaved steps stay saved as a draft and can be restored from the banner.'))return;
   const result=flush(),draft=readDraft(storage,id,rules);
   if(!result.ok||draft.status!=='ok'||!draft.draft||!sameSteps(draft.draft.steps,stepsRef.current)){setMessage("Couldn't safely load that version because your current steps couldn't be saved as a draft. Your steps are still open.");return;}
   setBanner({steps:draft.draft.steps as Step[],updatedAt:draft.draft.updatedAt});
  }
  dirty.current=false;clearTimeout(timer.current);stepsRef.current=value.steps as Step[];setStepsState(stepsRef.current);setMessage(`Loaded version ${row.sha.slice(0,7)} into the editor.`);
 }
 async function view(row:VersionRow){const value=await readVersion(browserStorage(),row.sha,rules);if(!value){setMessage("That version couldn't be read or failed its integrity check.");return;}setPreview({sha:row.sha,steps:value.steps as Step[]});}
 function move(index:number,delta:number){const arr=[...stepsRef.current];[arr[index],arr[index+delta]]=[arr[index+delta],arr[index]];commit(arr);}
 const versionsPanel=<section className="versions-panel" aria-labelledby="local-versions"><div className="panel-head" style={{padding:'15px 0'}}><h2 id="local-versions">Local versions</h2><StatusChip tone="info">{versions.length} in this browser</StatusChip></div>
  {versions.length?<ol>{versions.map(v=><li key={v.sha}><span className="mono">{v.sha.slice(0,7)}</span><span>{v.stepCount} step{v.stepCount===1?'':'s'}</span><span className="muted">{v.savedAt?new Date(v.savedAt).toLocaleString():'saved earlier (no timestamp)'}</span><button type="button" className="button secondary small" onClick={()=>view(v)}>View steps</button><button type="button" className="button secondary small recorder-only" disabled={recording||savingLocal} onClick={()=>load(v)}>Load into editor</button></li>)}</ol>:<p className="muted small-note">No local versions yet. “Save local version” stores an immutable, hashed copy in this browser.</p>}
  {preview&&<section className="version-preview" aria-label={`Version ${preview.sha.slice(0,7)}`}><h3>Saved steps · {preview.sha.slice(0,7)}</h3><p className="muted small-note">Read-only preview. Your editor and draft are unchanged.</p><ol aria-label="Saved version steps">{preview.steps.map(s=><li key={s.step}><span>{s.step}. {s.key==='type'?s.text:s.key}{s.checkpoint?' · Checkpoint':''}</span></li>)}</ol><button type="button" className="button secondary small" onClick={()=>setPreview(null)}>Close preview</button></section>}
  {skipped>0&&<p className="muted small-note">{skipped} stored record{skipped===1?'':'s'} couldn't be verified and {skipped===1?'is':'are'} not listed. Nothing was deleted.</p>}</section>;
 return <>
  <div className="notice mobile-note">Recording needs a wider screen (at least 741 px). Your drafts and versions are listed below.</div>
  {storageWarning&&<p className="inline-status is-warning" role="alert">{STORAGE_WARNING}</p>}
  {banner&&<div className="draft-banner" role="region" aria-label="Unsaved draft"><p>You have unsaved steps from {relativeTime(banner.updatedAt)} ({banner.steps.length} step{banner.steps.length===1?'':'s'}).</p><button type="button" className="button small" onClick={restore}>Restore</button><button type="button" className="button secondary small" onClick={discard}>Discard</button></div>}
  <InlineStatus tone={message.startsWith('Saved')?'ok':'info'}>{message}</InlineStatus>
  <div className="recorder-editor"><div className="two-pane"><div><label className="field-label" htmlFor="variant">Sample app variant</label><select id="variant" value={variant} disabled={recording} onChange={e=>setVariant(e.target.value)}><option value="broken">Broken reference</option><option value="healthy">Healthy reference</option></select><iframe ref={frame} title={`Fernway ${flow} keyboard recorder`} className="recorder-frame" style={{marginTop:15}} src={`/fernway?flow=${flow}&variant=${variant}`} sandbox="allow-scripts allow-same-origin allow-forms"/></div>
   <section aria-label="Journey steps"><div className="panel-head" style={{padding:'15px 0'}}><h2>Step editor</h2><StatusChip tone={recording?'failed':'neutral'}>{recording?'Recording · ':''}{steps.length} / {STEP_LIMIT} steps</StatusChip></div>
    <div className="actions"><button type="button" className="button small" aria-pressed={recording} onClick={record}>{recording?'Stop recording':'Record keys'}</button><button type="button" className="button secondary small" disabled={recording} onClick={()=>{commit([],true);setMessage('Steps cleared. The empty draft is autosaved; restore an earlier version below if needed.');}}>Clear steps</button></div>
    <p className="muted" style={{fontSize:12}}>Click Record, then use the keyboard inside Fernway. Only fixed test values are stored; free text is never saved. Drafts autosave in this browser only.</p>
    {palette&&<div className="palette"><h3>Choose test data</h3><p style={{fontSize:12}}>This value will be visible in a future public workflow input.</p>{Object.entries(PALETTE).map(([key,value])=><button type="button" key={key} onClick={()=>choose(value)}>{value}</button>)}</div>}
    <ol className="step-list">{steps.map((s,i)=><li key={i}><span className="step-number">{s.step}</span><div><code>{s.key==='type'?s.text:s.key}</code>{s.checkpoint&&<small className="muted" style={{display:'block'}}>Checkpoint</small>}</div><div className="step-buttons"><button type="button" className="iconbutton" aria-label={`Move step ${i+1} up`} disabled={recording||i===0} onClick={()=>move(i,-1)}>↑</button><button type="button" className="iconbutton" aria-label={`Move step ${i+1} down`} disabled={recording||i===steps.length-1} onClick={()=>move(i,1)}>↓</button><button type="button" className="iconbutton" aria-label={`Toggle checkpoint for step ${i+1}`} aria-pressed={s.checkpoint} disabled={recording} onClick={()=>commit(stepsRef.current.map((v,n)=>n===i?{...v,checkpoint:!v.checkpoint}:v))}>◇</button><button type="button" className="iconbutton" aria-label={`Delete step ${i+1}`} disabled={recording} onClick={()=>commit(stepsRef.current.filter((_,n)=>n!==i))}>×</button></div></li>)}</ol>
    {!steps.length&&<p className="muted small-note">No steps yet. Press “Record keys”, then use Tab, Shift+Tab, Enter and Space inside Fernway.</p>}
    <div className="actions"><button type="button" className="button" onClick={save} disabled={recording||savingLocal}>{savingLocal?'Saving local version…':'Save local version'}</button><button type="button" className="button secondary" disabled={recording||savingAccount} onClick={saveAccount}>{savingAccount?'Saving to account…':'Save to my account'}</button><Link className="textlink" href="/w/me/journeys">Open my saved versions</Link></div>
    <div className="notice">Saving to your account needs GitHub sign-in. Live execution remains gated pending independent worker review; nothing here starts a run. <Link className="textlink" href="/status">What works today</Link></div>
   </section></div></div>
  {versionsPanel}
 </>;
}
