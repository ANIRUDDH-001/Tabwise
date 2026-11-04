// Private CJS graph: evaluate byte-identical frozen modules, substituting only reviewed lifecycle exports.
// compileFunction is a module wrapper, not a security sandbox. Source integrity is the trust boundary.
import {compileFunction} from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,dirname,sep} from 'node:path';
import {createLifecycle} from './r2-nvda-lifecycle.mjs';
export function loadR2Vendor({root,gate,lifecycleFactory=createLifecycle,modules={}}){
 const vendor=resolve(root,'vendor/guidepup-0.36.4-r1'),native=createRequire(resolve(vendor,'package.json')),cache=Object.create(null);
 const startPath=resolve(vendor,'lib/windows/NVDA/start.js'),quitPath=resolve(vendor,'lib/windows/NVDA/quit.js');let lifecycle;
 function load(file){
  if(cache[file])return cache[file].exports;
  const relative=file.slice(vendor.length+1).replaceAll('\\','/');if(Object.hasOwn(modules,relative)){cache[file]={exports:modules[relative]};return modules[relative];}
  if(file===startPath)throw Error('R2 refuses frozen startup module');
  const module={exports:{}};cache[file]=module;
  const require=id=>{const target=createRequire(file).resolve(id);return target.startsWith(vendor+sep)?load(target):native(target);};
  if(file.endsWith('.json'))module.exports=JSON.parse(readFileSync(file,'utf8'));
  else compileFunction(readFileSync(file,'utf8'),['exports','require','module','__filename','__dirname'],{filename:file})(module.exports,require,module,file,dirname(file));
  return module.exports;
 }
 const get=rel=>load(native.resolve('./'+rel));
 const r1Gate=get('lib/windows/r1Gate.js');r1Gate.setGate(gate);
 const config=get('lib/windows/NVDA/config');
 lifecycle=lifecycleFactory({gate,executable:get('lib/windows/NVDA/getNVDAInstallationPath.js').getNVDAInstallationPath,configPath:config.resolveSessionUserConfigPath,running:get('lib/windows/NVDA/isRunning.js').isRunning});
 const start=Object.freeze({start:lifecycle.start,relayOwnerPid:lifecycle.relayOwnerPid});
 const quit=Object.freeze({quit:lifecycle.quit});
 cache[startPath]={exports:start};cache[quitPath]={exports:quit};
 const nvdaJs=get('lib/windows/NVDA/NVDA.js'),nvda=new nvdaJs.NVDA();
 const mods={r1Gate,NVDAClient:get('lib/windows/NVDA/NVDAClient.js').NVDAClient,runVbsScript:get('lib/windows/runVbsScript.js'),sendKeys:get('lib/windows/sendKeys.js'),teardown:get('lib/teardown.js'),KeyCodes:get('lib/windows/KeyCodes.js').KeyCodes,Modifiers:get('lib/windows/Modifiers.js').Modifiers,Key:get('lib/windows/Key.js').Key,keyCodeCommands:get('lib/windows/NVDA/keyCodeCommands.js').keyCodeCommands};
 return Object.freeze({nvdaJs,nvda,mods,cache,start,quit,vendor,lifecycle,installationAvailable:()=>!!get('lib/windows/NVDA/getNVDAInstallationPath.js').getNVDAInstallationPath()});
}
