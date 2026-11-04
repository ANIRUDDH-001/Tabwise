import {test} from 'node:test';import assert from 'node:assert/strict';
import * as evidence from '../lib/server/candidate-evidence.mjs';
const row={user_id:'owner',product_run_id:'product',state:'RUN_BOUND',github_run_id:'123',request:{repository:'ANIRUDDH-001/Tabwise',workflow:'.github/workflows/tabwise-r2-native-diagnostic.yml',ref:'refs/heads/feat/tabwise-r2-r7-product-completion',revision:'a'.repeat(40),actor:'ANIRUDDH-001'}};
const remote={id:123,status:'completed',conclusion:'success',event:'workflow_dispatch',head_branch:'feat/tabwise-r2-r7-product-completion',head_sha:'a'.repeat(40),path:row.request.workflow,run_attempt:2,actor:{login:'ANIRUDDH-001'},triggering_actor:{login:'ANIRUDDH-001'},repository:{full_name:'ANIRUDDH-001/Tabwise'}};
const jobs=['candidate-native','candidate-verify'].map(name=>({name,status:'completed',conclusion:'success',run_attempt:2}));
const artifacts=['candidate-native-123-2','candidate-readback-123-2'].map((name,n)=>({id:n+1,name,expired:false,size_in_bytes:100,digest:'sha256:'+'b'.repeat(64),workflow_run:{id:123,head_sha:remote.head_sha,head_branch:remote.head_branch}}));
test('candidate ingestion requires authenticated actual workflow and separate verifier jobs',()=>{
 assert.equal(typeof evidence.selectCandidateArtifacts,'function');
 assert.deepEqual(evidence.selectCandidateArtifacts({userId:'owner',row,remote,jobs,artifacts}),{native:artifacts[0],readback:artifacts[1]});
 for(const mutate of [a=>a.userId='foreign',a=>a.row.state='PREPARED',a=>a.remote.run_attempt=1,a=>a.remote.head_sha='f'.repeat(40),a=>a.remote.path='.github/workflows/tabwise-r2.yml',a=>a.remote.triggering_actor.login='foreign',a=>a.jobs[1].conclusion='failure',a=>a.artifacts[0].expired=true,a=>a.artifacts[0].workflow_run.id=124,a=>a.artifacts.push(a.artifacts[0])]){
  const a=structuredClone({userId:'owner',row,remote,jobs,artifacts});mutate(a);assert.throws(()=>evidence.selectCandidateArtifacts(a));
 }
});
test('a candidate archive or readback flag alone cannot enter product storage',async()=>{
 assert.equal(typeof evidence.prepareCandidateEvidence,'function');
 await assert.rejects(()=>evidence.prepareCandidateEvidence({userId:'owner',row,remote,jobs,artifacts,nativeArchive:Buffer.from('{}'),readbackArchive:Buffer.from('{}')}));
});
