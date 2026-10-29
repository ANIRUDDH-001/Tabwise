// Budget broker (PROTOCOLS §11): reserve the worst case before a call, settle actual usage after it.
// SQLite holds reservations; BEGIN IMMEDIATE serializes reservers across processes.
import { DatabaseSync } from 'node:sqlite';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { priceOf, worstCaseNano, settledNano, toUsd, toNano } from './prices.mjs';

export const HARD_CAP_USD = 100; // D25 combined application ceiling; compatibility export.
export const LOCAL_CAP_USD = 60; // D-59/D13b: local/eval broker may never consume the hosted $40.

export class BudgetError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BudgetError';
  }
}

const COST_FIELDS = [
  'run_id', 'experiment', 'ts_utc', 'git_sha', 'model_id', 'mode', 'reasoning_effort',
  'prompt_sha256', 'input_sha256', 'output_sha256', 'tokens_in', 'tokens_out', 'tokens_cached',
  'latency_ms', 'cost_usd', 'retries', 'verdict', 'ground_truth_id', 'abstained', 'notes',
  'account', 'reserved_usd', 'settled_usd', 'cumulative_usd',
];

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY,
    run_id TEXT, task TEXT, model TEXT NOT NULL,
    reserved_nano INTEGER NOT NULL,
    settled_nano INTEGER,
    status TEXT NOT NULL CHECK (status IN ('open', 'settled')),
    created_utc TEXT NOT NULL, settled_utc TEXT
  );`;

const isCount = (n) => Number.isSafeInteger(n) && n >= 0;

export function openBroker({ dbPath, costsPath, capUsd = LOCAL_CAP_USD, now = () => new Date().toISOString() }) {
  // Historical callers pass the former $100 default explicitly. Saturate that legacy
  // value at $60; it never grants access to the hosted allocation. Other raises refuse.
  if (capUsd === HARD_CAP_USD) capUsd = LOCAL_CAP_USD;
  if (typeof capUsd !== 'number' || !Number.isFinite(capUsd) || capUsd <= 0 || capUsd > LOCAL_CAP_USD) {
    throw new BudgetError(`cap must be > 0 and <= $${LOCAL_CAP_USD}, got ${capUsd}`);
  }
  const capNano = toNano(capUsd);
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA busy_timeout = 10000');
  db.exec(SCHEMA);

  function tx(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  const metaGet = db.prepare('SELECT value FROM meta WHERE key = ?');
  const metaSet = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
  const totals = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN status = 'settled' THEN settled_nano END), 0) AS settled,
      COALESCE(SUM(CASE WHEN status = 'open' THEN reserved_nano END), 0) AS reserved,
      COUNT(CASE WHEN status = 'open' THEN 1 END) AS open
    FROM reservations`);

  // A new database starts from the spend already in COSTS.jsonl, so deleting it never resets the budget.
  tx(() => {
    if (metaGet.get('imported')) return;
    let nano = 0;
    if (existsSync(costsPath)) {
      for (const line of readFileSync(costsPath, 'utf8').split('\n')) {
        if (line.trim()) nano += toNano(JSON.parse(line).settled_usd ?? 0);
      }
    }
    metaSet.run('imported', '1');
    metaSet.run('imported_nano', String(nano));
  });

  function current() {
    const t = totals.get();
    const imported = Number(metaGet.get('imported_nano').value);
    return { spent: imported + Number(t.settled), reserved: Number(t.reserved), open: Number(t.open) };
  }

  function reserve({ model, inputTokens, maxOutputTokens, images = 0, runId = null, task = null, perCallCapUsd = capUsd }) {
    if (!priceOf(model)) throw new BudgetError(`unknown model ${model}: no price, refused`);
    if (!isCount(inputTokens) || !isCount(images)) throw new BudgetError('inputTokens and images must be counts');
    if (!isCount(maxOutputTokens)) throw new BudgetError('max_output_tokens is required: the cost cannot be bounded without it');
    const worst = worstCaseNano({ model, inputTokens, maxOutputTokens, images });
    if (!Number.isSafeInteger(worst) || worst < 0) throw new BudgetError('unsafe reservation amount');
    if (!Number.isFinite(perCallCapUsd) || perCallCapUsd < 0 || worst > toNano(perCallCapUsd)) throw new BudgetError('per-call cap exceeded');
    return tx(() => {
      if (metaGet.get('alarm')) throw new BudgetError('budget alarm: manual reconciliation required before another call');
      const c = current();
      if (c.spent + c.reserved + worst > capNano) {
        throw new BudgetError(`refused: spent $${toUsd(c.spent)} + reserved $${toUsd(c.reserved)} + this call $${toUsd(worst)} > cap $${capUsd}`);
      }
      const r = db.prepare(`INSERT INTO reservations (run_id, task, model, reserved_nano, status, created_utc)
        VALUES (?, ?, ?, ?, 'open', ?)`).run(runId, task, model, worst, now());
      return { id: Number(r.lastInsertRowid), reservedUsd: toUsd(worst) };
    });
  }

  function settle(id, { usage, record = {} }) {
    let out;
    try { out = tx(() => {
      const row = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
      if (!row || row.status !== 'open') throw new BudgetError(`reservation ${id} is not open`);
      if (!isCount(usage?.input_tokens) || !isCount(usage?.output_tokens)) throw new BudgetError('usage needs input_tokens and output_tokens');
      if (!isCount(usage.cached_tokens ?? 0) || (usage.cached_tokens ?? 0) > usage.input_tokens) throw new BudgetError('cached tokens must be within input usage');
      const nano = settledNano(row.model, usage);
      if (!Number.isSafeInteger(nano) || nano < 0 || nano > Number(row.reserved_nano)) {
        throw Object.assign(new BudgetError('settled above reservation or unsafe amount: alarm; full reservation retained'), { budgetAlarm: true });
      }
      const ts = now();
      db.prepare(`UPDATE reservations SET status = 'settled', settled_nano = ?, settled_utc = ? WHERE id = ?`).run(nano, ts, id);
      return { row, nano, ts, cumulative: current().spent };
    }); } catch (error) {
      if (error.budgetAlarm) db.prepare('INSERT OR REPLACE INTO meta (key,value) VALUES (?,?)').run('alarm', 'above-reservation settlement; manual reconciliation required');
      throw error;
    }
    const { row, nano, ts, cumulative } = out;
    const line = Object.fromEntries(COST_FIELDS.map((f) => [f, null]));
    Object.assign(line, record, {
      run_id: row.run_id,
      experiment: row.task,
      ts_utc: ts,
      model_id: row.model,
      mode: priceOf(row.model).mode,
      tokens_in: usage.input_tokens,
      tokens_out: usage.output_tokens,
      tokens_cached: usage.cached_tokens ?? 0,
      cost_usd: toUsd(nano),
      account: record.account ?? 'team',
      reserved_usd: toUsd(Number(row.reserved_nano)),
      settled_usd: toUsd(nano),
      cumulative_usd: toUsd(cumulative),
      notes: nano > Number(row.reserved_nano) ? 'settled above reservation: check the price bounds' : (record.notes ?? null),
    });
    mkdirSync(dirname(costsPath), { recursive: true });
    appendFileSync(costsPath, JSON.stringify(line) + '\n');
    return { settledUsd: toUsd(nano), cumulativeUsd: toUsd(cumulative) };
  }

  function status() {
    const c = current();
    return { spentUsd: toUsd(c.spent), reservedUsd: toUsd(c.reserved), capUsd, openReservations: c.open };
  }

  return { reserve, settle, status, close: () => db.close() };
}

// The project's broker. BUDGET_CAP_USD may lower the cap (e.g. a split cap per machine), never raise it.
export function openProjectBroker() {
  const cap = process.env.BUDGET_CAP_USD ? Number(process.env.BUDGET_CAP_USD) : LOCAL_CAP_USD;
  return openBroker({ dbPath: 'cache/budget.sqlite', costsPath: 'docs/ledger/COSTS.jsonl', capUsd: cap });
}
