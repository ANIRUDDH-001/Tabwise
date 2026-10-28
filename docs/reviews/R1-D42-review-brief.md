# Codex review brief: R1 D-39 exception fixes (D-42)

Written 2026-10-27 by claude for the one focused Codex re-review that D-42 requires. The user gives this brief to Codex. Status: **review not started**.
Codex: report findings only, in `docs/reviews/R1-D42-review-codex.md`. Do not run `npm run r1`, start NVDA or any vendored `NVDA.start()`, trigger any workflow, call the Meta API, commit or push. NVDA is installed on this laptop (`%LOCALAPPDATA%\guidepup`).
Safe to run: `npm test` (T0 sandbox, `test/helpers/sandbox.mjs`; writes only to `os.tmpdir()`), `node scripts/r1.mjs --hashes` (prints, starts nothing), read-only git. Mutations go in a copy outside the repo only (layout as in `R1-D39-review-brief.md` "Mutations").

**Scope (D-42):** review the actual final diff for all five fixes (D39-B01, M01, S01, S02, S03), not just a rerun of P04/P05/X04. Your D-39 verdict (BLOCK) stays on record unchanged in `R1-D39-review-codex.md`.
**Stop rule (D-42, user's words):** "This is the final permitted correction cycle. If Codex identifies another material safety or false-PASS blocker, stop custom R1 development and present reduced-scope alternatives." Please say plainly whether any finding is such a blocker.

## Context
- Your D-39 review: `docs/reviews/R1-D39-review-codex.md` (BLOCK: B01; M01; S01–S03).
- The user's words: `docs/ledger/DECISIONS.md` D-42. The rule text is in `docs/ledger/PLAN.md` § F-02, A12 (inside the spec markers; the gates section is untouched).

## The diff
`docs/reviews/R1-D42-diff.patch` (`diff -u`, CR stripped) holds exactly the D-42 change to the four source files and two test files. Its "a/" side was rebuilt by reversing the D-42 edits, and each rebuilt source file's SHA-256 (CRLF → LF) equals the superseded lock entry (`fixtures/r1/lock.json` `supersedes.sha256`, locked 14:21:16Z): 4/4 matched (MEASURED). Please check this independently (for example, hash the patch's "a/" side yourself), or diff against your own D-39 review copy.

| Fix | Files | Change |
|---|---|---|
| B01 | `src/speech/sendguard.mjs` | `pageAck`: the Control-delimited `windowOf` is gone. New `ack.before(token)`: reads the log since the cursor; any non-modifier key gives `page key "X" before send N`, otherwise the cursor moves to the end. `ack(token)`: polls from the cursor until a non-modifier key appears (or `ackMs`); every event read is judged, so the expected key must be the only non-modifier key, exactly once. The cursor advances only on success. `sendGate.admit`: `ackFn.before` runs bounded (`ackMs + 200`) in parallel with the foreground pre-check, before `token.at` is set. A non-empty result → `st.misdelivered = true`, refuse kind `ack`. |
| B01 | `src/speech/capture.mjs` | The runner's ack reader exposes `reader.before = (tok) => ack.before(tok)`. |
| M01 | `src/speech/capture.mjs` | `installTeardown`: a later entry with status `crashed` is pushed to `crashes` and the summary is rewritten at once (unless already exited). `code()`: aborted stays 130; finished with crashes → 1. `buildSummary({crashes})`: reason `runner crashed during teardown: <reason>`, result FAIL. |
| S01 | `src/speech/capture.mjs` | `writeSummary`: when the summary is not on disk, it is rebuilt with `build(found)`, so `evidence.write_errors` includes the `summary.json` error. Then `summary not stable` (if a third round happened) and `summary.json not persisted`, FAIL. |
| S02 | `src/speech/vendortree.mjs`, `scripts/r1.mjs` | `UPSTREAM_PINS` (7 frozen paths) and `pinErrors(lockDeps, actual)`: missing, non-sha256, differing or extra entries; `{}`/undefined → 7 errors. `r1.mjs` refuses on `pinErrors(lock.dependencies, deps)`; `depHashes()` hashes `UPSTREAM_PINS`, not the lock's keys. |
| S03 | `docs/ledger/RUNS.md` | NEW, empty append-only register (run id, workflow run id, commit, approving decision, result). CODEMAP row added. |
| Lock | `fixtures/r1/lock.json` | Re-locked 2026-10-27T15:47:38Z, decisions + D-42. Changed entries: `PLAN.md#F-02`, `capture.mjs`, `sendguard.mjs`, `vendortree.mjs`, `scripts/r1.mjs`. `dependencies` (7) and `vendor_tree` are unchanged, and the vendored tree was not touched. The 14:21:16Z lock is under `supersedes`. |
| Ledgers | DECISIONS D-42, PLAN A12, CODEMAP, PROVENANCE row, LOG, STATE | Records only. |

## Tests written first (red before the fix, MEASURED)
Against the unchanged code, `node --test test/sendguard.test.mjs test/speech.test.mjs` gave: tests 124, pass 115, fail 9. All 9 new tests failed for the intended reason. The 10th (the residual) passed, as designed.

| Test | Source |
|---|---|
| `sendguard` 'D39-B01 P04 pageAck: a key after a Control in the same window fails that ack…' | P04 |
| `sendguard` 'D39-B01 P04 gate: the same trace through sendGate -> misdelivered at the Tab ack…' | P04 |
| `sendguard` 'D39-B01 pre-send check: a non-modifier key already on the page -> refused before dispatch…' | requirement 2 |
| `sendguard` 'D39-B01 residual (disclosed, D-42): an identical stray…' | requirement 3 (documents the limit) |
| `speech` 'D39-B01 runner (P04)…', 'D39-B01 runner: a stray A between sends…' | P04 through `runR1` |
| `speech` 'D39-M01 P05: a crash during a signal teardown…', 'D39-M01: a crash during the completion teardown of a PASS run…' | P05 |
| `speech` 'D39-S01 P06: a summary-only write error…' | P06 / S01 |
| `speech` 'D39-S02 X04: the lock pins exactly the upstream files…' | X04 |

Rig change (`test/speech.test.mjs` `gatedNvda`): `extra` may be a list, and a new `after(toPage)` hook runs after a key is released. Existing callers are unaffected.

## Changed tests (old → new; spec change from B01, disclose)
| Test | Old | New | Why |
|---|---|---|---|
| `sendguard` 'pageAck.final: a non-modifier key after the last acknowledged one is reported' | log `[Tab, Control, q]`, Tab ack true, `final()` reports q | log `[Tab, Control]`, Tab ack true; then q is appended, and `final()` reports q | Under the old rule, q after a Control was outside the Tab's window. Now it fails that ack (exactly P04). What `final()` checks is unchanged. |
| `speech` 'T26 runner (D-40)…' leaky case | phys `['stopSpeech','NVDA-T','stopSpeech','Tab']`, FAIL `ack` | phys `['stopSpeech','NVDA-T']`, FAIL `ack`, misdelivered | The leaked `t` is now caught by the pre-send check of the next send, so the stop-speech Control and the Tab are never sent. This is stricter. |

No other test was edited or deleted; no threshold changed.

## Claude's measurements (2026-10-27, host; please reproduce)
- `npm test` → tests 166, pass 166, fail 0 (156 before D-42, plus 10 new).
- `node scripts/r1.mjs --hashes` vs `fixtures/r1/lock.json` → 0 mismatches (11 files, 7 dependencies, `vendor_tree`).
- Gates hash: `ca0c9feb568e7c9c4ea41832607f510af0cbf5548242adcd77f729e039af3362`, unchanged (checked before and after the A12 edit, and after the re-lock).
- Mutations: see below.

## Mutations (scratch copy outside the repo)
Script: the D-39 `mutate.mjs` (mutations 1–12) plus 10 D-42 mutations, each run as `node --test test/*.test.mjs` in a fresh copy (scratchpad `mut/app`, same layout as D-39). Baseline was 166/166, and after restoring 166/166 (MEASURED).

| # | Mutation | Result |
|---|---|---|
| 1–9, 11, 12 | D-39 set (unchanged sites) | caught. Failing tests per mutation: 1–6 and 9: 3 each; 7, 8: 1 each; 11: 2; 12: 13 |
| 10 | skip the page ack | caught, but only with a per-test timeout. In the harness run several teardown tests hang, the 300 s run timeout cut off the totals, and the script logged "SURVIVED (fail NaN)" with 4 failing tests listed. Rerun with `--test-timeout=15000`: tests 166, fail 16, cancelled 6 |
| 13 | restore the Control-delimited ack window | caught: 3 (the P04 unit, gate and runner tests) |
| 14 | gate skips `before()` | caught: 3 (pre-send unit test, T26 leaky case, stray-between-sends runner test) |
| 14b | runner does not wire `reader.before` | caught: 2 (T26 leaky case, stray-between-sends runner test) |
| 14c | `before()` ignores strays | caught: 3 |
| 15 | a later crash is ignored | caught: 2 (both M01 tests) |
| 15b | a later crash is recorded but not written at once | caught: 1 (P05) |
| 16 | drop the S01 rebuild | caught: 1 (P06) |
| 17 | `r1.mjs` back to `lockMismatches` for dependencies | caught: 1 (X04; it is a source-text assertion) |
| 17b | `pinErrors` accepts a missing pin | caught: 1 (X04) |
| 17c | `pinErrors` accepts an extra pin | caught: 1 (X04) |

Not mutated: the `crashes.length` term in `code()`. With a crash recorded, the summary is FAIL, so the code is already 1 without it (an equivalent mutation).

## Disclosures and calls Claude made (flag any you disagree with)
- **Residual (requirement 3):** an identical stray key that lands after the pre-send log read while our own key is lost looks like our key. Example: our Tab is lost and a stray Tab arrives in the window, so the ack is true. The test 'D39-B01 residual' pins this behaviour. Modifier-only strays (Control, Shift, Insert) are ignored by design (A9, T26), so a stray Shift on a Shift+Tab is likewise invisible.
- **Pre-send read timing:** `before()` runs in parallel with the foreground check (both start in `admit` and both finish before `token.at`), so the page-log read can be up to `checkMs` (2 000 ms) older than the commit. A non-modifier key in that gap is still inside the send's window and fails the ack, unless it is the identical-key residual. The alternative was to run it after the foreground check, closer to the send. That would age the foreground check by the read's duration against the 100 ms commit bound.
- **`before` is optional in the gate:** `admit` runs it only when the ack reader has one. The runner always sets it (mutation 14b). Many existing `sendGate` unit tests use plain ack functions, and changing them was outside the D-42 scope. Is that acceptable, or should the gate refuse an ack reader without `before`?
- **A failed pre-send check** is classed `ack` and `misdelivered` (an unexplained key already reached the page). The send itself is refused before dispatch.
- **S02 messages:** `missing from…`, `not a sha256 in…`, `installed file differs from…`, `not expected in…`. An unreadable installed file hashes to null, so it differs.
- Earlier, accepted disclosures stand: D-40 (no recall of launched OS operations), the post-bound process exit kills the browser, and mutations 7 and 8 are caught only by source-text tests.

## Questions
1. Is any finding a material safety or false-PASS blocker (the D-42 stop rule)?
2. Does B01 now meet requirement 2: "an earlier stray key cannot acknowledge a later send. Validate the event log immediately before each send, then confirm the expected new event within that send's acknowledgement window"?
3. Are M01, S01, S02 and S03 fully closed, including paths the new tests do not cover?
4. Is the residual disclosure accurate and complete?

## Isolation
Claude ran only `npm test`, `--hashes`, read-only git, and mutations in a scratch copy outside the repo. `git status --short --ignored` was compared before and after the runs (STATE "Last verification"). Nothing was run against NVDA, Actions or Meta; nothing was committed or pushed.
