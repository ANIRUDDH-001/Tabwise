import {readArtifactZip} from './artifact-zip.mjs';
import {prepareIngest} from './jobs.mjs';
import {storeArtifactSet} from './artifact-store.mjs';
export async function ingestArchive({archive,remoteRun,expected,workerReview,store,record,cleanup,recordCleanup}){
 const files=readArtifactZip(archive),manifestBytes=files['manifest.json'];
 if(!manifestBytes||manifestBytes.length>65536)throw Error('bounded manifest missing');
 const manifest=JSON.parse(manifestBytes.toString('utf8'));delete files['manifest.json'];
 const checked=prepareIngest({run:remoteRun,manifest,files,expected,workerReview});
 if(!checked.ok)throw Error(`artifact refused: ${checked.errors.join('; ')}`);
 await storeArtifactSet({prefix:expected.run_id,manifestBytes,manifest,files,store,record:()=>record(manifest),cleanup,recordCleanup});
 return {complete:true,manifest,evidence:checked.evidence};
}
