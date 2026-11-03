// Offline exporter. No runtime authority, signing, input or qualification capability.
import {mkdirSync,writeFileSync,lstatSync,readFileSync,readdirSync} from 'node:fs';
import {resolve,relative,join,isAbsolute,dirname} from 'node:path';
import {sha256,LIMITS} from '../../packages/contracts/index.mjs';
import {safePath,same} from '../../packages/contracts/r2-product.mjs';
import {parseUniqueJson} from './strict-json.mjs';
import {inspectR2ProductExport} from './product-bridge.mjs';
import {captureObservationSources} from './capture-export.mjs';
const parse=b=>parseUniqueJson(new TextDecoder('utf-8',{fatal:true}).decode(b));

export function buildR2ProductExport({files,expected,stage_timings}) {
 if(!files||Object.keys(files).length>97||Object.hasOwn(files,'r2-export.json'))throw Error('sealed source map required');
 const copied={};let total=0;
 for(const [path,bytes] of Object.entries(files)){
  if(!safePath(path)||!(bytes instanceof Uint8Array)||(total+=bytes.length)>LIMITS.RUN_BYTES)throw Error('source path/size');
  copied[path]=Buffer.from(bytes);
 }
 const run=parse(copied['run-manifest.json']),sealed=new Set();
 for(const page of run.pages??[]){
  const manifest=parse(copied[page.id+'/manifest.json']);
  for(const f of manifest.files??[]){const path=page.id+'/'+f.path;sealed.add(path);if(!copied[path]||sha256(copied[path])!==f.sha256||copied[path].length!==f.bytes)throw Error('sealed source digest drift');}
 }
 const observations=[],axe=[];
 for(const path of Object.keys(copied).sort().filter(p=>p.endsWith('.jsonl'))){
  const text=new TextDecoder('utf-8',{fatal:true}).decode(copied[path]);
  if(text&&!text.endsWith('\n'))throw Error('interrupted source journal');
  const lines=text?text.slice(0,-1).split('\n'):[];
  for(const [n,line] of lines.entries()){
   const row=parseUniqueJson(line);
   if(row.schema!=='tabwise-r2-product-observation/1')continue;
   if(!sealed.has(path))throw Error('orphaned observation source');
   (row.lane==='axe'?axe:observations).push({path,line:n+1});
  }
 }
 if(!observations.length)observations.push(...captureObservationSources({files:copied,expected}).map(x=>x.pointer));
 const exp={schema:'tabwise-r2-product-export/1',identity:Object.fromEntries(Object.entries(expected).filter(([k])=>k!=='spec')),source_files:Object.keys(copied).sort().map(path=>({path,sha256:sha256(copied[path]),bytes:copied[path].length,kind:path.endsWith('.png')?'screenshot':path.endsWith('.jsonl')?'journal':'source'})),step_map:expected.spec.steps.map((step,n)=>{
  const m=parse(copied[expected.page_id+'/manifest.json']).step_map.actions[n];return {task:m.task,action:m.action,step:step.step};
 }),observations,axe,stage_timings:structuredClone(stage_timings)};
 copied['r2-export.json']=Buffer.from(JSON.stringify(exp));
 const result=inspectR2ProductExport({files:copied,expected});
 if(!result.ok)throw Error(result.errors.join('; '));
 if(!same(result.preview.manifest.r2_identity,exp.identity))throw Error('export identity');
 return {export:exp,files:copied,source_verified:false,blockers:['Independent native attester unavailable; qualification remains BLOCK.']};
}

// Destination must be new and outside the source tree. Never writes to sealed evidence.
export function writeR2ProductExport({sourceDir,outputDir,expected,stage_timings}){
 const source=resolve(sourceDir),output=resolve(outputDir),rel=relative(source,output);
 if(!rel||!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../')&&!rel.startsWith('..\\'))throw Error('output must be outside sealed source');
 const files={};let total=0;
 function walk(dir,prefix='') {for(const name of readdirSync(dir)){const path=prefix+name,full=join(dir,name),st=lstatSync(full);if(st.isSymbolicLink())throw Error('source symlink');if(st.isDirectory())walk(full,path+'/');else {if(!st.isFile()||!safePath(path)||st.size>LIMITS.RUN_BYTES||(total+=st.size)>LIMITS.RUN_BYTES||Object.keys(files).length>=97)throw Error('source file cap');files[path]=readFileSync(full);}}}
 walk(source);
 const result=buildR2ProductExport({files,expected,stage_timings});
 mkdirSync(output); // Exclusive directory creation; no overwrite or partial output on validation refusal.
 for(const [path,bytes] of Object.entries(result.files)){mkdirSync(dirname(join(output,path)),{recursive:true});writeFileSync(join(output,path),bytes,{flag:'wx'});}
 return {outputDir:output,export_sha256:sha256(result.files['r2-export.json']),source_verified:false,blockers:result.blockers};
}
