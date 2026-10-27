# CODEMAP — where things live (≤80 lines; updated at session end; PROTOCOLS §3)

Read this before opening source files. One line per file or folder. If a line is wrong, fix it in the same session.

| Path | Purpose | Entry points / key symbols | Tests |
|---|---|---|---|
| `AGENTS.md`, `CLAUDE.md` | Agent rules (Claude imports AGENTS.md) | — | — |
| `docs/governance/PROTOCOLS.md` | Protocols, read by section | — | — |
| `docs/ledger/` | STATE, PLAN, DECISIONS, LOG, COSTS, FEATURES, QUESTIONS, PROVENANCE | — | — |
| `.claude/`, `.codex/` | Tool config and the SessionStart hook | `.claude/hooks/session_start.py` | — |
<!-- Source rows are added at scaffold time, e.g.
| `src/meta_client/` | The only path to the Meta API: budget broker, cache, cost ledger | `call()`, `reserve()`, `settle()` | `tests/test_broker.py` |
-->
