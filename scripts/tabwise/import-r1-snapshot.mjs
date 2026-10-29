import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {sha256} from '../../packages/contracts/index.mjs';
import {R1_ANCHOR} from '../../web/lib/snapshot.mjs';

// Only public R1 material; explicit source argument, no automatic discovery of private evidence.
export function importR1(source) {
  const names=['summary.json','attempt-1.jsonl','raw-1.json','focus-1.jsonl','sends-1.jsonl'];
  const bytes=Object.fromEntries(names.map(n=>[n,readFileSync(join(source,n))]));
  if(names.some(n=>sha256(bytes[n])!==R1_ANCHOR.files[n]))throw Error('Source does not match the trusted public R1 archive');
  const summary=JSON.parse(bytes['summary.json']);
  if(summary.runner?.workflow_ref!=='ANIRUDDH-001/Tabwise/.github/workflows/r1.yml@refs/heads/main')throw Error('R1 provenance required');
  const jsonl=n=>bytes[n].toString('utf8').trim().split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s));
  const body = {
    format:'tabwise-r1-diagnostic-snapshot/1',source_kind:'public-r1',run_id:summary.run_id,
    github_run_id:summary.runner.github_run_id,github_url:`https://github.com/ANIRUDDH-001/Tabwise/actions/runs/${summary.runner.github_run_id}`,
    result:summary.result??'FAIL',profile:'pre-A15',started:summary.started,finished:summary.finished,
    model_provenance:{status:'not_run',model:null,cost:null},
    limitations:['R1 sign-up fixture; not Fernway.','Historical failed run before the A15 configuration.','Partial capture; not a silence finding or a repair verification.','No model inference or patch exists for this run.','No screenshot or app-event lane was collected in R1.'],
    evidence_class:'OBSERVED',independence:'L4',
    files:names.map(path=>({path,sha256:sha256(bytes[path]),bytes:bytes[path].length})),
    raw:JSON.parse(bytes['raw-1.json']),steps:jsonl('attempt-1.jsonl'),focus:jsonl('focus-1.jsonl'),sends:jsonl('sends-1.jsonl'),
    reason:summary.send_guard?.reason??'Incomplete historical capture',
    source_bytes:Object.fromEntries(names.map(n=>[n,bytes[n].toString('base64')])),
  };
  return {...body,snapshot_sha256:sha256(JSON.stringify(body))};
}
if(process.argv[2]) {
  const snapshot=importR1(resolve(process.argv[2]));
  const dir=new URL('../../web/data/',import.meta.url);mkdirSync(dir,{recursive:true});
  writeFileSync(new URL('r1.json',dir),JSON.stringify(snapshot,null,2)+'\n');
  console.log(JSON.stringify({run_id:snapshot.run_id,files:snapshot.files.length,source_kind:snapshot.source_kind}));
}
