# STATE — R1 #2 offline-test failure, test hardening and Windows preflight (D-50)

Updated: 2026-10-28T07:03:31Z · by: claude

- Now: D-50 hardens the async tests that failed R1 #2 and adds a test-only Windows preflight workflow (`offline-preflight`).
- R1 #2 (workflow 40637055592 at 9151992): offline tests 204/205 (T1 "release is not a function" + a late R1_REFUSED rejection); the R1 step was skipped. Not a scored attempt, no RUNS row; R1 #1 stays FAIL/setup-failed.
- Root cause: tests waited a fixed sleep for a point the code under test reaches later on a slow runner, and left promises unhandled. Reproduced locally with injected fs delay and event-loop stalls.
- Change: test code only (vendor, sendguard, speech, engineering tests) plus `test/helpers/faults.mjs`, `scripts/preflight.mjs`, `.github/workflows/preflight.yml`. No assertion removed or weakened; new assertions listed in D-50.
- Unchanged: `src/`, `scripts/r1.mjs`, `r1.yml`, fixtures, `vendor/`, lock (no re-lock), Day-1 gates ca0c9feb…3362, A14, foreground checks, steps, expected speech, 3/3, thresholds.
- Tests: stress matrix 90 runs before review fixes (4 failed runs: A4 and D43 windows, both fixed); then 69 runs in read-only CRLF and LF clones (repeated, random order, parallel, fs delay, stalls up to 120 ms), 0 failures, 0 late activity; the workflow's profile step simulated locally, all passed. Local Windows 11 only: not full parity with windows-2025.
- Mutants: 7 detected (one only by the test timeout), 1 equivalent excluded.
- Review: separate read-only Claude agent (same vendor): REQUEST CHANGES (T20 nearly vacuous, A4 flaky under stalls); both fixed and re-checked.
- Next: user commits and pushes to a review branch, opens a PR to main and checks the `offline-preflight` run. A second R1 run needs the user's separate approval after that.
- No NVDA, desktop input, Actions dispatch, R1 run, Meta calls, installs, commits or pushes in this work.

## Handoff
Uncommitted: docs/CODEMAP.md, docs/ledger/{DECISIONS.md,LOG.jsonl,STATE.md}
Uncommitted: test/{vendor,sendguard,speech,engineering}.test.mjs
Uncommitted (new): test/helpers/faults.mjs, scripts/preflight.mjs, .github/workflows/preflight.yml
Publication: review branch + PR for this change (D-50 overrides D-44 once). R1 rerun not approved.
