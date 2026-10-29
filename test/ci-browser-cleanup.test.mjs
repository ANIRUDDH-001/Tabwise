import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

for (const file of ['fernway.test.mjs', 'tabwise-network-browser.test.mjs']) {
  test(`launch rejection releases the actual ${file} listener and exits`, () => {
    const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['--import', './test/helpers/reject-browser.mjs',
      `test/${file}`], {env, encoding:'utf8', timeout:3000, killSignal:'SIGKILL', windowsHide:true});
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 1, 'synthetic launch failure must remain a test failure');
    assert.match(result.stdout, /CI-H1 synthetic launch rejection/);
    assert.match(result.stdout, /CI-H1 listener opened/);
    assert.match(result.stdout, /CI-H1 listener closed/);
  });
}
