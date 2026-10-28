# CODEMAP — where things live (≤80 lines; updated at session end; PROTOCOLS §3)

Read this before opening source files. One line per file or folder. If a line is wrong, fix it in the same session.

| Path | Purpose | Entry points / key symbols | Tests |
|---|---|---|---|
| `AGENTS.md`, `CLAUDE.md` | Agent rules (Claude imports AGENTS.md) | — | — |
| `docs/governance/PROTOCOLS.md` | Protocols, read by section | — | — |
| `docs/ledger/` | STATE, PLAN, DECISIONS, LOG, COSTS, FEATURES, QUESTIONS, PROVENANCE, INCIDENTS (I-01), RUNS (scored R1 runs, append-only; S13) | — | — |
| `docs/reviews/` | R1 #1 nonce analysis (`R1-run1-analysis-codex.md`, `R1-run1-offline-results.json`), proposed nonce patch, its D-48 review and the D-49 review (`R1-spoken-nonce-*`); review briefs and reports (`R1-D36-*`, `R1-D37-*`, `R1-D39-patch-spec.md`, `R1-D39-review-brief.md` for Codex) | — | — |
| `.github/workflows/r1.yml` | R1 on a GitHub-hosted Windows VM: manual trigger, one job, no secrets, actions pinned to commit SHAs, main only, read-only checkout, evidence from `RUNNER_TEMP` uploaded `if: always()`; `nvda.log` scrubbed and capped; `Evidence contract` step fails the job when a run folder has no `summary.json` (D-36, D-37, D-39 S-04) | `workflow_dispatch` | workflow text tests (LF and CRLF) in `test/speech.test.mjs` |
| `.claude/`, `.codex/` | Tool config and the SessionStart hook | `.claude/hooks/session_start.py` | — |
| `src/budget/prices.mjs` | Meta prices (nano-USD per token), source and read date | `PRICES`, `worstCaseUsd()`, `settledUsd()`, `IMAGE_TOKEN_BOUND` | `test/broker.test.mjs` |
| `src/budget/broker.mjs` | Budget broker: SQLite reservations, $100 hard cap, COSTS.jsonl lines | `openBroker()`, `openProjectBroker()`, `reserve()`, `settle()`, `status()` | `test/broker.test.mjs` |
| `src/meta/client.mjs` | The only path to the Meta API (`/v1/responses`); D-29 Contributor guard; payload logs in `cache/payloads/` | `respond()`, `ClientError` | `test/client.test.mjs` |
| `scripts/spend.mjs` | Spend, reserved and headroom against the cap | `npm run spend` | — |
| `scripts/versions.mjs` | R0 version record (read-only; NVDA via Guidepup's manifest path lookup) | `npm run versions` | — |
| `src/speech/validate.mjs` | R1 validator, pure: record schema, step rules (C2 checked/not checked, A3 typed echo), fresh, complete, 3/3 rule | `stepFailures()`, `judgeAttempt()`, `judgeRun()`, `isChecked()` | `test/speech.test.mjs` |
| `src/speech/capture.mjs` | R1 runner core with injected NVDA, browser and foreground probe; A4 check plus page keydown acknowledgement per action (D-39); intent/action journal `sends-N.jsonl`; evidence writer with read-back journal and `recovered-*` files; one teardown for signals, crashes and the run end (B02); 127.0.0.1 fixture server; lock helpers; `scrubLog` | `runAttempt()`, `runR1()`, `buildSummary()`, `writeSummary()`, `installTeardown()`, `serveDir()`, `evidenceWriter()`, `scrubLog()` | `test/speech.test.mjs` |
| `src/speech/foreground.mjs` | A4 read-only foreground-window probe (PowerShell + user32 Get* calls) and the pid/nonce match | `foregroundProbe()`, `foregroundMismatch()`, `PROBE_PS` | `test/speech.test.mjs` |
| `src/speech/runguard.mjs` | D-36 run guard: GitHub-hosted Windows runner only; D-37 approved-workflow check; repo snapshot and interference diff | `ciGuardErrors()`, `workflowGuardErrors()`, `APPROVED`, `repoSnapshot()`, `repoChanges()` | `test/speech.test.mjs` |
| `src/speech/sendguard.mjs` | D-39 send gate the vendored Guidepup calls for every key: admit (integrity + foreground check), commit, launched, release, settled; sticky stop; live-send tracking and quiesce; page keydown acknowledgement: log checked before each send, exactly one expected key per send (D-42) | `sendGate()`, `pageAck()`, `judgeKeys()`, `pageKeyOf()`, `VK` | `test/sendguard.test.mjs`, `test/speech.test.mjs` |
| `src/speech/vendortree.mjs` | D-39 vendored-tree checks: tree hash, file-by-file match to installed upstream, upstream-module refusal, run-time integrity (frozen tables, one gate); the exact upstream pins of lock.dependencies (D-42) | `treeHash()`, `checkVendor()`, `upstreamLoaded()`, `vendorIntegrity()`, `VENDOR_DIR`, `UPSTREAM_PINS`, `pinErrors()` | `test/vendor.test.mjs`, `test/speech.test.mjs` |
| `vendor/guidepup-0.36.4-r1/` | Vendored Guidepup 0.36.4 (MIT), the only copy R1 loads; 8 files changed (5 D-39, 3 D-43), `r1Gate.js` added; record in `VENDORED.md` | `lib/windows/NVDA/NVDA.js`, `lib/windows/r1Gate.js` | `test/vendor.test.mjs` (sandboxed, `test/helpers/sandbox.mjs`) |
| `scripts/r1.mjs` | R1 real NVDA run, only inside `.github/workflows/r1.yml` (D-36); refuses off CI, outside the approved workflow, on a dirty checkout, or if `fixtures/r1/lock.json` file, upstream or vendor-tree hashes differ; sets the gate, then loads vendored Guidepup; page keydown counter; exits only through the teardown | `npm run r1`; `node scripts/r1.mjs --hashes`; `--scrub-log <in> <out>` | via `capture.mjs` tests + source-order test |
| `fixtures/r1/` | R1 page (`signup.html`), 10 steps and settings (`steps.json`), hash lock (`lock.json`) | — | `test/speech.test.mjs` |
| `docs/evidence/r1/<run_id>/` | R1 evidence: `attempt-N.jsonl`, `raw-N.json`, `focus-N.jsonl`, `sends-N.jsonl`, `summary.json`, any `recovered-*` (written in CI under `%RUNNER_TEMP%/r1-evidence/`, D-37; the user downloads the artifact here). Never deleted (I-01) | — | — |
| `cache/` (git-ignored) | `budget.sqlite`, `payloads/` | — | — |

| `src/speech/browser.mjs` | Headed fixture browser adapter with engine signal handlers disabled; supplied engine only after CI gates | `fixtureBrowser()` | `test/browser.test.mjs` (fake engine) |
| `test/engineering.test.mjs` | D-43 actual gate and vendored transport/lifecycle regression tests; process/network denial imported first | `node --test test/engineering.test.mjs` | fake OS boundaries only |
| `docs/engineering/` | D-43 engineering hypotheses, experiments and handoff | `F-02-ownership-plan.md`, `F-02-experiments.md` | measured offline results, no R1 PASS |
