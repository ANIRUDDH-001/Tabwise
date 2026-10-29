import {authorizeRun,HttpError} from './core.mjs';
export function requireOwnedRun(user,{data,error}){
 if(error)throw new HttpError(503,'run_service_unavailable');authorizeRun(user,data);return data;
}
