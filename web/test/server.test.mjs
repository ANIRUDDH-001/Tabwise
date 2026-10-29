import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertProject,assertSameOrigin,authorizeRun,verifyWorkerIdentity,createHostedBroker} from '../lib/server/core.mjs';
test('server configuration refuses every other Supabase project',()=>{
 assert.equal(assertProject('https://ueobjrtvsgvkigmjxkks.supabase.co'),'https://ueobjrtvsgvkigmjxkks.supabase.co');
 for(const url of ['https://other.supabase.co','https://ueobjrtvsgvkigmjxkks.supabase.co.evil.org','http://ueobjrtvsgvkigmjxkks.supabase.co','https://user@ueobjrtvsgvkigmjxkks.supabase.co'])assert.throws(()=>assertProject(url));
});
test('write routes reject cross-origin requests and enforce run ownership',()=>{
 assert.doesNotThrow(()=>assertSameOrigin(new Request('https://tabwise.test/api/runs',{headers:{origin:'https://tabwise.test'}})));
 assert.throws(()=>assertSameOrigin(new Request('https://tabwise.test/api/runs',{headers:{origin:'https://evil.test'}})));
 assert.throws(()=>authorizeRun({id:'a'},{user_id:'b'}));
 assert.doesNotThrow(()=>authorizeRun({id:'a'},{user_id:'a'}));
});
test('worker identity pins workflow, event, branch, actor, SHA, run title and spec',()=>{
 const expected={sha:'a'.repeat(40),actor:'owner',run_id:'run-1',spec_sha256:'b'.repeat(64)};
 const run={path:'.github/workflows/tabwise-run.yml',event:'workflow_dispatch',head_branch:'main',head_sha:expected.sha,actor:{login:'owner'},display_title:'tabwise run-1'};
 const manifest={spec_sha256:expected.spec_sha256,run_id:'run-1',runner:{head_sha:expected.sha,actor:'owner',github_run_id:'1'}};
 assert.equal(verifyWorkerIdentity({...run,id:1},manifest,expected).ok,true);
 for(const key of ['path','event','head_branch','head_sha','display_title'])assert.equal(verifyWorkerIdentity({...run,id:1,[key]:'wrong'},manifest,expected).ok,false,key);
 assert.equal(verifyWorkerIdentity({...run,id:1},manifest,{...expected,actor:'other'}).ok,false);
});
test('hosted broker uses atomic RPC, rejects oversize before RPC, retains missing usage',async()=>{
 const calls=[];const rpc=async(name,args)=>{calls.push({name,args});return {data:name==='reserve_hosted'?{id:'reservation',reserved_nano:5500000}:{settled_nano:0},error:null};};
 const broker=createHostedBroker(rpc);
 await assert.rejects(()=>broker.reserve({model:'muse-spark-1.3',inputTokens:1_000_000,maxOutputTokens:0}),/per-call/);
 assert.equal(calls.length,0);
 const r=await broker.reserve({model:'muse-spark-1.3',inputTokens:1000,maxOutputTokens:1000});
 assert.equal(r.id,'reservation');
 await assert.rejects(()=>broker.settle(r.id,{}),/usage/);
 assert.equal(calls.filter(c=>c.name==='settle_hosted').length,0);
});
