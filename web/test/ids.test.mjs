import {test} from 'node:test';import assert from 'node:assert/strict';
import {isUuid} from '../lib/ids.mjs';
test('only lower-case UUIDs are accepted as record ids',()=>{
 assert.ok(isUuid('0f8fad5b-d9cb-469f-a165-70867728950e'));
 for(const bad of ['abc','pending','0F8FAD5B-D9CB-469F-A165-70867728950E','0f8fad5b-d9cb-469f-a165-70867728950e/../x','',null,undefined,'r1-20261028T134638Z'])assert.equal(isUuid(bad),false,String(bad));
});
