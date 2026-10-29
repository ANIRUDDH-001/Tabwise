import {mkdirSync,writeFileSync,appendFileSync,readFileSync,readdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
const JOURNALS=Object.freeze(['events','intents','focus','page','acks']),CAP=512000,TOTAL=4000000;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function createQualificationWriter(dir,metadata){
 mkdirSync(dirname(dir),{recursive:true});mkdirSync(dir);let sealed=false;
 const sizes=Object.fromEntries(JOURNALS.map(name=>[name,0]));
 for(const name of JOURNALS)writeFileSync(join(dir,`${name}.jsonl`),'',{flag:'wx'});
 return Object.freeze({
  append(name,value){
   if(sealed)throw Error('qualification evidence sealed');if(!JOURNALS.includes(name))throw Error('unknown qualification journal');
   const text=JSON.stringify(value)+'\n',bytes=Buffer.byteLength(text);if(sizes[name]+bytes>CAP)throw Error('qualification journal cap');
   appendFileSync(join(dir,`${name}.jsonl`),text);sizes[name]+=bytes;
  },
  finish(result){
   if(sealed)throw Error('qualification evidence already sealed');
   const bytes=Buffer.from(JSON.stringify(result,null,2)+'\n');if(bytes.length>CAP)throw Error('qualification result cap');
   writeFileSync(join(dir,'result.json'),bytes,{flag:'wx'});
   const files=[...JOURNALS.map(name=>`${name}.jsonl`),'result.json'].sort().map(path=>{const data=readFileSync(join(dir,path));return {path,bytes:data.length,sha256:sha(data)};});
   if(files.reduce((sum,file)=>sum+file.bytes,0)>TOTAL)throw Error('qualification artifact cap');
   const manifest={schema:'tabwise-observer-qualification/1',runner:structuredClone(metadata),evidence_scope:'single owned title observation; no full-worker or physical-safety clearance',files};
   const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n'),hash=sha(manifestBytes);
   writeFileSync(join(dir,'manifest.json'),manifestBytes,{flag:'wx'});writeFileSync(join(dir,'manifest.sha256'),hash+'  manifest.json\n',{flag:'wx'});sealed=true;
   const checked=verifyQualificationArtifact(dir);if(!checked.ok)throw Error(checked.errors.join('; '));return {manifest,manifest_sha256:hash};
  },
 });
}
export function verifyQualificationArtifact(dir){
 const errors=[];try{
  const bytes=readFileSync(join(dir,'manifest.json')),manifest=JSON.parse(bytes),expected=[...JOURNALS.map(name=>`${name}.jsonl`),'result.json'].sort();
  if(bytes.length>65536||manifest.schema!=='tabwise-observer-qualification/1'||!Array.isArray(manifest.files)||JSON.stringify(manifest.files.map(file=>file.path).sort())!==JSON.stringify(expected))throw Error('qualification manifest scope');
  if(readFileSync(join(dir,'manifest.sha256'),'utf8')!==sha(bytes)+'  manifest.json\n')errors.push('qualification manifest digest');
  if(JSON.stringify(readdirSync(dir).sort())!==JSON.stringify([...expected,'manifest.json','manifest.sha256'].sort()))errors.push('qualification artifact coverage');
  let total=0;for(const file of manifest.files){const data=readFileSync(join(dir,file.path));total+=data.length;if(data.length!==file.bytes||data.length>CAP||sha(data)!==file.sha256)errors.push(`qualification file integrity: ${file.path}`);}
  if(total>TOTAL)errors.push('qualification total cap');
 }catch(error){errors.push(error.message);}return {ok:errors.length===0,errors};
}
