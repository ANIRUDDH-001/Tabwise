// Built-ins and built-in-only verifier first. No frozen module evaluates before integrity passes.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {checkFrozenIntegrity} from '../check-r1-baseline.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),runtimes=new WeakSet();
export const isQualificationRuntime=runtime=>runtimes.has(runtime);
export async function loadQualificationRuntime({root=ROOT,additionalIntegrity=()=>[]}={}){
 const initial=checkFrozenIntegrity(root);if(!initial.ok)throw Error(initial.errors.join('; '));
 const [{sendGate},tree,{foregroundProbe}]=await Promise.all([
  import(pathToFileURL(resolve(root,'src/speech/sendguard.mjs')).href),
  import(pathToFileURL(resolve(root,'src/speech/vendortree.mjs')).href),
  import(pathToFileURL(resolve(root,'src/speech/foreground.mjs')).href),
 ]);
 const vendor=resolve(root,'vendor/guidepup-0.36.4-r1'),require=createRequire(resolve(vendor,'package.json'));
 if(Object.keys(require.cache).some(file=>file.toLowerCase().startsWith((vendor+sep).toLowerCase())))throw Error('qualification frozen modules already loaded; one-shot process required');
 const upstream=tree.upstreamLoaded(require.cache,root),vendorErrors=tree.checkVendor({vendor,upstream:resolve(root,'node_modules/@guidepup/guidepup')});
 if(upstream.length||vendorErrors.length)throw Error('qualification vendor/upstream integrity refused');
 const guard=sendGate({checkMs:2000,settleMs:50}),r1Gate=require('./lib/windows/r1Gate.js');r1Gate.setGate(guard);
 const nvdaJs=require('./lib/windows/NVDA/NVDA.js'),nvda=new nvdaJs.NVDA();
 const mods={r1Gate,NVDAClient:require('./lib/windows/NVDA/NVDAClient.js').NVDAClient,runVbsScript:require('./lib/windows/runVbsScript.js'),sendKeys:require('./lib/windows/sendKeys.js'),teardown:require('./lib/teardown.js'),KeyCodes:require('./lib/windows/KeyCodes.js').KeyCodes,Modifiers:require('./lib/windows/Modifiers.js').Modifiers,Key:require('./lib/windows/Key.js').Key,keyCodeCommands:require('./lib/windows/NVDA/keyCodeCommands.js').keyCodeCommands};
 const start=require('./lib/windows/NVDA/start.js');
 const inspect=()=>{
  const errors=[...checkFrozenIntegrity(root).errors,...tree.vendorIntegrity({mods,nvda:nvdaJs,gate:guard,getGate:r1Gate.getGate,cache:require.cache,root,vendor})];
  if(require.cache[resolve(vendor,'lib/windows/NVDA/NVDA.js')]?.exports!==nvdaJs||Object.getPrototypeOf(nvda)!==nvdaJs.NVDA.prototype)errors.push('NVDA instance/cache identity');
  if(require.cache[resolve(vendor,'lib/windows/NVDA/NVDAClient.js')]?.exports?.NVDAClient!==mods.NVDAClient||r1Gate.getGate()!==guard)errors.push('observer class/registered guard identity');
  const extra=additionalIntegrity();if(!Array.isArray(extra))errors.push('missing reviewed content integrity');else errors.push(...extra);
  return errors;
 };
 guard.setIntegrity(inspect);
 const manifest=JSON.parse(readFileSync(resolve(vendor,'manifest.json'),'utf8'));
 const runtime=Object.freeze({guard,getGate:r1Gate.getGate,nvda,NVDAClient:mods.NVDAClient,relayOwnerPid:start.relayOwnerPid,versions:Object.freeze({node:process.versions.node,guidepup:'0.36.4 (frozen vendored)',expected_nvda_asset:manifest.screenReaders.find(reader=>reader.id==='nvda').assets[0].version}),cfg:Object.freeze(JSON.parse(readFileSync(resolve(root,'fixtures/r1/steps.json'),'utf8'))),createForeground:()=>foregroundProbe({timeoutMs:2000}),assertAuthentic:()=>{const errors=inspect();if(errors.length)throw Error(errors.join('; '));}});
 runtime.assertAuthentic();runtimes.add(runtime);return runtime;
}
