import {readArtifactZip} from './artifact-zip.mjs';
import {verifyArtifactIdentity} from './core.mjs';
import {verifyManifest,validateContract} from '../../../packages/contracts/index.mjs';

// Failure diagnostics are retained separately. This path never yields scoreable evidence.
export async function ingestDiagnosticArchive({archive,remoteRun,expected,workerReview,store,record}){
 const files=readArtifactZip(archive),manifestBytes=files['manifest.json'];
 if(!manifestBytes||manifestBytes.length>65536)throw Error('bounded diagnostic manifest missing');
 const manifest=JSON.parse(manifestBytes.toString('utf8'));delete files['manifest.json'];
 const errors=[...verifyArtifactIdentity(remoteRun,manifest,expected).errors,...verifyManifest(manifest,files).errors];
 if(workerReview!=='PASS')errors.push('worker review pending');
 let evidence;
 try{const entry=manifest.files.find(file=>file.kind==='evidence');evidence=JSON.parse(files[entry.path].toString('utf8'));errors.push(...validateContract('evidence-bundle',evidence).errors);}catch{errors.push('invalid diagnostic evidence');}
 if(evidence?.run_id!==expected.run_id||evidence?.provenance!=='observed-nvda')errors.push('diagnostic evidence identity/provenance');
 if(errors.length)throw Error(`diagnostic artifact refused: ${errors.join('; ')}`);
 const prefix=`${expected.run_id}/diagnostics/${remoteRun.run_attempt}`;
 await store(`${prefix}/manifest.json`,manifestBytes,'manifest');
 for(const file of manifest.files)await store(`${prefix}/${file.path}`,files[file.path],file.kind);
 await record({...manifest,files:manifest.files.map(file=>({...file,path:`diagnostics/${remoteRun.run_attempt}/${file.path}`}))});
 return {complete:false,diagnostic_only:true,classification:'INCONCLUSIVE'};
}
