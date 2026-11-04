import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sha256} from '../../packages/contracts/index.mjs';
import * as repair from './repair.mjs';
const base=readFileSync(new URL('../../fixtures/fernway/index.html',import.meta.url),'utf8').replaceAll('\r\n','\n');
test('candidate repair consumes only the exact actually reviewed patch and preserves its base',()=>{
 const result=repair.candidateFixture('patched');
 assert.equal(sha256(base),'5ad4631558cdcc557770ae864957ffc167546cd0af58bd11258808e1c0e523be');
 assert.equal(sha256(result),'1860345c688f2adfe7241b97f05ba32fe345f08b0594cff8476d7b6e70e484ce');
 assert.equal(repair.candidateFixture('broken').toString(),base);
 assert.throws(()=>repair.candidateFixture('healthy'));
});
test('unapproved, swapped or stale repair bytes cannot become native source',()=>{
 const context=repair.repairContext();
 for(const edit of [c=>c.review.decision='rejected',c=>c.review.reviewed_by='foreign',c=>c.patch+=' ',c=>c.base+=' ',c=>c.review.patch_sha256='f'.repeat(64),c=>c.review.source_sha256='f'.repeat(64)]){const c=structuredClone(context);edit(c);assert.throws(()=>repair.materializeReviewedCandidate(c));}
 assert.equal(repair.materializeReviewedCandidate(context).production_qualified,false);
});
