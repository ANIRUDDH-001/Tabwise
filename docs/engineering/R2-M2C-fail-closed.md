# R2 M2C: fail-closed gate after a failed receipt-anchored capture

Status: **offline engineering only.** It is not R2 PASS, not live readiness and not physical-send verification. R2 evaluation readiness stays BLOCKED.

It builds on M2B (`docs/engineering/R2-M2B-receipt-capture.md`). Branch `claude/zen-heisenberg-hqzh9p`, baseline `dbb5a6d`.

## Defect (MEASURED, reproduced before the fix)

A probe ran 10 receipt-mode failure paths through `captureOfflineJourney` with the actual frozen `sendGate` and `pageAck`. Nine left the gate stopped. One did not: an R2-only failure after the ledger had already finalized a complete receipt, for example no page key by `release + 1000` while R1 acknowledged. The ledger had no open receipt left to `expire()`, and the executor had already removed its abort listener. So the capture failed but returned a **live** gate to the caller. A repeated page key after finalization behaves the same way.

## Fix

`src/r2/binding.mjs`: in receipt mode, if `captureJourney` did not complete and the gate is not already stopped, the binding calls `guard.stop('R2 capture incomplete: ...', 'protocol')` before it returns.

- `'protocol'`, not `'ack'`: R2's own observation does not claim R1 misdelivery (`misdelivered` stays false).
- A gate that is already stopped keeps its original kind and reason.
- A complete capture leaves the gate untouched.
- The M1 path (no `receiptBindings`) is unchanged.

## Tests: `test/r2-capture-receipts-failclosed.test.mjs` (11)

- Two regressions fail without the fix (mutation-checked: the stop was disabled, then restored). They cover an R2-only ack miss after a complete receipt, and a duplicate key after receipt finalization.
- Three tests pin the contract: a complete capture does not stop the gate, an earlier stop's reason is preserved, and the M1 path gets no new stop.
- Six table-driven tests check evidence invariants for each failure path: foreground refused, intent persistence throws, key without gate send, R1 before-call stray, wrong page key, and page journal loss. Each must leave a failed outcome, no later action, a stopped gate, a finished but incomplete receipt for the step, an incomplete ledger, a non-empty reason, the `gate-release` reference, synthetic/UNATTESTED provenance, UNVERIFIED quiescence, and JSON-serializable evidence.

## Evidence (MEASURED, Linux container, Node 22.22.0)

| Check | Result |
|---|---|
| New file, 8 repeat runs | 11/11 each run |
| `node --test test/r2*.test.mjs` | 205/205 |
| Safe subset (as in M2B) | 242/244. The 2 failures are the environmental `r1-baseline-eol` ENOENT (`node_modules` absent), also present at baseline. |
| `node scripts/check-r1-baseline.mjs` | exit 0 |
| `node scripts/preflight.mjs` | exit 1, check-by-check identical to baseline (Node version, lock dependencies and dependency tree are environmental; `lock sha256`, `vendor_tree` and Day-1 gates pass) |
| Frozen paths `git diff --stat -- fixtures vendor scripts src/speech .github package-lock.json package.json ci` | empty |

## Limitations

- The stop happens when `captureOfflineJourney` returns, so the gate stays live during the capture's own recovery reads. No action is sent in that interval, because the executor has settled and the capture does not continue.
- A direct `captureJourney({receipts})` caller owns its gate and must stop it itself. `captureJourney` has no gate access.
- The M1 path has the same post-settlement live-gate property. It is deliberately left unchanged to preserve the reviewed M1 contract, and needs a separate decision.

## Independent review required

Review the binding hunk and the 11 tests. Re-run them on Windows with Node 24.22.1 and pinned `node_modules`, including full `npm test` and preflight.
