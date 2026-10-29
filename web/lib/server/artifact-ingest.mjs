import {readArtifactZip} from './artifact-zip.mjs';
import {prepareIngest} from './jobs.mjs';
export async function ingestArchive({archive,remoteRun,expected,workerReview,store,record}){
 const files=readArtifactZip(archive),manifestBytes=files['manifest.json'];
 if(!manifestBytes||manifestBytes.length>65536)throw Error('bounded manifest missing');
 const manifest=JSON.parse(manifestBytes.toString('utf8'));delete files['manifest.json'];
 const checked=prepareIngest({run:remoteRun,manifest,files,expected,workerReview});
 if(!checked.ok)throw Error(`artifact refused: ${checked.errors.join('; ')}`);
 await store(`${expected.run_id}/manifest.json`,manifestBytes,'manifest');
 for(const file of manifest.files)await store(`${expected.run_id}/${file.path}`,files[file.path],file.kind);
 await record(manifest);return {complete:true,manifest,evidence:checked.evidence};
}
