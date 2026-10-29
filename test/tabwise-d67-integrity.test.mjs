import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createQualificationIntegrity} from '../scripts/tabwise/qualification-integrity.mjs';

test('B1 exports a phase verifier and send closure without hashing or Git on sends',()=>{
 assert.equal(typeof createQualificationIntegrity,'function');
 const loader=readFileSync(new URL('../scripts/tabwise/qualification-loader.mjs',import.meta.url),'utf8');
 const inspect=loader.slice(loader.indexOf('const inspect='),loader.indexOf('guard.setIntegrity'));
 assert.equal(inspect.includes('checkFrozenIntegrity'),false);
 const core=readFileSync(new URL('../scripts/tabwise/qualification-core.mjs',import.meta.url),'utf8');
 assert.equal(core.slice(core.indexOf('const live='),core.indexOf('const check=')).includes('assertAuthentic'),false);
});
