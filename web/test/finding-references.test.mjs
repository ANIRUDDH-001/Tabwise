import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findingReferences} from '../lib/server/finding-references.mjs';
test('findings retain exact bounded references and omit malformed link targets',()=>{
 assert.deepEqual(findingReferences([{id:'f',source:'spark',evidence_refs:['speech:1','https://private.invalid','<script>']},{id:'x',source:'untrusted',evidence_refs:['key:1']}]),{f:['speech:1']});
});
