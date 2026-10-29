import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {installQualificationCrashHandlers} from '../scripts/tabwise/qualification-crash.mjs';
test('L1 repeated and reentrant crashes abort without restarting teardown; handlers are removed',()=>{
 const target=new EventEmitter();let aborts=0,records=0;
 const remove=installQualificationCrashHandlers({target,abort:()=>aborts++,record:()=>{records++;target.emit('uncaughtException',Error('nested'));}});
 target.emit('uncaughtException',Error('first'));target.emit('uncaughtException',Error('second'));target.emit('unhandledRejection',Error('third'));
 assert.equal(records,1);assert.equal(aborts,4);assert.equal(target.exitCode,2);remove();assert.equal(target.listenerCount('uncaughtException'),0);assert.equal(target.listenerCount('unhandledRejection'),0);
});
