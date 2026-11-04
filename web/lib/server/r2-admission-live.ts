import 'server-only';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createAdmissionHandler} from './r2-admission.mjs';
import {githubExecutionKeys} from './r2-caller.mjs';
import {serviceClient} from './supabase';
import {validateAdmissionPolicy} from '../../../scripts/tabwise/r2-admission-transport.mjs';
import {reviewedR2Module,reviewedSourceRoot} from '../../../src/r2/node-review.mjs';
export const admissionPOST=createAdmissionHandler({
 configuration:()=>{
  const root=reviewedSourceRoot();
  const policyDirectory=resolve(root,'scripts/tabwise');
  const policy=JSON.parse(readFileSync(resolve(policyDirectory,'r2-admission-server-policy.json'),'utf8'));
  if(policy.schema!=='tabwise-r2-admission-server/1'||policy.enabled!==true||Object.keys(policy).sort().join(',')!=='actor_id,enabled,owner_id,repository_id,schema,subject')throw Error('disabled');
  const {readR2Status,r2Digest,R2_FILES}=reviewedR2Module('r2-policy.mjs');
  const {qualificationDigest}=reviewedR2Module('qualification-policy.mjs');
  const transport=validateAdmissionPolicy(JSON.parse(readFileSync(resolve(policyDirectory,'r2-admission-policy.json'),'utf8')));
  return {policy,audience:transport.authority_origin+'/api/r2/admission',authorization_id:transport.authorization_id,expires_at:transport.expires_at,receipt_public_key:transport.receipt_public_key,
   deployment_sha:process.env.VERCEL_GIT_COMMIT_SHA,reviewed_files:R2_FILES,reviewed_sha256:r2Digest(root),qualification_sha256:qualificationDigest(root),status:readR2Status(root)};
 },
 keys:githubExecutionKeys,
 client:serviceClient,
 signingKey:()=>{const key=process.env.TABWISE_R2_RECEIPT_PRIVATE_KEY;if(!key)throw Error('receipt key unavailable');return key;}
});
