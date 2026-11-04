// Observational data only. No execution, signing or qualification authority.
import {sha256} from '../../packages/contracts/index.mjs';
import {stable,exact} from '../../packages/contracts/r2-product.mjs';
const VERSION_SOURCE='Windows owned-process MainModule.FileVersionInfo.ProductVersion';
const A15={'keyboard.speakTypedCharacters':1,'keyboard.speakTypedWords':0,'virtualBuffers.enableOnPageLoad':false};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const identity=v=>v&&Number.isSafeInteger(v.pid)&&v.pid>0&&v.pid<=2147483647&&typeof v.created==='string'&&/^[1-9][0-9]{10,19}$/.test(v.created)&&hash(v.path_sha256);
export function validateRuntimeMetadata(value){
 exact(value,['schema','profile','nvda_version','version_source','executable_sha256','process_identity','settings_sha256']);
 exact(value.process_identity,['pid','created','path_sha256']);
 if(value.schema!=='tabwise-native-runtime/2'||value.profile!=='A15'||value.version_source!==VERSION_SOURCE||
  typeof value.nvda_version!=='string'||!/^\d{1,4}(?:\.\d{1,5}){1,3}$/.test(value.nvda_version)||
  !hash(value.executable_sha256)||value.settings_sha256!==sha256(stable(A15))||!identity(value.process_identity))throw Error('observed runtime metadata invalid');
 return structuredClone(value);
}
export function buildRuntimeMetadata({snapshot,expectedIdentity,settings,readback}){
 if(!identity(snapshot)||!identity(expectedIdentity)||['pid','created','path_sha256'].some(k=>snapshot[k]!==expectedIdentity[k]))throw Error('runtime process identity changed');
 const flattened=Object.fromEntries(Object.entries(settings??{}).flatMap(([section,values])=>Object.entries(values).map(([k,v])=>[section+'.'+k,v])));
 if(stable(flattened)!==stable(A15)||stable(readback)!==stable(A15))throw Error('runtime A15 settings readback mismatch');
 return validateRuntimeMetadata({schema:'tabwise-native-runtime/2',profile:'A15',nvda_version:snapshot.product_version,
  version_source:VERSION_SOURCE,executable_sha256:snapshot.executable_sha256,
  process_identity:Object.fromEntries(['pid','created','path_sha256'].map(k=>[k,snapshot[k]])),settings_sha256:sha256(stable(readback))});
}
