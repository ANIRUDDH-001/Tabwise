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
| `scripts/versions.mjs` | R0 version record (read-only; NVDA via Guidepup's registry key) | `npm run versions` | — |
| `cache/` (git-ignored) | `budget.sqlite`, `payloads/` | — | — |
