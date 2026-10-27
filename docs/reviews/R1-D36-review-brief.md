# Codex review brief: R1 safety fixes (D-36, incident I-01)

Written 2026-10-27 by claude for an independent Codex review. The user gives this brief to Codex. Status: **review not started**.
Codex: report findings only. Do not run `npm run r1`, start NVDA or Guidepup, trigger any workflow, or call the Meta API.
Safe to run: `npm test` (fakes only, writes only to `os.tmpdir()/r1-test-*`), `node scripts/r1.mjs --hashes`, read-only git.

## Context (read first)
- Incident: `docs/ledger/INCIDENTS.md` I-01 (the host-laptop run; causes deliberately left open).
- Decision: `docs/ledger/DECISIONS.md` D-36 (the user's words).
- Spec: `docs/ledger/PLAN.md` § F-02, "Amendments (D-36)": A4 and S1–S6, between the spec markers.

## Files to review (uncommitted on `main`)
| File | Change |
|---|---|
| `src/speech/foreground.mjs` | NEW. Read-only foreground probe (PowerShell + user32 Get* calls) and `foregroundMismatch()` |
| `src/speech/runguard.mjs` | NEW. `ciGuardErrors()`, `repoSnapshot()`, `repoChanges()` |
| `src/speech/capture.mjs` | A4 guard before every key, no Alt+Escape, `focus-lost`, independent cleanup, non-throwing evidence writer, first error kept, interference stops the run |
| `scripts/r1.mjs` | CI-only guard, clean-tree + `GITHUB_SHA` check, probe warm-up, `launchServer` pid, crash handlers, first error to stderr, no `bringToFront` |
| `.github/workflows/r1.yml` | NEW. Manual, one job, `contents: read`, no secrets, artifacts `if: always()` |
| `fixtures/r1/steps.json` | `focus_retries`/`focus_delay_ms` → `focus_wait_ms` 10000 / `focus_poll_ms` 250. Steps unchanged |
| `fixtures/r1/lock.json` | Re-locked (9 hashes, D-33/D-34/D-36); old lock kept under `supersedes` |
| `test/speech.test.mjs` | New A4/cleanup/evidence/guard/workflow tests; tmp-dir cleanup and a `docs/evidence/` unchanged check. Replaced as spec changes (D-36): the two A2 tests and the `focus_retries` fixture assertion |
| `AGENTS.md` | Security line: NVDA only in the workflow; no repo edits during a run; nothing under `docs/evidence/` deleted |

## Questions for the review
1. **Runner:** Can any path send a key without a passing foreground check immediately before it? Covered: `nvda.perform` (NVDA+T), `nvda.press`, `nvda.type`. Guidepup 0.36.4 `start()`/`stop()` send no keys (NVDA.js:235-305 spawns `nvda --quit`); `press`/`perform` go through the NVDA controller, `type` through `sendKeys`; both reach the foreground window.
2. **Foreground check:** Is pid equality with `server.process().pid` (Playwright `launchServer`) the right owner test for Chromium's top-level window on Windows? INFERENCE: yes; if wrong, every check fails and no key is sent. Is the PowerShell helper read-only? Is "a probe timeout ends the probe" correct? A late reply could otherwise answer the next check with a stale window.
3. **Residual window (accepted?):** between the check and the key there is a short gap; Guidepup's `press` also sends stopSpeech (Control) first. The guard narrows the I-01 risk but does not close this gap.
4. **Cleanup:** Can one failure (raw log, evidence write, browser close, kill, `nvda.stop`) skip another? Is the first error always the one reported? Check the SIGINT path (`installAbort`) and the crash handlers in `r1.mjs`.
5. **Evidence:** Does any write still throw? Is "deleted folder → recreated, flagged, not PASS" the right handling?
6. **Run guard:** Any way to start R1 off a GitHub-hosted Windows runner? Are the `git status` filter (own evidence dir only) and HEAD == `GITHUB_SHA` right? Can the CI steps before R1 (npm ci, Guidepup setup, playwright install, npm test) dirty the tree and block the run?
7. **Workflow:** triggers, permissions, concurrency (one job; `cancel-in-progress: false`), timeouts (job 45 min, R1 step 30 min), `npm ci --ignore-scripts`, no secrets, upload `if: always()`. Should actions be pinned to full commit SHAs instead of `@v7`? The SHAs were not checked.
8. **Tests:** Do the tests check the behaviour, or only the shape? Is any replaced test weaker than the rule it replaced?

## Calls Claude made (not chosen by the user; flag any you disagree with)
- Interference after an attempt stops the run (FAIL, no rerun), instead of carrying on.
- Deleted or unwritable evidence rules out PASS.
- `focus-lost` stops the run, with no further attempts and no rerun.
- `bringToFront` was removed: D-36 chose the read-only check over "raising our window".
- Wait 10 s, poll every 250 ms. A probe check is bounded by `action_timeout_ms` (8 s).
- R1 refuses to start if the probe warm-up fails.
- `windows-2025` (Guidepup's own NVDA CI uses windows-2022 and windows-2025).
- The workflow copies `%TEMP%\nvda.log` into the artifact, and artifacts are kept 30 days.

## Known limits (do not claim otherwise)
- No real run of the new code under NVDA. The only live check was the probe on the host: one read of the front window's pid and title, with no keys (MEASURED 2026-10-27, the title was not recorded).
- "Evidence uploaded even when interrupted" holds for failure and cancellation (`if: always()`). It does not hold if the runner VM itself dies.
- `workflow_dispatch` only appears once the file is on the default branch (GitHub docs). The user pushes; Claude does not.

## How to report
For each question, give: finding, severity (blocker / should-fix / note), file:line, suggested fix. Then a verdict: approve, or approve after fixes. Then save it as `docs/reviews/R1-D36-review-codex.md`.
