# Codex re-review brief: R1 send guard and fixes to the D-36 review (D-37)

Written 2026-10-27 by claude for a targeted, independent Codex re-review (D-37, D-38). The user gives this brief to Codex. Status: **review not started**.
Codex: report findings only, in `docs/reviews/R1-D37-review-codex.md`. Do not run `npm run r1`, start NVDA or Guidepup's NVDA, trigger any workflow, call the Meta API, commit or push.
Safe to run: `npm test` (fakes plus the installed Guidepup modules with a fake socket and a fake VBS runner; writes only to `os.tmpdir()`), `node scripts/r1.mjs --hashes` (prints, starts nothing), read-only git. Mutation tests: in a copy outside the repo only.

## Context (read first)
- Your D-36 review: `docs/reviews/R1-D36-review-codex.md` (BLOCK: B-01, B-02, M-01..M-08, S-01..S-05, N-01, N-02).
- The user's conditions: `docs/ledger/DECISIONS.md` D-37 (verbatim). Approval depends on them; this review checks them.
- Spec: `docs/ledger/PLAN.md` § F-02, "Amendments (D-37)": A5, A6, S7, S8, S9 and the S6 additions, between the spec markers. Claude wrote this wording; check that it matches D-37 and the code.

## The diff
Nothing from D-36 or D-37 is committed, so `git diff HEAD` contains both. You reviewed the D-36 state; D-37 is everything that differs from it.
- Tracked changes: `git diff HEAD -- AGENTS.md docs fixtures scripts src test` (12 files).
- New files: `git ls-files --others --exclude-standard` (`.github/workflows/r1.yml`, `src/speech/{foreground,runguard,sendguard}.mjs`, `test/sendguard.test.mjs`, `docs/ledger/INCIDENTS.md`, `docs/reviews/*`).

| File | D-37 change |
|---|---|
| `src/speech/sendguard.mjs` | NEW. `sendGuard()`: one send at a time; bounded check right before and (after 50 ms) right after each physical send; sticky stop; `orphans` counts sends that outlived their bound. `installSendGuard()`: patches `NVDAClient.prototype.sendKeyCode` and the `runVbsScript` export through `require`, before Guidepup is imported; `verify()` checks the hooks and that one cached copy exists |
| `test/sendguard.test.mjs` | NEW. Guard unit tests; the real installed `NVDAClient` (fake socket) and `sendKeys` (fake VBS runner); call-site inventory of `lib/windows`; dependency hash pin |
| `src/speech/capture.mjs` | Guard armed per key action; `guardStatus()`; the evidence journal and `verify()`; `writeSummary()`/`persisted`; `watch()` before every step; late `nvda.start`/page open handled; abort writes the summary before cleanup; `diag` to the CI log; summary reasons and `send_guard` fields |
| `src/speech/runguard.mjs` | `workflowGuardErrors()` and `APPROVED`; `repoSnapshot` without the evidence-folder exclusion |
| `scripts/r1.mjs` | Order: CI guard, win32, file lock, dependency lock, `RUNNER_TEMP`, clean check, workflow guard, probe warm-up, `installSendGuard`, Guidepup import, `hooks.verify()`. Evidence in `%RUNNER_TEMP%/r1-evidence/<run_id>/`. Exit 0 only on a persisted PASS |
| `.github/workflows/r1.yml` | Gated CI config. Actions pinned to commit SHAs; job `if:` dispatch on `refs/heads/main`; tracked files and Guidepup `lib/` set read-only after installs; `_runner/job.json` diagnostic; upload `${{ runner.temp }}/r1-evidence/`, `if-no-files-found: error` |
| `fixtures/r1/lock.json` | Re-locked 09:53:57Z: 10 files (adds `sendguard.mjs`) and 7 Guidepup raw hashes; the earlier locks nested under `supersedes` |
| `test/speech.test.mjs` | New D-37 runner, summary, evidence, abort, cleanup, workflow and run-guard tests. Spec changes to existing tests (please judge whether any is weaker): the upload-path assertion `docs/evidence/r1/` → `runner.temp/r1-evidence/` (S-04); the workflow assertions moved, unchanged, into `assertR1Workflow` and run on LF and CRLF (S-03); the `docs/evidence` listing now uses `fileURLToPath`, root existence and content hashes (M-08) |
| `docs/ledger/PLAN.md` | D-37 amendments inside the F-02 markers. The gates section (lines 7–37) is unchanged |
| Ledgers | DECISIONS D-38, LOG.jsonl, CODEMAP, PROVENANCE (pinned SHAs, MIT at each SHA), STATE |

## Claude's measurements (2026-10-27, host; please reproduce)
- `node --test test/speech.test.mjs test/sendguard.test.mjs` → 100 pass, 0 fail.
- `npm test` → 116 pass, 0 fail (before and after the re-lock).
- `git status --porcelain --untracked-files=all --ignored` identical before and after `npm test`; `docs/evidence/` absent before and after.
- `node scripts/r1.mjs --hashes` → 0 file and 0 dependency mismatches against `fixtures/r1/lock.json`.
- Gates hash (PLAN "## Pre-registered Day-1 tests" to "## Day plan", CRLF → LF): `ca0c9feb568e7c9c4ea41832607f510af0cbf5548242adcd77f729e039af3362`, unchanged.
- Mutation runs on a scratch copy (earlier in the session, before the last runner edits): no post-check 2 failing tests; checks always pass 8; cleanup errors ignored 2; evidence check ignored 2; no summary before cleanup 2; attached stop removed 2; no disarm 2; watch ignored 4; baseline 0.

## Questions (D-37 conditions first)
1. **Complete interception (D-37: "Prove the wrappers intercept the actual Guidepup 0.36.4 internal send paths, including stopSpeech Control sends, individual character sends and NVDA commands").** Is there any path in the installed `@guidepup/guidepup@0.36.4` `lib/windows/` that reaches the NVDA socket `.write` or a SendKeys/VBS/process call without passing one of the two hooks? Check the inventory test's patterns against the source yourself, not only the test. Can ESM and CJS copies diverge? Can Guidepup or Playwright send input any other way during a run (e.g. Playwright `page.keyboard`, which the runner should never call)?
2. **Installed package, not mocks.** Do the `real NVDAClient` / `real sendKeys` tests exercise the installed files with only the socket and VBS runner faked? Is anything in between mocked that hides a real path?
3. **Fail closed.** On a failed, thrown, missing, timed-out or stale check, or a missing hook, are zero keys sent and the run aborted? Can a late "ok" release a key? Can a send outside an armed action (the unawaited stopSpeech loop) get through?
4. **Before and after each physical send.** Is the check really immediately before and after each `write` / SendKeys, one send at a time, with PID and nonce? Is 50 ms settle and 2 000 ms bound reasonable? Is "post-check mismatch → possibly misdelivered → focus-lost, FAIL, no rerun" applied on every path?
5. **Dependency pin.** Do the 7 pinned files cover everything the guard relies on? Does `r1.mjs` refuse on a mismatch or an empty list before Guidepup loads?
6. **Your D-36 findings.** For each of B-01, B-02, M-01..M-08, S-01..S-05, N-02: fixed, partly fixed, or not fixed, with the evidence.
7. **Workflow (gated CI config).** Pins, `if:`, read-only step position (could it break `npm test` or R1?), the diagnostic step and the upload. Does `if-no-files-found: error` behave as intended when R1 refuses early (the `_runner/` folder is always written)?
8. **Negative tests, demonstrated (D-37: "demonstrate negative tests before approval").** In a copy outside the repo, run at least: a hook removed after install; `sendKeyCode` replaced by an unguarded copy; a pre-check that always passes; a post-check that always passes; a dependency hash changed; evidence tampered mid-run; an `r1.mjs` order change (Guidepup imported before `installSendGuard`). Report which tests fail for each; a mutation that no test catches is a finding.

## Calls Claude made (not chosen by the user; flag any you disagree with)
- `checkMs` 2 000 and `settleMs` 50.
- A send still running at cleanup leaves the browser open (no close or kill); NVDA is still stopped.
- A crash is FAIL (not PARTIAL); any guard stop rules out PASS.
- Read-only attributes are described as a speed bump, not a lock.
- 30-day artifact retention kept; the user downloads before expiry to keep evidence until R7.
- The upload path change, the S-03 move into `assertR1Workflow` and the M-08 listing are recorded as spec changes, not test weakening.
- The PLAN D-37 amendment text is Claude's wording.

## Known limits (do not claim otherwise)
- Each check brackets one physical send (a whole chord for a key combination), not each key-down.
- A native gap remains between the foreground read and the OS delivering the key; D-37 accepts it with recheck, only on the disposable VM.
- `quit` uses `spawnSync` and can block for up to 30 s.
- An edit restored between two repository checks is not detected.
- NVDA-class `press`, `type` and `perform` were not run end to end with real NVDA; only the installed client and `sendKeys` with fakes.
- The workflow-identity checks guard against accidental use; they do not attest the machine.
- `nvda.log` is uploaded as is, not sanitised.
- The newer runner tests were written after the runner code; the mutation runs above are the evidence that they catch regressions.
