import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildArmPayload } from '../src/r2/preparation.mjs';

test('R2 arms: both receive only the same declared keys, and observations have citable identities', () => {
  const evidence = {
    fixture_id: 'f-abc', actions: [{ step: 'a01', press: 'Tab', expect_focus: 'secret', healthy: true }],
    speech: [{ seq: 7, step: 'a01', text: 'Control' }], screenshots: [{ seq: 3, step: 'a01', image: 'data:image/png;base64,AAAA' }],
  };
  const speech = buildArmPayload('speech', evidence), visual = buildArmPayload('visual', evidence);
  assert.deepEqual(speech.actions, [{ step: 'a01', press: 'Tab' }]);
  assert.deepEqual(visual.actions, speech.actions);
  assert.equal(speech.observations[0].ref, 'speech:7');
  assert.equal(visual.observations[0].ref, 'visual:3');
  assert.equal(JSON.stringify(speech).includes('secret'), false);
});
