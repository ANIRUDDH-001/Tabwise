import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openBroker } from '../src/budget/broker.mjs';
import { respond, ClientError } from '../src/meta/client.mjs';

const KEY = 'sk-test-DO-NOT-LOG-0123456789';

function setup(capUsd = 100) {
  const dir = mkdtempSync(join(tmpdir(), 'client-'));
  const costsPath = join(dir, 'COSTS.jsonl');
  const broker = openBroker({ dbPath: join(dir, 'budget.sqlite'), costsPath, capUsd });
  return { dir, costsPath, logDir: join(dir, 'payloads'), broker };
}

// A fake fetch that records what it was sent and answers with a Responses API body.
function fakeFetch(body, { status = 200 } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok: status < 400, status, text: async () => JSON.stringify(body) };
  };
  return { impl, calls };
}

const OK_BODY = {
  id: 'resp_1',
  output: [{ type: 'message', content: [{ type: 'output_text', text: 'hello' }] }],
  usage: { input_tokens: 40, output_tokens: 10, input_tokens_details: { cached_tokens: 0 } },
};

function allLogged(t) {
  const files = existsSync(t.logDir) ? readdirSync(t.logDir).map((f) => readFileSync(join(t.logDir, f), 'utf8')) : [];
  const costs = existsSync(t.costsPath) ? readFileSync(t.costsPath, 'utf8') : '';
  return files.join('\n') + costs;
}

test('posts to /responses with a bearer key and max_output_tokens, then settles usage', async () => {
  const t = setup();
  const f = fakeFetch(OK_BODY);
  const out = await respond({
    broker: t.broker, model: 'muse-spark-1.3', input: 'hi', maxOutputTokens: 50,
    runId: 'c1', task: 'F-01', fetchImpl: f.impl, apiKey: KEY, logDir: t.logDir,
  });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'https://api.meta.ai/v1/responses');
  assert.equal(f.calls[0].init.method, 'POST');
  assert.equal(f.calls[0].init.headers.Authorization, `Bearer ${KEY}`);
  assert.deepEqual(f.calls[0].body, { model: 'muse-spark-1.3', input: 'hi', max_output_tokens: 50 });
  assert.equal(out.text, 'hello');
  assert.equal(out.settledUsd.toFixed(9), ((40 * 1.25 + 10 * 4.25) / 1e6).toFixed(9));
  const s = t.broker.status();
  assert.equal(s.openReservations, 0);
  const line = JSON.parse(readFileSync(t.costsPath, 'utf8').trim());
  assert.equal(line.run_id, 'c1');
  assert.equal(line.tokens_out, 10);
  assert.ok(Number.isInteger(line.latency_ms));
  assert.match(line.input_sha256, /^[0-9a-f]{64}$/);
  t.broker.close();
});

test('the request payload is logged before the call is made', async () => {
  const t = setup();
  let loggedBeforeCall = false;
  const impl = async (url, init) => {
    loggedBeforeCall = existsSync(t.logDir) && readdirSync(t.logDir).some((f) => f.endsWith('request.json'));
    return { ok: true, status: 200, text: async () => JSON.stringify(OK_BODY) };
  };
  await respond({ broker: t.broker, model: 'muse-spark-1.3', input: 'hi', maxOutputTokens: 5, runId: 'c2', fetchImpl: impl, apiKey: KEY, logDir: t.logDir });
  assert.ok(loggedBeforeCall);
  t.broker.close();
});

test('cached tokens are read from usage.cached_tokens too', async () => {
  const t = setup();
  const f = fakeFetch({ ...OK_BODY, usage: { input_tokens: 100, output_tokens: 0, cached_tokens: 60 } });
  const out = await respond({ broker: t.broker, model: 'muse-spark-1.3', input: 'hi', maxOutputTokens: 5, fetchImpl: f.impl, apiKey: KEY, logDir: t.logDir });
  assert.equal(out.settledUsd.toFixed(9), ((40 * 1.25 + 60 * 0.15) / 1e6).toFixed(9));
  t.broker.close();
});

test('Contributor models only take our own fixtures (D-29, Meta terms 6.1-6.2)', async () => {
  const t = setup();
  const f = fakeFetch(OK_BODY);
  await assert.rejects(
    respond({ broker: t.broker, model: 'muse-spark-1.3-contributor', input: 'x', maxOutputTokens: 5, fetchImpl: f.impl, apiKey: KEY, logDir: t.logDir }),
    ClientError,
  );
  assert.equal(f.calls.length, 0);
  assert.equal(t.broker.status().openReservations, 0);
  await respond({ broker: t.broker, model: 'muse-spark-1.3-contributor', input: 'x', maxOutputTokens: 5, inputClass: 'own-fixture', fetchImpl: f.impl, apiKey: KEY, logDir: t.logDir });
  assert.equal(f.calls.length, 1);
  t.broker.close();
});

test('no call is made without a key or over the cap', async () => {
  const t = setup(0.000001);
  const f = fakeFetch(OK_BODY);
  await assert.rejects(respond({ broker: t.broker, model: 'muse-spark-1.3', input: 'x', maxOutputTokens: 5, fetchImpl: f.impl, apiKey: '', logDir: t.logDir }), ClientError);
  await assert.rejects(respond({ broker: t.broker, model: 'muse-spark-1.3', input: 'x'.repeat(1000), maxOutputTokens: 5000, fetchImpl: f.impl, apiKey: KEY, logDir: t.logDir }), /cap/);
  assert.equal(f.calls.length, 0);
  t.broker.close();
});

test('an HTTP error keeps the reservation open and never shows the key', async () => {
  const t = setup();
  const f = fakeFetch({ error: { message: `bad key ${KEY}` } }, { status: 401 });
  await assert.rejects(
    respond({ broker: t.broker, model: 'muse-spark-1.3', input: 'x', maxOutputTokens: 5, fetchImpl: f.impl, apiKey: KEY, logDir: t.logDir }),
    (e) => e instanceof ClientError && e.status === 401 && !e.message.includes(KEY),
  );
  assert.equal(t.broker.status().openReservations, 1);
  assert.ok(!allLogged(t).includes(KEY));
  t.broker.close();
});

test('a network failure keeps the reservation open and never shows the key', async () => {
  const t = setup();
  const impl = async () => { throw new Error(`connect failed with header Bearer ${KEY}`); };
  await assert.rejects(
    respond({ broker: t.broker, model: 'muse-spark-1.3', input: 'x', maxOutputTokens: 5, fetchImpl: impl, apiKey: KEY, logDir: t.logDir }),
    (e) => e instanceof ClientError && !e.message.includes(KEY) && !String(e.stack).includes(KEY),
  );
  assert.equal(t.broker.status().openReservations, 1);
  assert.ok(!allLogged(t).includes(KEY));
  t.broker.close();
});

test('a response without usage keeps the reservation open', async () => {
  const t = setup();
  const f = fakeFetch({ id: 'resp_2', output: [] });
  await assert.rejects(
    respond({ broker: t.broker, model: 'muse-spark-1.3', input: 'x', maxOutputTokens: 5, fetchImpl: f.impl, apiKey: KEY, logDir: t.logDir }),
    /usage/,
  );
  assert.equal(t.broker.status().openReservations, 1);
  t.broker.close();
});
