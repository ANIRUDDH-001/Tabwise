import {HttpError} from './core.mjs';
import {assertContract} from '../../../packages/contracts/index.mjs';
export function ownedJourneyVersion(user,{data,error}){
 if(error)throw new HttpError(503,'journey_service_unavailable');
 if(!data||data.user_id!==user.id)throw new HttpError(404,'journey_version_not_found');
 try{assertContract('journey',{version:'0.1.0',journey_id:data.journey_id,name:'Saved journey',steps:data.steps});if(!Number.isInteger(data.n)||data.n<1||!/^[a-f0-9]{64}$/.test(data.sha256))throw Error('invalid stored metadata');}catch{throw new HttpError(409,'stored_journey_version_invalid');}
 const {id,journey_id,n,sha256,steps,created_at}=data;return {id,journey_id,n,sha256,steps,created_at};
}
