import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {loadRepairInput} from './repair-input.mjs';
import {consumePatchedSource} from '../../src/repair/rerun.mjs';
// Invoke only after liveGate. Staged bundles are untrusted; all identities and bytes recompute.
export async function stagePatchedWorkerSource({spec,bundlePath,env,fetchImpl}){
 let bundle;
 if(bundlePath){const bytes=await readFile(bundlePath);if(bytes.length>2200000)throw Error('repair input byte cap');bundle=JSON.parse(bytes.toString('utf8'));}
 else bundle=await loadRepairInput({spec,env,fetchImpl});
 const source=consumePatchedSource({...bundle,spec,baseSource:bundle.application?.base_source});
 const root=await mkdtemp(join(tmpdir(),'tabwise-repair-'));
 await writeFile(join(root,'index.html'),source.files['index.html'],{flag:'wx'});
 return {...source,root};
}
