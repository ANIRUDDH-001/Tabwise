// Built-ins and built-in-only verifier first. No frozen module evaluates before integrity passes.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runtimeIntegrity} from './r2-runtime-integrity.mjs';
import {checkFrozenIntegrity} from '../check-r1-baseline.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),runtimes=new WeakSet();let claimed=false;
export const isR2Runtime=runtime=>runtimes.has(runtime);
export async function loadR2Runtime({root=ROOT,additionalIntegrity=()=>[]}={}){
 if(claimed)throw Error('R2 runtime already claimed; one-shot process required');claimed=true;
 const initial=checkFrozenIntegrity(root);initial.errors.push(...runtimeIntegrity(root));initial.ok=initial.errors.length===0;if(!initial.ok)throw Error(initial.errors.join('; '));
 const [{sendGate},tree,{foregroundProbe}]=await Promise.all([
  import(pathToFileURL(resolve(root,'src/speech/sendguard.mjs')).href),
  import(pathToFileURL(resolve(root,'src/speech/vendortree.mjs')).href),
  import(pathToFileURL(resolve(root,'src/speech/foreground.mjs')).href),
 ]);
 const vendor=resolve(root,'vendor/guidepup-0.36.4-r1'),require=createRequire(resolve(vendor,'package.json'));
 if(Object.keys(require.cache).some(file=>file.toLowerCase().startsWith((vendor+sep).toLowerCase())))throw Error('qualification frozen modules already loaded; one-shot process required');
 const upstream=tree.upstreamLoaded(require.cache,root),vendorErrors=tree.checkVendor({vendor,upstream:resolve(root,'node_modules/@guidepup/guidepup')});
 if(upstream.length||vendorErrors.length)throw Error('qualification vendor/upstream integrity refused');
 const guard=sendGate({checkMs:2000,settleMs:50});
 const {loadR2Vendor}=await import('./r2-vendor-loader.mjs');
 const graph=loadR2Vendor({root,gate:guard});
 const {mods,nvdaJs,nvda,start}=graph,r1Gate=mods.r1Gate;
 const inspect=()=>{
  const errors=[...runtimeIntegrity(root),...tree.vendorIntegrity({mods,nvda:nvdaJs,gate:guard,getGate:r1Gate.getGate,cache:graph.cache,root,vendor})];
  if(graph.cache[resolve(vendor,'lib/windows/NVDA/NVDA.js')]?.exports!==nvdaJs||Object.getPrototypeOf(nvda)!==nvdaJs.NVDA.prototype)errors.push('NVDA instance/cache identity');
  if(graph.cache[resolve(vendor,'lib/windows/NVDA/NVDAClient.js')]?.exports?.NVDAClient!==mods.NVDAClient||r1Gate.getGate()!==guard)errors.push('observer class/registered guard identity');
  if(graph.cache[resolve(vendor,'lib/windows/NVDA/start.js')]?.exports!==start||graph.cache[resolve(vendor,'lib/windows/NVDA/quit.js')]?.exports!==graph.quit)errors.push('R2 lifecycle identity changed');
  if(tree.upstreamLoaded(require.cache,root).length)errors.push('upstream Guidepup loaded outside R2 graph');
  const extra=additionalIntegrity();if(!Array.isArray(extra))errors.push('missing reviewed content integrity');else errors.push(...extra);
  return errors;
 };
 guard.setIntegrity(inspect);
 const manifest=JSON.parse(readFileSync(resolve(vendor,'manifest.json'),'utf8'));
 const runtime=Object.freeze({guard,getGate:r1Gate.getGate,nvda,NVDAClient:mods.NVDAClient,relayOwnerPid:start.relayOwnerPid,observedProcess:graph.lifecycle.observedProcess,versions:Object.freeze({node:process.versions.node,guidepup:'0.36.4 (R2 pinned lifecycle, frozen guarded dependencies)',expected_nvda_asset:manifest.screenReaders.find(reader=>reader.id==='nvda').assets[0].version}),cfg:Object.freeze(JSON.parse(readFileSync(resolve(root,'fixtures/r1/steps.json'),'utf8'))),createForeground:()=>foregroundProbe({timeoutMs:2000}),assertAuthentic:()=>{const errors=inspect();if(errors.length)throw Error(errors.join('; '));}});
 runtime.assertAuthentic();runtimes.add(runtime);return runtime;
}
