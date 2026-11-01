import {test} from 'node:test';import assert from 'node:assert/strict';
import {nextTabIndex} from '../lib/tabs.mjs';
test('arrow keys wrap, Home/End jump, other keys are ignored',()=>{
 assert.equal(nextTabIndex('ArrowRight',3,4),0);assert.equal(nextTabIndex('ArrowLeft',0,4),3);assert.equal(nextTabIndex('ArrowRight',1,4),2);
 assert.equal(nextTabIndex('Home',2,4),0);assert.equal(nextTabIndex('End',0,4),3);assert.equal(nextTabIndex('Enter',1,4),null);assert.equal(nextTabIndex('ArrowRight',0,0),-1);
});
