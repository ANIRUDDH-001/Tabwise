import {TYPED_VALUES} from '../../packages/contracts/palette.mjs';

export const SUPPORTED_PRESS=Object.freeze(['Tab','Shift+Tab','Enter','Space']);
// Validate the entire journey before creating a provider or sending any character.
// This is capability qualification only: typing remains refused by the worker.
export function preflightJourney(steps){
 if(!Array.isArray(steps)||!steps.length)throw Error('invalid journey');
 return steps.map(step=>{
  if(step.key==='type'){
   if(typeof step.text!=='string'||!TYPED_VALUES.includes(step.text)||!/^[A-Za-z0-9@.]+$/.test(step.text))throw Error('unsupported typed palette value');
  }else if(!SUPPORTED_PRESS.includes(step.key))throw Error(`unsupported press: ${step.key}`);
  return Object.freeze({...step});
 });
}
