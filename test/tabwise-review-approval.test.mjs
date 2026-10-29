import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as approval from '../scripts/tabwise/review-approval.mjs';
test('PASS requires independent reviewer, review, owner reference and current content seal',()=>{
 const digest=approval.reviewContentDigest();
 const good={verdict:'PASS',reviewer:'Claude independent reviewer',review_ref:'local-review.md',owner_approval_ref:'D-owner-future',reviewed_files:[...approval.REVIEW_FILES],reviewed_sha256:digest};
 assert.equal(approval.checkReviewApproval(good).ok,true);
 for(const key of ['reviewer','review_ref','owner_approval_ref','reviewed_sha256'])assert.equal(approval.checkReviewApproval({...good,[key]:null}).ok,false,key);
 assert.equal(approval.checkReviewApproval({...good,reviewed_sha256:'0'.repeat(64)}).ok,false);
 assert.equal(approval.checkReviewApproval({...good,reviewed_files:good.reviewed_files.slice(1)}).ok,false);
 assert.equal(approval.checkReviewApproval({...good,reviewed_files:[...good.reviewed_files].reverse()}).ok,false);
 assert.equal(approval.checkReviewApproval({...good,verdict:'BLOCK'}).ok,false);
});
