import {test} from 'node:test';import assert from 'node:assert/strict';import {DIAGNOSIS_PROMPT} from '../src/meta/diagnosis.mjs';
test('diagnosis instructs complete bounded patch syntax instead of bare +/- lines',()=>{
 assert.match(DIAGNOSIS_PROMPT,/complete unified diff/);assert.match(DIAGNOSIS_PROMPT,/--- a\//);assert.match(DIAGNOSIS_PROMPT,/\+\+\+ b\//);assert.match(DIAGNOSIS_PROMPT,/exact hunk counts/);assert.match(DIAGNOSIS_PROMPT,/trailing newline/);
});
