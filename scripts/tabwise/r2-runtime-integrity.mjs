import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
export function runtimeIntegrity(root){
 try{
  const pins=JSON.parse(readFileSync(resolve(root,'scripts/tabwise/r2-runtime-pins.json'),'utf8'));
  if(pins.schema!=='tabwise-r2-runtime-pins/1'||Object.keys(pins.files).length!==10||!Object.hasOwn(pins.files,'src/r2/runtime-metadata.mjs'))throw Error('pin scope');
  for(const [file,hash] of Object.entries(pins.files)){
   if(!/^(src\/r2\/runtime-metadata\.mjs|scripts\/tabwise\/r2-[a-z-]+\.mjs|diagnostics\/owner-v2\/(resolver\.mjs|identity\.ps1)|diagnostics\/r2-native\/startup-(cleanup|diagnostics)\.mjs)$/.test(file))throw Error('pin path');
   if(createHash('sha256').update(readFileSync(resolve(root,file),'utf8').replaceAll('\r\n','\n')).digest('hex')!==hash)throw Error('runtime source changed: '+file);
  }
  return [];
 }catch(error){return ['R2 runtime integrity: '+error.message];}
}
