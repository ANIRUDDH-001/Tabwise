import 'server-only';
import {readFileSync} from 'node:fs';import {resolve} from 'node:path';
import {requireUser,serviceClient} from './supabase';
import {createNativeRequestHandler,nativeRequestStore} from './native-request.mjs';
import {reviewedSourceRoot,reviewedR2Module} from '../../../src/r2/node-review.mjs';
export async function nativeRequestRoute(request:Request,id:string){
 let db:ReturnType<typeof serviceClient>|undefined;
 const client=()=>db??=serviceClient();
 const handler=createNativeRequestHandler({
  authenticate:async()=>requireUser(),
  ownedRun:async(user:string,runId:string)=>{const {data,error}=await client().from('runs').select('*').eq('id',runId).eq('user_id',user).maybeSingle();if(error)throw Error('owned run unavailable');return data;},
  context:async(_user:string,run:{spec:{journey_id:string,app_hash:string,steps:{step:number,key:string}[]}})=>{
   const root=reviewedSourceRoot(),revision=process.env.VERCEL_GIT_COMMIT_SHA??process.env.TABWISE_NATIVE_CANDIDATE_REVISION,actor=process.env.GH_PAT_OWNER;
   if(!revision||!actor)throw Error('native request configuration pending');
   const flows:Record<string,string>={'fernway-seat':'seat','fernway-passenger':'passenger','fernway-search':'search'},flow=flows[run.spec.journey_id];if(!flow)throw Error('supported journey required');
   const fixture=Buffer.from(readFileSync(resolve(root,'fixtures/fernway/index.html'),'utf8').replaceAll('\r\n','\n'));
   const {r2Digest}=reviewedR2Module('r2-policy.mjs'),{qualificationDigest}=reviewedR2Module('qualification-policy.mjs');
   const plan={schema:'tabwise-r2-plan/1',split:'development',spec:{ackMs:1000,observationMs:1500,pollMs:25,timeoutMs:8000},handleTimeoutMs:27000,focusWaitMs:1000,pages:[{id:'product',fixture:'fernway/index.html',fixture_sha256:run.spec.app_hash,query:`?flow=${flow}&variant=broken`,task:run.spec.steps.map(s=>({step:`step-${s.step}`,press:s.key}))}]};
   return {specBytes:Buffer.from(JSON.stringify(run.spec)),planBytes:Buffer.from(JSON.stringify(plan)+'\n'),fixture,pageId:'product',planPath:'fixtures/r2/plans/product-candidate.json',revision,actor,r2SourceSha256:r2Digest(root),qualificationSha256:qualificationDigest(root)};
  },
  store:{read:(user:string,runId:string)=>nativeRequestStore(client()).read(user,runId),prepare:(user:string,p:unknown,c:unknown)=>nativeRequestStore(client()).prepare(user,p,c)},
 });
 return handler(request,id);
}
