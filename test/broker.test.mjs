import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { openBroker, BudgetError, HARD_CAP_USD } from '../src/budget/broker.mjs';
import { worstCaseUsd, settledUsd } from '../src/budget/prices.mjs';

const COST_FIELDS = [
  'run_id', 'experiment', 'ts_utc', 'git_sha', 'model_id', 'mode', 'reasoning_effort',
  'prompt_sha256', 'input_sha256', 'output_sha256', 'tokens_in', 'tokens_out', 'tokens_cached',
  'latency_ms', 'cost_usd', 'retries', 'verdict', 'ground_truth_id', 'abstained', 'notes',
  'account', 'reserved_usd', 'settled_usd', 'cumulative_usd',
];

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'broker-'));
  return { dir, dbPath: join(dir, 'budget.sqlite'), costsPath: join(dir, 'COSTS.jsonl') };
}

// 1M input tokens of Standard Spark cost $1.25.
const ONE_DOLLAR_25 = { model: 'muse-spark-1.3', inputTokens: 1_000_000, maxOutputTokens: 0 };

test('prices: worst case and settled cost follow the pricing page', () => {
  assert.equal(worstCaseUsd({ model: 'muse-spark-1.3', inputTokens: 1_000_000, maxOutputTokens: 1_000_000 }), 1.25 + 4.25);
  assert.equal(worstCaseUsd({ model: 'muse-spark-1.3-contributor', inputTokens: 1_000_000, maxOutputTokens: 1_000_000 }), 0.3);
  // Cached tokens are billed at the cached rate, the rest at the input rate.
  const usd = settledUsd('muse-spark-1.3', { input_tokens: 1_000_000, cached_tokens: 400_000, output_tokens: 0 });
  assert.equal(usd.toFixed(6), (0.6 * 1.25 + 0.4 * 0.15).toFixed(6));
});

test('refuses an unknown model or a request without max_output_tokens', () => {
  const b = openBroker(tmp());
  assert.throws(() => b.reserve({ model: 'gpt-x', inputTokens: 10, maxOutputTokens: 10 }), BudgetError);
  assert.throws(() => b.reserve({ model: 'muse-spark-1.3', inputTokens: 10 }), BudgetError);
  assert.throws(() => b.reserve({ model: 'muse-spark-1.3', inputTokens: 10, maxOutputTokens: -1 }), BudgetError);
  b.close();
});

test('refuses a reservation that would pass the cap', () => {
  const b = openBroker({ ...tmp(), capUsd: 2 });
  b.reserve({ ...ONE_DOLLAR_25, runId: 'a' });
  assert.throws(() => b.reserve({ ...ONE_DOLLAR_25, runId: 'b' }), /cap/);
  assert.equal(b.status().reservedUsd, 1.25);
  b.close();
});

test('the cap can be lowered but never raised above the hard cap', () => {
  assert.equal(HARD_CAP_USD, 100);
  assert.throws(() => openBroker({ ...tmp(), capUsd: 101 }), BudgetError);
  assert.throws(() => openBroker({ ...tmp(), capUsd: Number.NaN }), BudgetError);
  const b = openBroker({ ...tmp(), capUsd: 5 });
  assert.equal(b.status().capUsd, 5);
  b.close();
});

test('settle records actual usage, releases the remainder and appends a COSTS.jsonl line', () => {
  const t = tmp();
  const b = openBroker(t);
  const r = b.reserve({ model: 'muse-spark-1.3', inputTokens: 1000, maxOutputTokens: 1000, runId: 'r1', task: 'F-01' });
  const out = b.settle(r.id, { usage: { input_tokens: 400, output_tokens: 100, cached_tokens: 0 }, record: { latency_ms: 12 } });
  const expected = (400 * 1.25 + 100 * 4.25) / 1e6;
  assert.equal(out.settledUsd.toFixed(9), expected.toFixed(9));
  const s = b.status();
  assert.equal(s.reservedUsd, 0);
  assert.equal(s.spentUsd.toFixed(9), expected.toFixed(9));
  const lines = readFileSync(t.costsPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 1);
  for (const f of COST_FIELDS) assert.ok(f in lines[0], `missing ${f}`);
  assert.equal(lines[0].run_id, 'r1');
  assert.equal(lines[0].mode, 'standard');
  assert.equal(lines[0].tokens_in, 400);
  assert.equal(lines[0].latency_ms, 12);
  assert.throws(() => b.settle(r.id, { usage: { input_tokens: 1, output_tokens: 1 } }), BudgetError);
  b.close();
});

test('a crashed call keeps its reservation after reopening', () => {
  const t = tmp();
  const b1 = openBroker(t);
  b1.reserve({ ...ONE_DOLLAR_25, runId: 'crash' });
  b1.close(); // no settle: the process "crashed"
  const b2 = openBroker(t);
  const s = b2.status();
  assert.equal(s.reservedUsd, 1.25);
  assert.equal(s.openReservations, 1);
  b2.close();
});

test('a new database imports spend already recorded in COSTS.jsonl', () => {
  const t = tmp();
  writeFileSync(t.costsPath, JSON.stringify({ run_id: 'old', settled_usd: 3.5 }) + '\n' + JSON.stringify({ run_id: 'old2', settled_usd: 1 }) + '\n');
  const b = openBroker(t);
  assert.equal(b.status().spentUsd, 4.5);
  b.close();
  const again = openBroker(t); // the import happens once, not on every open
  assert.equal(again.status().spentUsd, 4.5);
  again.close();
});

test('two concurrent processes cannot overspend', async () => {
  const t = tmp();
  openBroker({ ...t, capUsd: 3 }).close(); // create the schema first
  const worker = join(t.dir, 'worker.mjs');
  const brokerUrl = new URL('../src/budget/broker.mjs', import.meta.url).href;
  writeFileSync(worker, `
    import { openBroker } from ${JSON.stringify(brokerUrl)};
    const [dbPath, costsPath, id] = process.argv.slice(2);
    const b = openBroker({ dbPath, costsPath, capUsd: 3 });
    try { b.reserve({ model: 'muse-spark-1.3', inputTokens: 1000000, maxOutputTokens: 0, runId: id }); console.log('ok'); }
    catch (e) { console.log('refused'); }
    finally { b.close(); }
  `);
  const run = (id) => new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [worker, t.dbPath, t.costsPath, id]);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', reject);
    p.on('close', () => resolve(out.trim()));
  });
  const results = await Promise.all([1, 2, 3, 4, 5].map((i) => run(`w${i}`)));
  // $3 cap / $1.25 each → exactly two fit.
  assert.equal(results.filter((r) => r === 'ok').length, 2, results.join(','));
  const b = openBroker({ ...t, capUsd: 3 });
  assert.equal(b.status().reservedUsd, 2.5);
  b.close();
  assert.ok(!existsSync(t.costsPath) || readFileSync(t.costsPath, 'utf8') === '');
});
