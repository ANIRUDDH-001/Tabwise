import {test} from 'node:test';import assert from 'node:assert/strict';
import * as candidate from '../lib/server/candidate-run.mjs';
test('live merge commit cannot silently replace the separately pinned execution source',()=>{
 const env={TABWISE_CANDIDATE_ENABLED:'true',TABWISE_CANDIDATE_USER_ID:'owner',TABWISE_CANDIDATE_REF:'refs/heads/feat/tabwise-r2-r7-product-completion',TABWISE_CANDIDATE_REVISION:'a'.repeat(40),VERCEL_GIT_COMMIT_SHA:'b'.repeat(40)};
 assert.equal(candidate.candidateConfigurationFromEnv(env).revision,'a'.repeat(40));assert.equal(candidate.candidateConfigurationFromEnv(env).enabled,true);
 delete env.TABWISE_CANDIDATE_REVISION;assert.equal(candidate.candidateConfigurationFromEnv(env).enabled,false,'merge SHA alone is not execution source authorization');
});
