import {JOURNEY_IDS} from '../../packages/contracts/palette.mjs';
import {CONFIG_REASONS,reasonText} from './reason-copy.mjs';
export function workspaceMessage(status,reason){return workspaceState(status,reason).message;}
// Truthful state for a failed /api/workspace (or other owned API) request (T-P0-04).
// actions: 'demo' | 'status' | 'signin' | 'retry'. No sign-in action is offered when sign-in is not configured.
export function workspaceState(status,reason){
 if(status===503&&CONFIG_REASONS.has(reason))return {kind:'config',title:"Sign-in isn't set up here yet",message:"Sign-in isn't set up on this deployment yet. You can still use the demo.",actions:['demo','status']};
 if(status===401)return {kind:'signin',title:'Sign in to see your workspace',message:'Sign in to see your workspace. Your saved journeys and runs appear here after GitHub sign-in.',actions:['signin','demo']};
 if(status===403)return {kind:'forbidden',title:'No access',message:'Your account does not have permission to open this workspace.',actions:['demo']};
 if(status===503)return {kind:'error',title:"We couldn't reach your workspace",message:'Workspace storage is temporarily unavailable. Your saved data has not changed.',actions:['retry','demo']};
 if(status===0||status===undefined||status===null)return {kind:'error',title:"We couldn't reach your workspace",message:"We couldn't reach your workspace. Check your connection and try again.",actions:['retry','demo']};
 return {kind:'error',title:"We couldn't reach your workspace",message:reason&&reason!=='request_failed'?`${reasonText(reason)} The workspace could not be loaded. Please try again.`:'The workspace could not be loaded. Please try again.',actions:['retry','demo']};
}
export function catalogView(rows){return (Array.isArray(rows)?rows:[]).filter(row=>row.app_id==='fernway'&&JOURNEY_IDS.includes(row.id)).map(row=>({id:row.id,name:row.name,supported:row.supported===true,href:`/journeys/${row.id}/edit`}));}
// Partition the /api/workspace payload by section; overview shows counts and the latest three of each (T-P0-03).
export function workspaceSummary(data){
 const list=v=>Array.isArray(v)?v:[];
 const versions=list(data?.versions),runs=list(data?.runs);
 const reports=runs.filter(r=>r?.status==='completed'&&r?.evidence_status==='complete'||r?.diagnostic_evidence_available===true);
 return {counts:{journeys:versions.length,runs:runs.length,reports:reports.length},latest:{journeys:versions.slice(0,3),runs:runs.slice(0,3),reports:reports.slice(0,3)},versions,runs,reports,catalog:list(data?.catalog)};
}
// Readable labels for account data (WEB-05). Pure: everything shown is derived from the /api/workspace payload.
export function journeyName(journeyId,catalog){return (Array.isArray(catalog)?catalog:[]).find(j=>j.id===journeyId)?.name??journeyId;}
export function savedOn(iso){
 if(typeof iso!=='string')return null;const d=new Date(iso);if(Number.isNaN(d.getTime()))return null;
 return `${d.toISOString().slice(0,10)} ${d.toISOString().slice(11,16)} UTC`;
}
// One row per journey: newest version first, with its count and the editor to continue in.
export function savedJourneyGroups(summary){
 const groups=new Map();
 for(const v of summary?.versions??[]){if(!v||typeof v.journey_id!=='string')continue;const g=groups.get(v.journey_id)??{journey_id:v.journey_id,name:journeyName(v.journey_id,summary.catalog),editHref:`/journeys/${v.journey_id}/edit`,versions:[]};g.versions.push(v);groups.set(v.journey_id,g);}
 return [...groups.values()].map(g=>{const versions=[...g.versions].sort((a,b)=>(b.n??0)-(a.n??0));return {...g,versions,latest:versions[0],count:versions.length};});
}
// The single most useful next step for this account. Runs stay gated, so the next step is never "start a run".
export function nextAction(summary){
 const [first]=savedJourneyGroups(summary);
 if(!first)return {title:'Save your first journey',reason:'Record keyboard steps in a Fernway journey, then choose “Save to my account” in the editor.',primary:{label:'Choose a journey',href:'/journeys'},secondary:null};
 return {title:`Continue with ${first.name}`,reason:`Inspect saved version ${first.latest.n}, or open this browser's local draft. The editor does not automatically load your account version.`,primary:{label:'Open local draft',href:first.editHref},secondary:{label:`Inspect version ${first.latest.n}`,href:`/journeys/versions/${first.latest.id}`}};
}
