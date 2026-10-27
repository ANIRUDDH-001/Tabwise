# CODEMAP — where things live (≤80 lines; updated at session end; PROTOCOLS §3)

Read this before opening source files. One line per file or folder. If a line is wrong, fix it in the same session.

| Path | Purpose | Entry points / key symbols | Tests |
|---|---|---|---|
| `AGENTS.md`, `CLAUDE.md` | Agent rules (Claude imports AGENTS.md) | — | — |
| `docs/governance/PROTOCOLS.md` | Protocols, read by section | — | — |
| `docs/ledger/` | STATE, PLAN, DECISIONS, LOG, COSTS, FEATURES, QUESTIONS, PROVENANCE | — | — |
| `.claude/`, `.codex/` | Tool config and the SessionStart hook | `.claude/hooks/session_start.py` | — |
| `src/budget/prices.mjs` | Meta prices (nano-USD per token), source and read date | `PRICES`, `worstCaseUsd()`, `settledUsd()`, `IMAGE_TOKEN_BOUND` | `test/broker.test.mjs` |
| `src/budget/broker.mjs` | Budget broker: SQLite reservations, $100 hard cap, COSTS.jsonl lines | `openBroker()`, `openProjectBroker()`, `reserve()`, `settle()`, `status()` | `test/broker.test.mjs` |
| `src/meta/client.mjs` | The only path to the Meta API (`/v1/responses`); D-29 Contributor guard; payload logs in `cache/payloads/` | `respond()`, `ClientError` | `test/client.test.mjs` |
| `scripts/spend.mjs` | Spend, reserved and headroom against the cap | `npm run spend` | — |
| `scripts/versions.mjs` | R0 version record (read-only; NVDA via Guidepup's manifest path lookup) | `npm run versions` | — |
| `src/speech/validate.mjs` | R1 validator, pure: record schema, step rules (C2 checked/not checked, A3 typed echo), fresh, complete, 3/3 rule | `stepFailures()`, `judgeAttempt()`, `judgeRun()`, `isChecked()` | `test/speech.test.mjs` |
| `src/speech/capture.mjs` | R1 runner core with injected NVDA and browser; evidence writer; SIGINT handling (C3); 127.0.0.1 fixture server; lock helpers | `runAttempt()`, `runR1()`, `installAbort()`, `serveDir()`, `evidenceWriter()` | `test/speech.test.mjs` |
| `scripts/r1.mjs` | R1 real NVDA run (the user runs it); refuses if `fixtures/r1/lock.json` hashes differ | `npm run r1`; `node scripts/r1.mjs --hashes` | via `capture.mjs` tests |
| `fixtures/r1/` | R1 page (`signup.html`), 10 steps and settings (`steps.json`), hash lock (`lock.json`) | — | `test/speech.test.mjs` |
| `docs/evidence/r1/<run_id>/` | R1 evidence: `attempt-N.jsonl`, `raw-N.json`, `summary.json` (written by `npm run r1`) | — | — |
| `cache/` (git-ignored) | `budget.sqlite`, `payloads/` | — | — |
