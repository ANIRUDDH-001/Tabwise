export async function saveJourneyToAccount(journey,fetchImpl=fetch){
 const body=JSON.stringify(journey),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body))),value=>value.toString(16).padStart(2,'0')).join('');
 let response;try{response=await fetchImpl('/api/journeys',{method:'POST',headers:{'Content-Type':'application/json'},body});}catch{throw Error('Saving could not be confirmed. Check your workspace before retrying.');}
 if(!response.ok)throw Error(response.status===401?'Sign in to save to your account.':response.status===503?'Account storage is unavailable. Your local draft is still open.':'Saving could not be confirmed. Check your workspace before retrying.');
 const data=await response.json();if(typeof data.id!=='string'||!Number.isSafeInteger(data.n)||data.n<1||data.sha256!==digest)throw Error('The saved version could not be confirmed. Check your workspace before retrying.');return data;
}
