// Builds web/data/r1-pass.json from a locally extracted, owner-provided R1 PASS artifact (T-P0-10 Step 2a).
// Usage: node web/scripts/build-r1-pass.mjs <artifact.zip> <extracted r1-20261028T153344Z dir>
// Only whitelisted public fields are copied. Process ids, nonces, window titles, runner image data,
// lock/dependency maps, per-step timestamps and the raw focus/send streams are never emitted.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {sha256} from '../../packages/contracts/index.mjs';
import {R1_PASS_ANCHOR,validatePassSnapshot} from '../lib/r1-pass.mjs';
const [zip,dir]=process.argv.slice(2);
if(!zip||!dir)throw Error('usage: build-r1-pass.mjs <artifact.zip> <run dir>');
if(sha256(readFileSync(zip))!==R1_PASS_ANCHOR.archive_sha256)throw Error('artifact ZIP digest differs from the recorded anchor');
const read=name=>readFileSync(join(dir,name));
for(const [name,hash] of Object.entries(R1_PASS_ANCHOR.files))if(sha256(read(name))!==hash)throw Error(`anchored file differs: ${name}`);
const summary=JSON.parse(read('summary.json'));
const jsonl=name=>read(name).toString('utf8').trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
const g=summary.send_guard;
const body={
 format:'tabwise-r1-pass-public/1',
 run_id:summary.run_id,result:summary.result,status:summary.status,
 github_run_id:summary.runner.github_run_id,github_url:`https://github.com/ANIRUDDH-001/Tabwise/actions/runs/${summary.runner.github_run_id}`,
 artifact_name:R1_PASS_ANCHOR.artifact_name,artifact_id:R1_PASS_ANCHOR.artifact_id,archive_sha256:R1_PASS_ANCHOR.archive_sha256,
 source_commit:summary.checkout.head,started:summary.started,finished:summary.finished,
 profile:'D-53/A15',fixture:'R1 sign-up fixture (synthetic)',
 settings:summary.attempts[0].settings,
 send_guard:{sends:g.sends,misdelivered:g.misdelivered,refused:g.refused,unsettled:g.unsettled,acks:{confirmed:g.acks.confirmed,unconfirmable:g.acks.unconfirmable,missing:g.acks.missing}},
 attempts:summary.attempts.map(a=>({attempt:a.attempt,status:a.status,fresh:a.fresh,complete:a.complete,steps_recorded:a.steps_recorded,
  steps:jsonl(a.files.records).map(s=>({step:s.step,keys:s.keys,phrases:s.phrases,timed_out:s.timed_out,error:s.error}))})),
 model_provenance:{status:'not_run',model:null,cost:null},
 source_hashes:R1_PASS_ANCHOR.files,
 limitations:[
  'R1 sign-up fixture (synthetic); not Fernway.',
  'Measured under the non-default D-53/A15 profile (browse mode off on page load); not default NVDA browse-mode coverage.',
  `Only ${g.acks.confirmed} of ${g.sends} key sends had a confirmed page acknowledgement; ${g.acks.unconfirmable} could not be confirmed and ${g.acks.missing} were missing.`,
  'No R2 causal diagnosis, Spark output, accessibility finding or patch verification is asserted.',
  'Structural and provenance review of the downloaded artifact; NVDA was not re-executed for this display.',
 ],
};
const snapshot={...body,snapshot_sha256:sha256(JSON.stringify(body))};
const result=validatePassSnapshot(snapshot);if(!result.ok)throw Error(result.errors.join('; '));
writeFileSync(new URL('../data/r1-pass.json',import.meta.url),JSON.stringify(snapshot,null,1)+'\n');
console.log('wrote web/data/r1-pass.json',snapshot.snapshot_sha256);
