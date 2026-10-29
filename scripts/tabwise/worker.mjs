import {decodeSpec,sha256,verifyManifest} from '../../packages/contracts/index.mjs';
import {captureJourney} from '../../src/r2/capture.mjs';
import {ciGuardErrors,workflowGuardErrors} from '../../src/speech/runguard.mjs';
import {readFileSync} from 'node:fs';
import {preflightJourney} from './input-policy.mjs';
import {checkReviewApproval} from './review-approval.mjs';
export {allowLoopback} from './network.mjs';

const offlineTransports=new WeakSet();
// No callbacks or provider objects enter this factory. A label cannot authorize execution.
export function createOfflineTransport(...options){
 if(options.length)throw Error('offline transport accepts no options');
 let t=0;const events=[];
 const transport=Object.freeze({
  clock:Object.freeze({now:()=>t,wait:async ms=>{t+=ms;}}),
  speech:Object.freeze({read:async()=>({source:'fake-nvda',session:'offline',connected:true,complete:true,phrases:[]})}),
  page:Object.freeze({read:async()=>({session:'offline-page',complete:true,clock:'page-monotonic-ms',t,active:'synthetic',state:{},events:structuredClone(events)})}),
  execute:async action=>{const shift=action.press.startsWith('Shift+');const key=shift?action.press.slice(6):action.press;events.push({seq:events.length+1,t,key:key==='Space'?' ':key,shift,type:'keydown'});},
 });
 offlineTransports.add(transport);return transport;
}

export {applyPatch} from '../../src/repair/apply.mjs';

export function liveGate(env,head){
 const errors=[...ciGuardErrors(env),...workflowGuardErrors(env,head,{repository:'ANIRUDDH-001/Tabwise',ref:'refs/heads/main',workflow:'.github/workflows/tabwise-run.yml'})];
 const status=JSON.parse(readFileSync(new URL('review-status.json',import.meta.url),'utf8'));
 errors.push(...checkReviewApproval(status).errors.map(reason=>`BLOCK: ${reason}`));
 if(errors.length)throw Error(errors.join('; '));
 // No implementation may silently turn the offline core into a physical input provider.
 throw Error('BLOCK: real provider binding and physical quiescence qualification are not implemented');
}

export async function runOfflineWorker(envelope,providers){
 const spec=decodeSpec(envelope);
 preflightJourney(spec.steps);
 if(spec.steps.some(s=>s.key==='type'))throw Error('typed physical-send expansion requires independent review');
 if(!offlineTransports.has(providers))throw Error('untrusted offline transport');
 const {speech,page,execute,clock}=providers;
 const capture=await captureJourney({fixture_id:spec.journey_id,actions:spec.steps.map(s=>({step:String(s.step),press:s.key})),observationMs:2000,pollMs:10,timeoutMs:1000,speech,page,execute,clock});
 if(capture.source!=='fake-nvda')throw Error('offline core accepts only fake transport');
 const events={keys:[],focus:[],speech:[],app_events:[],screenshots:[]};
 // Keep the complete R2 observation record as a separate journal; no fake event is reclassified as NVDA.
 const bundle={version:'0.1.0',run_id:spec.run_id,journey_id:spec.journey_id,provenance:'synthetic-test',evidence_status:'incomplete',association:'observation-window-only',lanes:events,axe:[]};
 const files={'capture.json':Buffer.from(JSON.stringify(capture)),'evidence.json':Buffer.from(JSON.stringify(bundle))};
 const manifest={version:'0.1.0',run_id:spec.run_id,spec_sha256:envelope.spec_sha256,evidence_sha256:sha256(files['evidence.json']),files:Object.entries(files).map(([path,bytes])=>({path,sha256:sha256(bytes),bytes:bytes.length,kind:path==='capture.json'?'journal':'evidence'})),stage_timings:[],runner:{workflow:'.github/workflows/tabwise-run.yml',event:'workflow_dispatch',head_branch:'main',head_sha:'0'.repeat(40),actor:'synthetic-test',github_run_id:'0',github_run_attempt:1,profile:'A15',nvda_version:'fake'},evidence_status:'incomplete'};
 const integrity=verifyManifest(manifest,files);if(!integrity.ok)throw Error(integrity.errors.join('; '));
 return {manifest,files,capture};
}
