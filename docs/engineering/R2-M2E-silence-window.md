# R2 M2E — gate-release-relative silence and observation windows

Status: **offline engineering change, locally verified 2026-10-30 (see Local results); owner review and hosted CI pending**. Not an R2 qualification PASS, not a physical-send or NVDA attestation. Full worker remains BLOCKED.

Baseline: `2754e6b687b0e5735f18324a57ae5cdfb16bab33` on a new isolated `fix/tabwise-r2-m2e` branch. Patch created without editing the baseline repository.

## Problem

Receipt-mode `captureJourney()` previously reported silence from the executor request and ran its configured `observationMs` *after* executor settlement. This misstates the attributable period when release is delayed or the post-send check is slow.

## Proposed M2E contract

- In receipt mode, `observation_window` is measured from the **validated** gate release: `from=released_at`, `to=released_at+observationMs`; both are Node-monotonic clock readings. The field is policy scope, not a physical-send attestation.
- Reported `silence` uses those exact bounds only after an otherwise complete capture, valid receipt, observed page acknowledgement and continued complete speech snapshots through the end of the window.
- The executor's bounded settlement, gate receipt completion and required page checks **must still complete**; the capture may continue collecting diagnostics after the speech window ends, but post-window phrases are ambiguous/unattributed and cannot count as action evidence.
- A phrase seen after the policy end is not backdated using a hypothetical emission time, even if it might have arrived earlier. Such uncertainty fails closed rather than inventing timing precision.
- The 1000 ms gate-release-relative page acknowledgement cap is unchanged. The executor-request timeout is unchanged. `node_window` remains the actual total observation/execution timeline.
- The non-receipt M1 path is unchanged, including its historical `silence` shape and boundaries.
- Synthetic/UNATTESTED and UNVERIFIED classifications remain unchanged. No live NVDA, Chromium, API or physical input is involved.

## Regression coverage

The six additive M2E tests in the existing admitted `test/r2-capture-receipts.test.mjs` cover slow intent/foreground checks, 3000 ms delayed executor settlement, in-window speech, out-of-window speech, missing release, and M1 compatibility. No CI inventory or workflow changes are needed.

M2E policy compatibility: the existing M2D-06 fixture explicitly uses a 200 ms release-relative speech window for its 100 ms delayed utterance, preserving the slow-settlement regression; M2D-10 schedules its valid payload utterance 25 ms after the ledger release entry, rather than 25 ms after transport settlement. Neither assertion is weakened.

### Second fixture correction (2026-10-30)

Observed: focused suite 61/62, `M2D: duplicate post-release phrases…` expected `raw_seq [1,2]`, got `[]`.

Root cause (MEASURED, scratch harness, 200 in-process iterations): fixtures that schedule speech `later(25)` *after the transport's `gate.release()` resolves* do not land at a fixed release offset. The capture loop keeps advancing the fake clock by `pollMs` while `release()` settles over real event-loop turns, so the callback ran at release+0…60 fake ms and the phrase at release+25…85. With the 50 ms window, the old fixture attributed `[1,2]` in 79/200 runs. In the other 121, the phrases arrived after the capture's window had already closed, so the capture correctly reported silence. The fixture was racy, not the production rule. In a fresh process each test passed 25/25, which is why the failure appeared only in the full file.

Fix: schedule relative to the genuine gate-release reader entry via `atRelease()` (as M2D-10 already does). The release-anchored fixture attributed 200/200 runs (received at release+30, absence floor at release+20). Applied to every fixture with this pattern that expects in-window attribution:

| Test | Before (in-process) | Change |
|---|---|---|
| M2D-03 post-release speech | same pattern as below | `atRelease(later(25))` |
| M2D-07 multi-action `first` | 55/200 attributed | first release entry only, `later(20)` |
| M2D duplicate phrases | 79/200 attributed | `atRelease(later(25))` |
| M2E in-window speech | same pattern | `atRelease(later(25))` |

No assertion, production deadline, `ACK_MS`, `RECEIPT_SETTLE_MS` or observation policy was changed. No change to `src/` was needed in this correction.

### Audit probes (scratch, not committed tests)

- Phrase observed at exactly release+50: accepted, 50/50 (window end is inclusive). This matches the `received.t <= end` rule.
- Phrase at release+51 (`pollMs` 1): the capture ends at release+50 and reports silence for `[release, release+50]` only. The later phrase is outside the claim (the known late-speech limit).
- In-window phrase revealed by a speech read that returns at release+80: ambiguous, "speech not established within the gate-release observation window", `observation_until` recorded, gate stopped.
- Two sequential actions: each record has its own window and speech (`p1` and `p2`). Two silent actions, one with a 700 ms settlement: each silence equals its own `[release, release+50]`.
- Executor failure after release, and an executor hang past `timeoutMs` after release: failed, no `silence`. `observation_window` remains as diagnostic policy scope only.
- In-window speech with a 2000 ms post-send check: attributed, complete.
- Termination after settlement: `receipts.finish()` reports `complete:true` only after the R1 reader returned, and the wrapper stamps `released_at` first. So the post-settlement re-read always sets `until`, and the loop ends at `until` or at `release+1000 ms`. This structure predates M2E.

## Verification and handoff

On Windows, using pinned Node 24.22.1 and existing locked dependencies, verify the reviewed patch in a clean, isolated branch first:

```
node --test --test-timeout=20000 test/r2-capture-receipts.test.mjs test/r2-capture-receipts-failclosed.test.mjs
node --test --test-timeout=20000 test/r2*.test.mjs
node scripts/check-r1-baseline.mjs
node scripts/preflight.mjs
node scripts/offline-tests.mjs --profile ordinary --out cache/r2-m2e
node scripts/offline-tests.mjs --profile stress --seed 172785 --out cache/r2-m2e
```

Record observed results in the governance ledger after verification; do not pre-claim PASS or change FEATURES. Do not commit, push, merge, deploy or dispatch automatically.

### Local results (MEASURED, 2026-10-30T03:56Z–04:28Z, Windows, Node 24.22.1, HEAD `2754e6b`, uncommitted working tree)

| Check | Result | Exit |
|---|---|---|
| Focused receipt suites (2 files) | 62/62 pass | 0 |
| `test/r2*.test.mjs` | 234/234 pass | 0 |
| `check-r1-baseline.mjs` | `ok: true`, revision `0c93fa7…`, no errors | 0 |
| `preflight.mjs` | `ok: true`, all 6 checks (node, lock sha/deps/vendor_tree, Day-1 gates, dependency tree) | 0 |
| Offline ordinary (`cache/r2-m2e`) | 47/47 files PASS, 509/509 tests | 0 |
| Offline stress run 1 (`cache/r2-m2e`) | 7 profiles 47/47 and 509/509. `stall-40`: 46 PASS plus `speech.test.mjs` TIMEOUT (SIGKILL at the 60 s file watchdog) | 1 |
| `speech.test.mjs` alone under `stall-40` faults, ×2 | 122/122 pass, 53 s and 52 s | 0 |
| Offline stress rerun (`cache/r2-m2e-rerun`) | all 8 profiles (repeat-1, repeat-2, serial, random-172785, slow-fs-30, slow-fs-100, stall-40, mixed): 47/47 files PASS, 509/509 tests each | 0 |

The offline runner covers only part of the root test suite. It reports `PARTIAL SUITE: 47 selected files; 9 excluded files`, so these results do not cover the complete root suite. The stress run 1 timeout was in `speech.test.mjs`, which imports only `src/speech/*` and none of the M2E diff. It passes in 52–53 s under the same faults, close to the 60 s watchdog; see the runner's note on hosted run 40927125615. It is recorded as a load-sensitive margin, not an M2E result, and the watchdog was not changed.

## Risks

- Release is acknowledgement-reader entry, not independently attested physical send.
- A post-window phrase observed during required settlement makes an otherwise silence-classifiable capture **INSUFFICIENT_EVIDENCE**; conservative false refusals may increase.
- A delayed read returning after the window ends cannot establish whether a phrase arrived within it; refusal is deliberate.
- No guarantee is made about arbitrarily late speech, which remains an acknowledged observational limit.
- Silence is claimed through `release+observationMs` from the last speech read before the loop breaks, which can be requested just before `to`. A phrase in that gap is caught only by the next boundary read (next action or final boundary), which fails closed.
- `observation_window` stays on failed records as diagnostic policy scope. Consumers must gate on `capture_status` / `completed`, never on the window field alone.
- The loop has no executor timeout after receipt settlement. It terminates because an authenticated ledger's `complete:true` implies `released_at`, which predates M2E. A forged ledger is already refused by `isSendReceiptLedger`.
- `stall-40/speech.test.mjs` runs with about 7 s of headroom under its 60 s watchdog on this machine. That is outside M2E scope.
- Status: local evidence only. No hosted CI run, owner review or ledger entry exists for M2E yet. R2 qualification remains BLOCKED.
