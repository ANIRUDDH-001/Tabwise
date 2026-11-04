import 'server-only';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {requireUser,serviceClient} from './supabase';
import {reviewedSourceRoot} from '../../../src/r2/node-review.mjs';
import {candidateRunStore,createCandidateRunHandler,candidateConfigurationFromEnv} from './candidate-run.mjs';
const rawRequire=createRequire(import.meta.url);
export function candidateConfiguration(){return candidateConfigurationFromEnv(process.env);}
export async function candidateRunRoute(request:Request,id=''){
 let db:ReturnType<typeof serviceClient>|undefined;const store=()=>candidateRunStore(db??=serviceClient());
 const handler=createCandidateRunHandler({authenticate:async()=>requireUser(),configuration:candidateConfiguration,
  store:{read:(...args:unknown[])=>store().read(...args),create:(...args:unknown[])=>store().create(...args),prepare:(...args:unknown[])=>store().prepare(...args)},
  context:async(c:{revision:string})=>{
   const root=reviewedSourceRoot();
   const policy=rawRequire(/* webpackIgnore: true */ resolve(root,'diagnostics/r2-candidate/policy.mjs'));
   return {prepareCandidateRequest:policy.prepareCandidateRequest,sourceRoot:root,revision:c.revision,sourceDigest:policy.sourceDigest(root),fixture:Buffer.from(readFileSync(resolve(root,policy.FIXTURE),'utf8').replaceAll('\r\n','\n'))};
  },
 });return handler(request,id);
}
