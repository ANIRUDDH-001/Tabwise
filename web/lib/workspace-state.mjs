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
