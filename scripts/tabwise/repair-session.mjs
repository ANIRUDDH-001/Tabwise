import {isAbsolute} from 'node:path';
import {consumePatchedSource} from '../../src/repair/rerun.mjs';
import {applyTitleNonce,buildR2StepMap,planR2EvidenceCaps} from './r2-evidence.mjs';
// Data-only bridge into the authentic session. No provider injection or qualification override.
export function preparePatchedSession({spec,bundle,evidenceDir,timing,handleTimeoutMs,focusWaitMs}){
 const input=structuredClone({spec,bundle,evidenceDir,timing,handleTimeoutMs,focusWaitMs});
 const source=consumePatchedSource({...input.bundle,spec:input.spec,baseSource:input.bundle.application?.base_source});
 if(!isAbsolute(input.evidenceDir))throw Error('absolute repair evidence directory required');
 if(!input.timing||Object.keys(input.timing).sort().join(',')!=='ackMs,observationMs,pollMs,timeoutMs')throw Error('exact native timing policy required');
 for(const value of [input.handleTimeoutMs,input.focusWaitMs])if(!Number.isSafeInteger(value)||value<1||value>10000)throw Error('bounded native timeout required');
 const flow={'fernway-passenger':'passenger','fernway-seat':'seat','fernway-search':'search'}[input.spec.journey_id];if(!flow)throw Error('unsupported repaired fixture journey');
 const fixture=Buffer.from(source.files['index.html'],'utf8');
 // Validate native document constraints before acquiring any runtime resource.
 applyTitleNonce(fixture,'00000000');
 const task=input.spec.steps.map(s=>({step:`step-${s.step}`,press:s.key}));
 buildR2StepMap(task);
 const captureSpec={actions:task.length,...input.timing};planR2EvidenceCaps(captureSpec);
 return {fixture_id:input.spec.journey_id,fixture,approved:{query:`?flow=${flow}&variant=broken`,fixture_sha256:source.source_sha256,task},spec:captureSpec,evidenceDir:input.evidenceDir,handleTimeoutMs:input.handleTimeoutMs,focusWaitMs:input.focusWaitMs};
}

// The packet digest is part of the owner-approved native plan, hence of W5's signed binding.
export function validateRepairPacket({packet,head,env}){
 if(!packet||Object.keys(packet).sort().join(',')!=='attempt,bundle,owner_id,product_run_id,revision,schema,spec'||packet.schema!=='tabwise-r3-native-input/1')throw Error('repair authorization packet required');
 const p=structuredClone(packet),run=p.bundle?.run;
 if(p.revision!==head||p.attempt!==1||env.GITHUB_RUN_ATTEMPT!=='1'||p.product_run_id!==p.spec?.run_id||!run||run.id!==p.product_run_id||run.user_id!==p.owner_id||run.kind!=='verify'||!['dispatched','running','ingesting'].includes(run.status)||run.gh_head_sha!==head||String(run.gh_run_id)!==env.GITHUB_RUN_ID||JSON.stringify(run.spec)!==JSON.stringify(p.spec)||p.bundle.binding?.user_id!==p.owner_id)throw Error('repair owner/run/revision/attempt binding');
 consumePatchedSource({...p.bundle,spec:p.spec,baseSource:p.bundle.application?.base_source});
 return {spec:p.spec,bundle:p.bundle};
}
