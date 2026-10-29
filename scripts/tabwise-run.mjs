// Deliberately review-blocked. No NVDA, OS input or browser imports occur before liveGate.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {verifyThenLoad} from './check-r1-baseline.mjs';
try{
 const {decodeSpec,liveGate}=await verifyThenLoad(undefined,async()=>{
  const {checkReviewApproval}=await import('./tabwise/review-approval.mjs');
  const status=JSON.parse(readFileSync(new URL('./tabwise/review-status.json',import.meta.url),'utf8'));
  const approval=checkReviewApproval(status);if(!approval.ok)throw Error(`BLOCK: ${approval.errors.join('; ')}`);
  const contracts=await import('../packages/contracts/index.mjs');
  const worker=await import('./tabwise/worker.mjs');
  return {decodeSpec:contracts.decodeSpec,liveGate:worker.liveGate};
 });
 decodeSpec({run_id:process.env.TABWISE_RUN_ID??'',spec_b64:process.env.TABWISE_SPEC_B64??'',spec_sha256:process.env.TABWISE_SPEC_SHA256??''});
 const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 liveGate(process.env,head);
}catch(error){console.error(`Tabwise worker refused: ${error.message}`);process.exitCode=2;}
