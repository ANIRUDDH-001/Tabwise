import {CONFIG_REASONS,reasonText} from './reason-copy.mjs';
// Failures carry `kind` so the editor can offer the right next step: 'signin' | 'config' | 'unavailable' | 'unconfirmed'.
const failure=(kind,message)=>Object.assign(Error(message),{kind});
export async function saveJourneyToAccount(journey,fetchImpl=fetch){
 const body=JSON.stringify(journey),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body))),value=>value.toString(16).padStart(2,'0')).join('');
 let response;try{response=await fetchImpl('/api/journeys',{method:'POST',headers:{'Content-Type':'application/json'},body});}catch{throw failure('unconfirmed','Saving could not be confirmed. Check your workspace before retrying.');}
 if(!response.ok){
  let reason;try{reason=(await response.json())?.reason;}catch{reason=undefined;}
  if(response.status===401)throw failure('signin','Sign in with GitHub to save to your account. Your draft stays in this browser.');
  if(response.status===503&&CONFIG_REASONS.has(reason))throw failure('config',`${reasonText(reason)} Your draft and local versions stay in this browser.`);
  throw failure(response.status===503?'unavailable':'unconfirmed',response.status===503?'Account storage is unavailable. Your local draft is still open.':'Saving could not be confirmed. Check your workspace before retrying.');
 }
 let data;try{data=await response.json();}catch{throw failure('unconfirmed','The saved version could not be confirmed. Check your workspace before retrying.');}
 if(!data||typeof data.id!=='string'||!Number.isSafeInteger(data.n)||data.n<1||data.sha256!==digest)throw failure('unconfirmed','The saved version could not be confirmed. Check your workspace before retrying.');return data;
}
