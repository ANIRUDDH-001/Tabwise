import test from 'node:test';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {packet,authorize,REF,WORKFLOW} from './policy.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),revision='a'.repeat(40),run='123';
test('fresh V2 exact authorization and every identity negative',()=>{
 const p=packet({root,revision,run}),env={GITHUB_REPOSITORY:p.repository,GITHUB_ACTOR:p.actor,GITHUB_TRIGGERING_ACTOR:p.actor,GITHUB_REF:REF,GITHUB_WORKFLOW_REF:p.repository+'/'+WORKFLOW+'@'+REF,GITHUB_SHA:revision,GITHUB_WORKFLOW_SHA:revision,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ID:run,GITHUB_RUN_ATTEMPT:'2',GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows'};
 const base={root,revision,env,approval:JSON.stringify(p),clean:true,platform:'win32'};
 assert.deepEqual(authorize(base),[]);
 for(const key of Object.keys(env))assert.ok(authorize({...base,env:{...env,[key]:'wrong'}}).length,key);
 for(const key of Object.keys(p))assert.ok(authorize({...base,approval:JSON.stringify({...p,[key]:null})}).length,key);
 for(const change of [{clean:false},{platform:'linux'},{execArgv:['--import','evil']},{approval:'{}'},{env:{...env,NODE_OPTIONS:'evil'}},{env:{...env,GITHUB_RUN_ID:'41767459754'}}])assert.ok(authorize({...base,...change}).length);
});
test('old consumed authorization and attempts 1/3 are refused',()=>{for(const attempt of ['1','3'])assert.ok(authorize({root,revision,env:{GITHUB_RUN_ID:run,GITHUB_RUN_ATTEMPT:attempt},approval:'{"schema":"tabwise-boundary-approval/1"}',clean:true,platform:'win32'}).length);});
