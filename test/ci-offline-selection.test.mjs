import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {selectTests, profilePlan, runFile, fileWatchdogMs} from '../scripts/offline-tests.mjs';

test('ordinary and every stress profile share a fail-closed offline allowlist', () => {
  const names = readdirSync('test').filter(name => name.endsWith('.test.mjs'));
  const selection = selectTests(names);
  assert.ok(selection.included.includes('r2-capture-receipts.test.mjs'));
  for (const name of ['fernway.test.mjs','tabwise-network-browser.test.mjs','tabwise-qualification-browser.test.mjs','tabwise-d73-admission.test.mjs']) {
    assert.ok(!selection.included.includes(name));
    assert.ok(selection.excluded.some(row => row.file === name));
  }
  for (const profile of profilePlan('123')) assert.deepEqual([...profile.files].sort(), selection.included);
  assert.throws(() => selectTests([...names, 'new-unknown.test.mjs']), /unclassified.*new-unknown/);
  assert.throws(() => selectTests(names.filter(name => name !== 'fernway.test.mjs')), /missing.*fernway/);
});

test('an open listener becomes a bounded named timeout, not PASS', async () => {
  const result = await runFile(['-e', `require('node:http').createServer().listen(0,'127.0.0.1')`], {timeoutMs:300});
  assert.equal(result.classification, 'TIMEOUT');
  assert.notEqual(result.code, 0);
});

test('a failing child is a failure and a successful child is PASS', async () => {
  assert.equal((await runFile(['-e','process.exitCode=7'])).classification, 'FAIL');
  assert.equal((await runFile(['-e',''])).classification, 'PASS');
});

test('workflow invokes only bounded profiles and retains post-checks and diagnostics', () => {
  const workflow=readFileSync('.github/workflows/preflight.yml','utf8');
  assert.doesNotMatch(workflow, /run: npm test|test\/\*\.test\.mjs/);
  assert.match(workflow,/node scripts\/offline-tests.mjs --profile ordinary/);
  assert.match(workflow,/node scripts\/offline-tests.mjs --profile stress/);
  assert.match(workflow,/after\.json/);
  assert.match(workflow,/Upload preflight output\s+if: always\(\)/);
});


test('a file with no registered tests or only skips cannot be counted as PASS', async () => {
  const dir=mkdtempSync(join(tmpdir(),'ci-h1-counts-'));
  try {
    const files={
      empty:'// no registered tests\n',
      skipped:"import {test} from 'node:test'; test('skip',{skip:true},()=>{});\n",
      passing:"import {test} from 'node:test'; test('pass',()=>{});\n",
    };
    for(const [kind,source] of Object.entries(files)) {
      const path=join(dir,`${kind}.test.mjs`);
      writeFileSync(path,source);
      const result=await runFile(['--test-reporter=tap','--test-timeout=10000',path],
        {expectTests:true,timeoutMs:3000});
      assert.equal(result.classification,kind==='passing'?'PASS':'FAIL',`${kind}: ${JSON.stringify(result)}`);
      if(kind==='passing')assert.equal(result.test_totals?.tests,1);
      if(kind==='skipped')assert.equal(result.test_totals?.skipped,1);
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});

// CI-H2: the hosted mixed stress file was making progress when the 60s process cap
// terminated it. The exception must not affect any other file or fault profile.
test('only mixed speech gets 120s and the 180s profile remainder still wins', () => {
  for(const profile of profilePlan('125615')) {
    for(const file of profile.files) {
      const cap=fileWatchdogMs(profile.name,file,180000);
      assert.equal(cap,profile.name==='mixed'&&file==='speech.test.mjs'?120000:60000,`${profile.name}/${file}`);
    }
  }
  assert.equal(fileWatchdogMs('mixed','speech.test.mjs',45000),45000);
  assert.equal(fileWatchdogMs('mixed','speech.test.mjs',120000),120000);
  assert.equal(fileWatchdogMs('mixed','sendguard.test.mjs',180000),60000);
  assert.throws(()=>fileWatchdogMs('mixed','speech.test.mjs',0),/remainder/);
});
