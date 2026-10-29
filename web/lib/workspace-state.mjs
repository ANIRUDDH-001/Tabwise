import {JOURNEY_IDS} from '../../packages/contracts/palette.mjs';
export function workspaceMessage(status){
 if(status===401)return 'Sign in to open your saved journeys and runs.';
 if(status===403)return 'Your account does not have permission to open this workspace.';
 if(status===503)return 'Workspace storage is temporarily unavailable. Your saved data has not changed.';
 return 'The workspace could not be loaded. Please try again.';
}
export function catalogView(rows){return (Array.isArray(rows)?rows:[]).filter(row=>row.app_id==='fernway'&&JOURNEY_IDS.includes(row.id)).map(row=>({id:row.id,name:row.name,supported:row.supported===true,href:`/journeys/${row.id}/edit`}));}
