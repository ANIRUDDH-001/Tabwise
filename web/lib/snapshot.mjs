import {sha256} from '../../packages/contracts/index.mjs';
// D53 historical artifact metadata/ZIP digest was checked again during D-59.
export const R1_ANCHOR=Object.freeze({run_id:'r1-20261028T134638Z',github_run_id:'40699318334',artifact_id:'12821645543',archive_sha256:'ad81356f0ff62c3146080c673acc39b9f61f76cb1f3cecc07320b891aa228052',files:Object.freeze({
 'attempt-1.jsonl':'aea200d8a0970a70c6c64528c087e3462254a5bc4f64c60a22dd529e85e22276',
 'focus-1.jsonl':'a950a40e24d7f1743a7fe6c2290a71558b3d2c2da4ab84dfde923781adb86c66',
 'raw-1.json':'7c192be4b9c3d6408251d4352f2b9201471ac3ac3cf33e8ac5adc64eccd2d670',
 'sends-1.jsonl':'6a8b5dd534df6347a6fdd46c01eace1b341fd5795ed3cab6f381f6d62a2146a5',
 'summary.json':'e00dc996f40664efb88f8af57d848b8d25cccbd5031e329b785b438493ede0b8',
})});
export function validateSnapshot(snapshot){
 const errors=[];
 if(!snapshot||typeof snapshot!=='object')return {ok:false,errors:['missing snapshot']};
 for(const field of ['run_id','github_run_id','model_provenance','limitations','snapshot_sha256','files','source_bytes'])if(!snapshot[field])errors.push(`missing ${field}`);
 if(snapshot.source_kind!=='public-r1')errors.push('only explicitly imported public R1 diagnostic snapshots are currently supported');
 if(!Array.isArray(snapshot.limitations)||!snapshot.limitations.length)errors.push('limitations required');
 if(snapshot.model_provenance?.status!=='not_run')errors.push('R1 has no model output');
 const {snapshot_sha256,...body}=snapshot;
 if(sha256(JSON.stringify(body))!==snapshot_sha256)errors.push('snapshot integrity');
 const expectedPaths=Object.keys(R1_ANCHOR.files).sort();
 if(!Array.isArray(snapshot.files)||JSON.stringify(snapshot.files.map(f=>f.path).sort())!==JSON.stringify(expectedPaths)||JSON.stringify(Object.keys(snapshot.source_bytes??{}).sort())!==JSON.stringify(expectedPaths))errors.push('R1 archive file coverage');
 for(const [path,hash] of Object.entries(R1_ANCHOR.files))if(sha256(Buffer.from(snapshot.source_bytes?.[path]??'','base64'))!==hash)errors.push(`trusted archive bytes differ: ${path}`);
 for(const file of snapshot.files??[]){
  const bytes=Buffer.from(snapshot.source_bytes?.[file.path]??'','base64');
  if(bytes.length!==file.bytes||sha256(bytes)!==file.sha256)errors.push(`source integrity ${file.path}`);
  if(R1_ANCHOR.files[file.path]!==file.sha256)errors.push('source differs from trusted R1 archive');
 }
 if(snapshot.run_id!==R1_ANCHOR.run_id||snapshot.github_run_id!==R1_ANCHOR.github_run_id||snapshot.files?.length!==Object.keys(R1_ANCHOR.files).length)errors.push('R1 archive identity');
 try{
  const decode=name=>Buffer.from(snapshot.source_bytes[name],'base64').toString('utf8');
  const jsonl=name=>decode(name).trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  if(JSON.stringify(snapshot.raw)!==JSON.stringify(JSON.parse(decode('raw-1.json'))))errors.push('speech differs from archived bytes');
  for(const [field,path] of [['steps','attempt-1.jsonl'],['focus','focus-1.jsonl'],['sends','sends-1.jsonl']])if(JSON.stringify(snapshot[field])!==JSON.stringify(jsonl(path)))errors.push('trace differs from archived bytes');
 }catch{errors.push('archive bytes missing or invalid');}
 if(!/^r1-[0-9TZ]+$/.test(snapshot.run_id??'')||!/^\d+$/.test(snapshot.github_run_id??''))errors.push('invalid R1 run identity');
 return {ok:errors.length===0,errors};
}
