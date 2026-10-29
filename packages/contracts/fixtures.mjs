// Synthetic contract examples only. Never demo evidence or a recorded run.
import { sha256 } from './index.mjs';
const hash='a'.repeat(64), run='00000000-0000-4000-8000-000000000001';
const step={step:1,key:'Tab',text:null,checkpoint:false};
const event={evidence_ref:'key:1',step:1,seq:1,clock:'page-monotonic-ms',t:1,kind:'keydown',text:'Tab',target:'email',duration_ms:null,artifact_path:null};
const valid={
  journey:{version:'0.1.0',journey_id:'fernway-passenger',name:'Passenger',steps:[step]},
  'run-spec':{version:'0.1.0',run_id:run,journey_id:'fernway-passenger',app_hash:hash,variant:'broken',steps:[step]},
  'artifact-manifest':{version:'0.1.0',run_id:run,spec_sha256:hash,evidence_sha256:sha256('{}'),files:[{path:'evidence.json',sha256:sha256('{}'),bytes:2,kind:'evidence'}],stage_timings:[{stage:'capture',started_ms:0,finished_ms:1}],runner:{workflow:'.github/workflows/tabwise-run.yml',event:'workflow_dispatch',head_branch:'main',head_sha:'b'.repeat(40),actor:'test-owner',github_run_id:'1',github_run_attempt:1,profile:'A15',nvda_version:'2026.2'},evidence_status:'incomplete'},
  'evidence-bundle':{version:'0.1.0',run_id:run,journey_id:'fernway-passenger',provenance:'synthetic-test',evidence_status:'incomplete',association:'observation-window-only',lanes:{keys:[event],focus:[],speech:[],app_events:[],screenshots:[]},axe:[]},
  'diagnosis-input':{version:'0.1.0',run_id:run,journey:[step],evidence_refs:['key:1'],timeline:[event],signals:[],axe:{violations:0,rules_checked:0},source:[{path:'passenger.html',sha256:hash,lines:[{n:1,text:'<form></form>'}]}]},
  'diagnosis-output':{verdict:'barrier_found',abstention_reason:null,findings:[{step:1,title:'Synthetic finding',user_impact:'Test fixture',mechanism:'Test fixture',evidence_refs:['key:1'],location:{path:'passenger.html',start_line:1,end_line:1},confidence:'low',patch:null}]},
  patch:{version:'0.1.0',run_id:run,base_sha256:hash,patch_sha256:hash,files:['passenger.html'],diff:'--- a/passenger.html\n+++ b/passenger.html\n',evidence_refs:['key:1'],rationale:'Synthetic contract example',expected_speech_after:[]},
  verdict:{version:'0.1.0',baseline_run_id:run,verify_run_id:'00000000-0000-4000-8000-000000000002',verdict:'INCONCLUSIVE',checks:{symptom_gone:null,other_steps_preserved:null,evidence_complete:false},evidence_refs:[],reason:'Synthetic test; no real run'},
};
export const fixtures=Object.fromEntries(Object.entries(valid).map(([name,value])=>[name,{valid:value,invalid:[{value:{...value,extra:true},keyword:'additionalProperties'},{value:Object.fromEntries(Object.entries(value).slice(1)),keyword:'required'}]}]));
