// No Playwright import or real process: exercise the production adapter with a fake browser engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { fixtureBrowser } from '../src/speech/browser.mjs';
import { finishRun } from '../src/speech/capture.mjs';

test('D43 browser lifetime: no engine signal handler removes the target before teardown allows closure', async () => {
  const proc = new EventEmitter(), calls = [];
  const page = { addInitScript: async () => calls.push('key log'), goto: async () => calls.push('goto'), evaluate: async () => [] };
  const server = { process: () => ({ pid: 777 }), wsEndpoint: () => 'fake', close: async () => calls.push('close'), kill: async () => calls.push('kill') };
  const chromium = {
    async launchServer(options) {
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
        if (options[`handle${signal}`] !== false) proc.on(signal, () => calls.push('automatic close'));
      }
      return server;
    },
    connect: async () => ({ version: () => 'fake', newPage: async () => page, close: async () => {} }),
  };
  const browser = fixtureBrowser({ chromium, cfg: { load_timeout_ms: 50 }, versions: {} });
  const target = await browser.open('http://127.0.0.1:1/r1/signup.html');
  assert.equal(target.pid, 777);
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) proc.emit(s);
  assert.deepEqual(calls, ['key log', 'goto']);
  let allow;
  const teardown = async () => { await new Promise((r) => { allow = r; }); await target.close(); };
  const completion = finishRun({ state: { aborted: false }, teardown });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(calls, ['key log', 'goto'], 'target retained throughout pending cleanup');
  allow(); await completion;
  assert.deepEqual(calls, ['key log', 'goto', 'close']);
});

test('D43 runner completion: success and failure enter only the single teardown; an earlier signal owns completion', async () => {
  const calls = [], teardown = async (...args) => calls.push(args);
  await finishRun({ state: { aborted: false }, teardown });
  await finishRun({ failed: new Error('original error'), state: { aborted: false }, teardown });
  await finishRun({ state: { aborted: true }, teardown });
  assert.deepEqual(calls, [
    ['run finished', { status: 'finished' }],
    ['runner error: original error', { status: 'crashed' }],
  ]);
});

test('D43 runner epilogue: the exact production completion block cannot kill the target ahead of teardown', async () => {
  const src = readFileSync(new URL('../scripts/r1.mjs', import.meta.url), 'utf8');
  const at = src.lastIndexOf('let failed = null;');
  assert.ok(at > 0);
  const names = ['runR1', 'nvda', 'browser', 'fg', 'cfg', 'runId', 'port', 'evidence', 'state', 'meta', 'interference', 'guard', 'diag', 'finishRun', 'killAll', 'teardown'];
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const calls = [];
  let release;
  const teardown = async () => { calls.push('teardown'); await new Promise((r) => { release = r; }); calls.push('target may close'); };
  const values = [async () => {}, {}, {}, {}, {}, 'fake', 1, {}, { aborted: false }, {}, () => [], {}, () => {}, finishRun, async () => calls.push('early kill'), teardown];
  const completion = new AsyncFunction(...names, src.slice(at))(...values);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(calls, ['teardown']);
  release(); await completion;
  assert.deepEqual(calls, ['teardown', 'target may close']);
});
