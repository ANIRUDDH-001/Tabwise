// Offline product export only: no signature, runtime or physical-input authority.
import {validateProductDelivery} from './product-delivery.mjs';import {buildR2ProductExport} from './product-export.mjs';import {sha256} from '../../packages/contracts/index.mjs';
import {parseUniqueJson} from './strict-json.mjs';
import {validateRuntimeMetadata} from './runtime-metadata.mjs';
export function buildWorkflowProductExport({delivery,files,github,stageTimings}){const d=validateProductDelivery(delivery),r=d.request;
 if(github?.workflow!==r.workflow||github.revision!==r.revision||github.actor!==r.actor||github.attempt!==1||!/^[1-9][0-9]*$/.test(github.runId??''))throw Error('exact workflow export identity required');
 const source={...files},plan=JSON.parse(d.plan_text),page=plan.pages.find(p=>p.id===r.page_id);for(const [path,bytes] of Object.entries({'product-spec.json':Buffer.from(d.spec_text),'plan.json':Buffer.from(d.plan_text),[page.fixture]:Buffer.from(d.fixture_text)})){if(source[path]&&!Buffer.from(source[path]).equals(bytes))throw Error('export delivered source conflict');source[path]=bytes;}
 const runtime=sealedRuntimeMetadata(source,r.page_id);
 const manifest=JSON.parse(source[r.page_id+'/manifest.json']),expected={repository:'ANIRUDDH-001/Tabwise',workflow:r.workflow,revision:r.revision,actor:r.actor,github_run_id:github.runId,github_run_attempt:1,r2_run_id:github.runId+'-1',r2_source_sha256:r.r2_source_sha256,qualification_sha256:r.qualification_sha256,plan_sha256:r.plan_sha256,page_id:r.page_id,session:manifest.page.session,fixture_sha256:r.fixture_sha256,run_manifest_sha256:sha256(source['run-manifest.json']),page_manifest_sha256:sha256(source[r.page_id+'/manifest.json']),product_run_id:r.product_run_id,journey_id:JSON.parse(d.spec_text).journey_id,spec_sha256:r.spec_sha256,app_hash:r.fixture_sha256,profile:runtime.profile,nvda_version:runtime.nvda_version,spec:JSON.parse(d.spec_text)};
 return {...buildR2ProductExport({files:source,expected,stage_timings:stageTimings}),native_qualified:false,input_authorized:false};}

export function sealedRuntimeMetadata(files,pageId){
 const manifest=parseUniqueJson(Buffer.from(files[pageId+'/manifest.json']).toString('utf8'));
 const sealed=name=>{const bytes=files[pageId+'/'+name],entries=manifest.files.filter(f=>f.path===name);if(!bytes||entries.length!==1||entries[0].sha256!==sha256(bytes)||entries[0].bytes!==bytes.length)throw Error('sealed runtime metadata unavailable');return new TextDecoder('utf-8',{fatal:true}).decode(bytes);};
 // New native sessions record independently queried version and read-back settings in
 // the existing hash-bound journal. Historical /1 files remain readable, never upgraded.
 if(files[pageId+'/native-runtime.json']){
  const r=parseUniqueJson(sealed('native-runtime.json'));
  if(files[pageId+'/events.jsonl']){const text=sealed('events.jsonl');if(text.split('\n').filter(Boolean).map(parseUniqueJson).some(e=>e.phase==='native-runtime'))throw Error('ambiguous runtime metadata sources');}
  if(Object.keys(r).sort().join(',')!=='nvda_version,profile,schema'||r.schema!=='tabwise-native-runtime/1'||typeof r.profile!=='string'||!r.profile||!/^\d+\.\d+(?:\.\d+)?$/.test(r.nvda_version??''))throw Error('native runtime metadata invalid');
  return {profile:r.profile,nvda_version:r.nvda_version};
 }
 const text=sealed('events.jsonl');if(!text.endsWith('\n'))throw Error('interrupted runtime journal');
 const rows=text.split('\n').filter(Boolean).map(parseUniqueJson).filter(e=>e.phase==='native-runtime');
 if(rows.length!==1||Object.keys(rows[0]).sort().join(',')!=='phase,runtime')throw Error('unique observed runtime metadata required');
 const r=validateRuntimeMetadata(rows[0].runtime);return {profile:r.profile,nvda_version:r.nvda_version};
}
