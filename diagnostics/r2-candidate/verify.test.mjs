import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as verifier from './verify.mjs';
test('candidate verifier refuses absent source rather than accepting a report flag',async()=>{
 assert.equal(typeof verifier.verifyCandidate,'function');
 const dir=mkdtempSync(join(tmpdir(),'candidate-empty-'));
 try{await assert.rejects(()=>verifier.verifyCandidate(dir));}finally{rmSync(dir,{recursive:true});}
});
test('native success must recompute every custody and lifecycle condition',()=>{
 assert.equal(typeof verifier.nativeComplete,'function');
 const s={completed:true,runtime_checks:{brand:true,post_session_authentic:true},nvda:'stopped',cleanup_errors:[],reasons:[],unexpected_loopback_requests:0,lifecycle:{clean:true}};
 const r={preflight:{quiescent:true},child:{exit_code:0,outcome:'accepted'},custody:{confirmed:true,quiescent:true,root:{exact:true},sample_failures:0,errors:[]},post:{quiescent:true,helper_processes:[]},errors:[]};
 assert.equal(verifier.nativeComplete(s,r),true);
 for(const mutate of [r=>r.child.outcome='timeout',r=>r.custody.confirmed=false,r=>r.custody.sample_failures=1,r=>r.post.helper_processes=[{}],r=>r.errors=['failure'],r=>r.preflight.quiescent=false]){
  const bad=structuredClone(r);mutate(bad);assert.equal(verifier.nativeComplete(s,bad),false);
 }
 assert.equal(verifier.nativeComplete({...s,nvda:'running'},r),false);
 assert.equal(verifier.nativeComplete({...s,runtime_checks:{}},r),false);
 assert.equal(verifier.nativeComplete({...s,unexpected_loopback_requests:1},r),false);
 assert.equal(verifier.nativeComplete({...s,lifecycle:{clean:false}},r),false);
});
