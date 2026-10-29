import { LIMITS, CONTRACTS_VERSION } from './limits.mjs';
import { JOURNEY_IDS, KEYS, TYPED_VALUES } from './palette.mjs';

const string = (maxLength=512) => ({type:'string',maxLength});
const integer = (maximum=Number.MAX_SAFE_INTEGER) => ({type:'integer',minimum:0,maximum});
const array = (items,maxItems=1000) => ({type:'array',items,maxItems});
const object = (properties,required=Object.keys(properties)) => ({type:'object',properties,required,additionalProperties:false});
const nullable = schema => ({anyOf:[schema,{type:'null'}]});
const hash = {type:'string',pattern:'^[a-f0-9]{64}$'};
const uuid = {type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'};
const id = {type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'};
const path = {type:'string',maxLength:240,pattern:'^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*(?:/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*)*$'};
const step = object({step:{type:'integer',minimum:1,maximum:LIMITS.MAX_STEPS},key:{type:'string',enum:KEYS},text:nullable({type:'string',enum:TYPED_VALUES}),checkpoint:{type:'boolean'}});
step.allOf=[
  {if:{properties:{key:{const:'type'}},required:['key']},then:{properties:{text:{type:'string',enum:TYPED_VALUES}}},else:{properties:{text:{type:'null'}}}},
];
const steps = {...array(step,LIMITS.MAX_STEPS),minItems:1};
const location = object({path,start_line:{type:'integer',minimum:1},end_line:{type:'integer',minimum:1}});
const patchPrediction = object({diff:string(LIMITS.MAX_PATCH_BYTES),rationale:string(2000),expected_speech_after:array(string(1000),25)});
const finding = object({step:{type:'integer',minimum:1,maximum:25},title:string(160),user_impact:string(2000),mechanism:string(4000),evidence_refs:{...array(id,100),minItems:1},location,confidence:{type:'string',enum:['high','medium','low']},patch:nullable(patchPrediction)});
const diagnosisOutput = object({verdict:{type:'string',enum:['barrier_found','no_barrier','insufficient_evidence']},abstention_reason:nullable(string(2000)),findings:array(finding,25)});
const event = object({evidence_ref:id,step:integer(25),seq:integer(),clock:{type:'string',enum:['node-monotonic-ms','page-monotonic-ms']},t:{type:'number',minimum:0},kind:string(80),text:nullable(string(16000)),target:nullable(string(200)),duration_ms:nullable(integer(30000)),artifact_path:nullable(path)});
const file = object({path,sha256:hash,bytes:integer(LIMITS.RUN_BYTES),kind:{type:'string',enum:['journal','screenshot','evidence','axe','source']}});
const runner = object({workflow:{const:'.github/workflows/tabwise-run.yml'},event:{const:'workflow_dispatch'},head_branch:{const:'main'},head_sha:{type:'string',pattern:'^[a-f0-9]{40}$'},actor:id,github_run_id:{type:'string',pattern:'^[0-9]+$'},github_run_attempt:{type:'integer',minimum:1},profile:{const:'A15'},nvda_version:string(40)});
const raw = {
  journey:object({version:{const:CONTRACTS_VERSION},journey_id:{enum:JOURNEY_IDS,type:'string'},name:string(120),steps}),
  'run-spec':object({version:{const:CONTRACTS_VERSION},run_id:uuid,journey_id:{type:'string',enum:JOURNEY_IDS},app_hash:hash,variant:{type:'string',enum:['healthy','broken','patched']},patch_ref:nullable(hash),steps},['version','run_id','journey_id','app_hash','variant','steps']),
  'artifact-manifest':object({version:{const:CONTRACTS_VERSION},run_id:uuid,spec_sha256:hash,evidence_sha256:hash,files:{...array(file,100),minItems:1},stage_timings:array(object({stage:id,started_ms:integer(),finished_ms:integer()}),30),runner,evidence_status:{type:'string',enum:['complete','incomplete']}}),
  'evidence-bundle':object({version:{const:CONTRACTS_VERSION},run_id:uuid,journey_id:{type:'string',enum:JOURNEY_IDS},provenance:{type:'string',enum:['observed-nvda','synthetic-test']},evidence_status:{type:'string',enum:['complete','incomplete']},association:{const:'observation-window-only'},lanes:object({keys:array(event),focus:array(event),speech:array(event),app_events:array(event),screenshots:array(event)}),axe:array(object({evidence_ref:id,step:integer(25),version:string(40),violations:integer(),artifact_path:path}),25)}),
  'diagnosis-input':object({version:{const:CONTRACTS_VERSION},run_id:uuid,journey:steps,evidence_refs:{...array(id,5000),uniqueItems:true},timeline:array(event,2000),signals:array(object({id,kind:string(100),step:integer(25),refs:array(id,100)}),100),axe:object({violations:integer(),rules_checked:integer()}),source:array(object({path,sha256:hash,lines:array(object({n:{type:'integer',minimum:1},text:string(2000)}),2000)}),20)}),
  'diagnosis-output':diagnosisOutput,
  patch:object({version:{const:CONTRACTS_VERSION},run_id:uuid,base_sha256:hash,patch_sha256:hash,files:{...array(path,3),minItems:1,uniqueItems:true},diff:string(LIMITS.MAX_PATCH_BYTES),evidence_refs:{...array(id,100),minItems:1},rationale:string(2000),expected_speech_after:array(string(1000),25)}),
  verdict:object({version:{const:CONTRACTS_VERSION},baseline_run_id:uuid,verify_run_id:uuid,verdict:{type:'string',enum:['FIXED','NOT_FIXED','REGRESSED','INCONCLUSIVE']},checks:object({symptom_gone:nullable({type:'boolean'}),other_steps_preserved:nullable({type:'boolean'}),evidence_complete:{type:'boolean'}}),evidence_refs:array(id,100),reason:string(2000)}),
};

function freeze(value) {
  if(value && typeof value==='object') {Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
}
export const schemas = freeze(Object.fromEntries(Object.entries(raw).map(([name,schema])=>[name,{$schema:'https://json-schema.org/draft/2020-12/schema',$id:`https://tabwise.dev/contracts/0.1.0/${name}`, ...schema}])));

// The provider subset is intentionally narrower than our internal Draft 2020-12 schemas.
function metaSubset(schema) {
  const out={};
  for(const key of ['type','enum']) if(schema[key]!==undefined) out[key]=structuredClone(schema[key]);
  if(schema.properties) {out.properties=Object.fromEntries(Object.entries(schema.properties).map(([k,v])=>[k,metaSubset(v)]));out.required=Object.keys(out.properties);out.additionalProperties=false;}
  if(schema.items) out.items=metaSubset(schema.items);
  if(schema.anyOf) out.anyOf=schema.anyOf.map(metaSubset);
  return out;
}
export const metaDiagnosisSchema = freeze(metaSubset(diagnosisOutput));
