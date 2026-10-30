# R2 — post-finalization gate stop correction

Status: **offline engineering correction, locally verified 2026-10-30; committed as `a3a9ad4`, merged by PR #6 into `review/tabwise-m2b-m2c` (`46749e0`) and by PR #3 into `main` (`78cf379`)**. Not an R2 qualification PASS, and not a physical-send or NVDA attestation. R2 qualification and the full worker remain BLOCKED. See "Post-merge status" at the end.

_Status corrected 2026-10-30T07:50:13Z (R2-L0 post-merge reconciliation). It previously read "uncommitted for independent review". The results below are unchanged._

Baseline: `ef3b8eda9797029e95be0626771112fbe0144ecd` on `fix/tabwise-r2-post-final-stop` (M2E merge into `review/tabwise-m2b-m2c`). At handoff time nothing was committed, pushed or merged. This changed later; see "Post-merge status".

## Defect (HIGH, from independent review)

In receipt mode, an owned gate stopped by an external party *after* `receipts.finish()` had finalized a complete receipt could still produce `completed:true`. Reported reproduction: receipt finalized at 60 ms, external stop at 100 ms, capture returned `observed-silence`. A second probe added speech after the cancellation; the capture attributed it and `speechModelPayload()` admitted it.

## Root cause

- `src/r2/capture.mjs` consulted the gate only through the ledger. `finish()` checks `s.stopped` once, at finalization. After that, the post-receipt observation loop, the action completion, the final journey boundary and the completion decision read speech and page only. A later stop does not change any ledger receipt (`read().complete` stays true), so nothing in the capture could see it.
- `src/r2/binding.mjs` called `guard.isStopped()` only when `completed !== true`, to stop the gate itself. A completed capture with a stopped gate was returned unchanged.
- `src/r2/send-receipt.mjs` exposed no read-only view of its owned gate to the capture. The capture deliberately has no gate access.

## Change

| File | Change |
|---|---|
| `src/r2/send-receipt.mjs` | `ledger.gateState()`: a read-only, synchronous snapshot of the ledger's **own** closure-held gate: `{registered: getGate()===gate, valid, stopped: status().stopped \|\| isStopped(), kind, reason, misdelivered}`. Unreadable or malformed state returns `valid:false`. It never stops, refuses, records or accepts an external status object. Receipt identity (`isSendReceiptLedger`, frozen ledger) is unchanged. |
| `src/r2/capture.mjs` | `gateLive(state)` (registered, valid and not stopped). `gateStop(where)` is called synchronously right after every speech and page read returns while a receipt is finalized (from a complete `finish()` until the next `begin()`), at each action completion, and once more immediately before `completed=true`, with no `await` in between. On a stop: status `failed`, `INSUFFICIENT_EVIDENCE`, `result.gate_stop = {where, registered, valid, kind, reason, misdelivered}`. Delta speech and page events from that read go to `unattributed` / `unattributed_page` with `invalidated_by:'gate-stop'`, never to `raw_seq`/`text`/`page.events`. `invalidateForGateStop()` demotes the last record's `speech`/`observed-silence` to `failed` and moves its prior status and silence claim to `record.invalidated` (diagnostics only). |
| `src/r2/binding.mjs` | Return boundary: if `completed===true` but `receipts.gateState()` is not live, call `invalidateForGateStop(result, 'binding return boundary', state)`. The existing M2C stop then does nothing, because the gate is already stopped and its original kind and reason are kept. `speechModelPayload()` refuses any capture with `gate_stop` or a record with `invalidated`, and now also any record whose `capture_status` is not `speech` or `observed-silence`. |

The original stop is copied, never rewritten. The ledger never calls `gate.stop` from `gateState()`, and the binding's M2C stop runs only on an unstopped gate. No `ack` kind is set, so no misdelivery is implied. M1 (no receipts) is untouched: `gateStop` returns `null` without a ledger. Timing (M2A–M2E), `ACK_MS`, `RECEIPT_SETTLE_MS`, release-relative acknowledgement and silence windows, and synthetic/UNATTESTED provenance are unchanged.

## Regression tests

The tests are appended to the already admitted `test/r2-capture-receipts-failclosed.test.mjs`, so the offline runner's classified inventory stays at 47 selected / 9 excluded and `ci/offline-tests.json` is not edited. No existing test was modified; the only edit to an existing line is the import adding `speechModelPayload`.

Current tests (after the regression-quality correction, see below):

| # | Test | Baseline result (lifecycle fixtures) | Classification |
|---|---|---|---|
| 1 | External stop at 100 ms after finalization, inside the 200 ms window | FAIL: `completed:true` | genuine RED, unsafe completed evidence |
| 2 | Stop plus new speech in the first read after it | FAIL: `completed:true` | genuine RED |
| 3 | Stop and new speech inside the same post-receipt speech read | FAIL: `completed:true` | genuine RED |
| 4 | Stop during the final speech boundary read | stop fired at the intended phase, then FAIL: `completed:true` | genuine RED |
| 5 | Stop during the final page boundary read | stop fired at the intended phase, then FAIL: `completed:true` | genuine RED |
| 7 | Two actions, stop between them (inside a02's first pre-action speech read) | stop fired at the intended phase; PASS | control: pre-existing correct behavior |
| 8 | Successful two-action capture with no stop (speech plus silence, payload built) | PASS | control |
| 9 | Payload refuses an invalidated capture even with a forged `completed:true`, with or without `gate_stop` | FAIL: payload accepted | genuine RED (payload-side; baseline has no invalidation markers) |
| 10 | M1 path unchanged (executor-request anchor, no `gate_stop`, gate not stopped) | PASS | control |

Test 6 (stop visible only at the binding return boundary) was **removed** as a regression test; see below. The original stop kind, reason and `misdelivered:false` are asserted in tests 1–5, 7 and 9.

### Regression-quality correction (independent Codex review, CONDITIONAL: MEDIUM + LOW)

The first version of tests 4–7 found their boundaries by matching `gateState` in a stack trace inside `receiptBindings.getGate` and counting calls. Baseline has no `gateState()`, so on baseline their stop **never fired**. Their baseline failures showed a missing hook, not the defect.

Tests 4, 5 and 7 now fire their stop from observable provider and executor lifecycle only:
- `env.releases`: the fake-clock time at which the test's **own** R1 ack reader was entered for each action. This is the gate-release reader entry, and the ledger stamps `released_at` in the same synchronous turn.
- `env.prev`: the previous provider event the test saw (`speech`, `page`, or `wait` for a fake-clock wait).
- `afterWindow(env, k)`: a speech read that directly follows a page read, with no clock wait between, after action k's `release + observationMs` has passed on the fake clock. That is the first read after action k's observation loop ended. For the last action it is the final boundary speech read. Otherwise it is the next action's first pre-action read. Test 5 stops in the page read immediately after that speech read.
- No production function name, stack trace, read or call count, or real elapsed time is used.

Each test asserts, before the outcome assertions, that:
- the stop fired exactly once at the named phase;
- it fired after the intended send and before any later send;
- it fired after the receipt's `finished_at` and after `observation_window.to`.

Test 7 is now labelled as a control. Its reason assertion is `/a02: [^;]*gate stopped/`. That matches the baseline reason (`a02: receipt: gate stopped, busy or send counter changed outside action`) and the corrected one (`a02: speech read: owned gate stopped after receipt finalization`), so it no longer claims to show a new fix.

**Test 6 disposition.** No provider, executor or clock callback runs between `captureJourney`'s last synchronous check and the binding's check. The only ways to place a stop there are a call inside those checks (implementation-coupled) or microtask depth (implementation-coupled). So the scenario is not reproducible from observable boundaries, and no passing regression was invented for it. The binding return check stays in production as defense in depth.

The evidence for it is a separate scratch probe, not a test: `cache/r2-post-final-stop/scratch-binding-boundary.txt`, three runs on corrected code. Each run showed `fired:true`, `completed:false`, `where:"binding return boundary"`, prior `observed-silence`, and the original reason kept. The probe is implementation-coupled by construction and has no baseline counterpart. Two earlier probe runs failed because of probe wiring bugs, and their logs are kept (`scratch-binding-boundary-probe-bug*.txt`).

### Historical RED classification (first version, `cache/r2-post-final-stop/red-baseline.txt`, preserved)

The first baseline run of the 22-test file gave 14 pass and 8 fail (all 8 new tests). Not every failure reproduced the vulnerability:

| First-version test | Baseline failure | Classification |
|---|---|---|
| 1, 2, 3 | `completed:true` after a post-finalization stop | genuine: unsafe completed evidence |
| 9 | forged invalidated capture accepted by the payload | genuine: payload-side gap |
| 4 (final speech), 5 (final page) | stop never fired (no `gateState` on baseline); capture completed normally | cancellation never fired. The defect itself was shown separately by the count-based scratch probe below and now by the lifecycle tests |
| 6 (binding return) | stop never fired | cancellation never fired; no baseline counterpart (baseline has no return check) |
| 7 (between actions) | stop never fired | cancellation never fired. When the stop does fire, baseline already refuses: pre-existing correct behavior |
| 8, 10 | passed | controls |

The count-based scratch probe (`red-baseline-countbased.txt`, three identical runs) measured on baseline:
- A stop inside the final speech read (#25) or the final page read (#24) returned `completed=true` and `observed-silence`.
- A stop between actions was refused with `a02: receipt: gate stopped, busy or send counter changed outside action`.

Count-based triggers were not used as tests because counts vary between runs (60 vs 56 `getGate` calls).

## Verification (MEASURED, Windows, Node 24.22.1, uncommitted tree on `ef3b8ed`)

| Check | Result | Exit |
|---|---|---|
| Fail-closed file on baseline sources (scratch copy, `git show HEAD:` for the 3 sources) | 22 tests: 14 pass, 8 fail (all 8 are new tests) | 1 |
| Same file, corrected sources | 22/22 | 0 |
| Focused: `r2-capture-receipts` + `r2-capture-receipts-failclosed` | 72/72 | 0 |
| `r2-send-receipt.test.mjs` | 41/41 | 0 |
| `node --test test/r2*.test.mjs` | 244/244 (M2E: 234 + 10) | 0 |
| `check-r1-baseline.mjs` | `ok:true`, revision `0c93fa7…`, no errors | 0 |
| `preflight.mjs` | `ok:true`, 6/6 checks, head `ef3b8ed` | 0 |
| `git diff --check` | clean | 0 |
| Offline ordinary (`cache/r2-post-final-stop/ordinary`) | PARTIAL SUITE 47 selected / 9 excluded; 47/47 PASS, 519/519 tests | 0 |
| Offline stress, 8 profiles (`cache/r2-post-final-stop/stress`, seed 172785) | repeat-1, repeat-2, serial, random-172785, slow-fs-30, slow-fs-100, stall-40, mixed: each 47/47 files PASS, 519/519 tests, first run, no rerun | 0 |

The table above is the first-version run (22 tests in the fail-closed file, 244 in R2), kept as historical evidence.

### After the regression-quality correction (MEASURED, 2026-10-30T06:09Z–06:23:39Z, same tree plus the fixture change; production code unchanged)

| Check | Result | Exit |
|---|---|---|
| Fail-closed file on baseline sources (`red-baseline-lifecycle.txt`) | 21 tests: 15 pass, 6 fail (tests 1–5, 9). Tests 4 and 5 pass their phase assertions, then fail on `completed:true`. Control 7 passes with the stop fired | 1 |
| Same, ×5 (`red-baseline-lifecycle-repeat.txt`) | identical 15/6 each, control passes each time | 1 |
| Fail-closed file, corrected sources, ×20 separate processes (`green-repeat.txt`) | 21/21 every run | 0 |
| Scratch binding-boundary probe, ×3 (`scratch-binding-boundary.txt`) | fired, `completed:false`, `binding return boundary` each run | 0 |
| Focused receipt suites (`final/focused.txt`) | 71/71 | 0 |
| `r2-send-receipt.test.mjs` | 41/41 | 0 |
| `node --test test/r2*.test.mjs` | 243/243 (244 minus removed test 6) | 0 |
| `check-r1-baseline.mjs` | `ok:true`, revision `0c93fa7…` | 0 |
| `preflight.mjs` | `ok:true` | 0 |
| `git diff --check` | clean | 0 |
| Offline ordinary (`final/ordinary`) | PARTIAL SUITE 47 selected / 9 excluded; 47/47, 518/518 | 0 |
| Offline stress, 8 profiles (`final/stress`, seed 172785) | repeat-1, repeat-2, serial, random-172785, slow-fs-30, slow-fs-100, stall-40, mixed: each 47/47, 518/518, single run | 0 |

Logs: `cache/r2-post-final-stop/` (`red-baseline.txt`, `green-failclosed.txt`, `focused.txt`, `send-receipt.txt`, `r2-all.txt`, `r1.txt`, `preflight.txt`, `ordinary*`, `stress*`).

## Remaining limits

- **Synchronous check, not a lock.** The final check and `completed=true` run with no `await` between them, and the binding check and its `return` are also synchronous, so no JavaScript code can interleave there. A stop after the binding returns is outside the capture's claim: the capture is a snapshot, and any consumer acting later must check the gate again itself. Nothing here holds or freezes the gate.
- `gateState()` reports the gate's own self-description (`status()`/`isStopped()`) on an injected, synthetic gate. It does not attest physical delivery, quiescence or the absence of a stop at the OS level.
- Records completed while the gate was live before a later stop (a01 in test 7) keep their status. The capture as a whole is still `INSUFFICIENT_EVIDENCE` and not model-eligible. At the final boundary, only the last record is demoted.
- A direct `captureJourney({receipts})` caller gets the in-capture checks but not the binding return check (unchanged M2C limitation).
- `speechModelPayload()` checks capture data, not live gate state. A fully forged capture object without the invalidation markers and with success statuses is not detectable from data alone. This predates the correction.
- After an in-action stop, recovery reads add `recovery: … owned gate stopped …` reasons. This is diagnostic noise, not a second failure.
- Boundary tests 4, 5 and 7 depend on the observable provider order of the capture loop: the loop's last read is followed directly by the next speech read, with no clock wait. A deliberate change to that read sequence would need the fixture updated, and the phase assertions would fail loudly rather than pass silently.
- The binding return check has no regression test (see Test 6 disposition), only the scratch probe.
- The M1 path still has no post-execution gate revalidation (M2C limitation, deliberately unchanged).

## Independent review required

Review the three source hunks and the ten appended tests. Re-run the commands above on a clean checkout. Commit and publication remain owner-controlled.

## Post-merge status (R2-L0, appended 2026-10-30T07:50:13Z)

| Item | State | Basis |
|---|---|---|
| Commit | `a3a9ad48257b9cd218c8b6a2dab522eb39db4595` `fix(r2): reject gate stops after receipt finalization` | MEASURED: `git log` |
| PR #6 | merged into `review/tabwise-m2b-m2c` as `46749e037d4720e0083edb79f4dbdbce5ba477ad` | MEASURED: merge commit in `git log` |
| PR #3 | merged into `main` as `78cf37953702998dc87a9eb61cae6e7c64ec339f`; tree `2af46092d6a4a796be82c0e55450b8f31944a605`, the same as `46749e0` | MEASURED: `git rev-parse <commit>^{tree}` |
| Independent D-79/D-80 review | PASS | owner-reported; not re-checked here |
| Combined hosted offline preflight | PASS, run `41016516810`, before the PR #3 merge | owner-reported; run head SHA not re-checked here |
| Post-merge `main` CI | none recorded | no run is claimed |

The verification tables above are still the last local results: R2 243/243, and ordinary plus eight stress profiles at 518/518 each. They were measured on the uncommitted tree before `a3a9ad4`. R2-L0 did not re-run them. The "Remaining limits" section still applies unchanged. The "Independent review required" section is satisfied by the owner-reported review PASS. Commit and publication happened under owner control.
