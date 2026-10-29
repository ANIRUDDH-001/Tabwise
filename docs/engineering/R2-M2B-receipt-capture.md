# R2 M2B: gate-release receipts in R2 capture

Status: **offline engineering only. Not R2 PASS, not live readiness and not a physical-send verification.** R2 evaluation readiness stays BLOCKED; FEATURES R2 `passes` is unchanged.

Baseline `dbb5a6d2a89da01cf2db6f6844d6c2cc32dd39c1` (M2A). Branch `claude/zen-heisenberg-hqzh9p`. Authorization: the owner's session message of 2026-10-29: "Complete M2B and the subsequent clearly justified offline R2 engineering milestones"; "Commits and branch updates are permitted on that branch only."

## What changed

| File | Change |
|---|---|
| `src/r2/capture.mjs` | New optional `receipts` argument (a ledger from `createSendReceiptLedger`). Without it, the existing path is byte-for-byte the same logic. |
| `src/r2/binding.mjs` | New optional `receiptBindings {getGate, ackReader, onIntent}`. The binding installs the ledger on `executorBindings.guard`, using the capture's own clock, before it builds the executor, and passes it to `captureJourney`. |
| `src/r2/send-receipt.mjs` | Additive only: a private `WeakSet` of ledgers this module built, and `isSendReceiptLedger(value)`. No existing behaviour or output changed. |
| `test/r2-capture-receipts.test.mjs` | 22 new regression tests. They were written first and all failed before the implementation (MEASURED, see below). |
| `docs/CODEMAP.md` | R2 rows updated. |

No frozen R1 file, vendored code, workflow, lock, threshold, fixture, test or historical evidence was edited. `git diff` on `fixtures vendor scripts/r1.mjs src/speech .github package-lock.json package.json ci` is empty.

## Receipt-mode contract (`captureJourney({..., receipts})`)

1. `receipts` must be a ledger that `createSendReceiptLedger` built (brand check). A ledger-shaped object is refused before any provider read.
2. Per action, `receipts.begin(step, {deadlineAt})` runs after the pre-action boundary reads, with `deadlineAt = request + timeoutMs + 1000`. That is a collection bound only.
3. The executor is started without being awaited. Speech and page are read in a loop **while it settles**.
4. On every read the current ledger receipt is validated: snapshot schema, Node clock label, UNATTESTED provenance, no ledger errors, exactly one receipt for this step, not expired or late, and `started_at`/`released_at` inside the capture's own observed Node time (else "contradictory clock domain"). Once released, the commit inference must be coherent, and the token label and expected key must match the action.
5. **Acknowledgement:** R2's own page reads must show the expected key exactly once, and the Node time at which that read **returned** must be ≤ `released_at + 1000` and ≥ `commit.not_before`. The page-clock `t` of the event is never used for timing. A key first observed later is recorded as `late_observed_at` and fails. A key observed before the before-call boundary is `ambiguous`. With a release and no key by `release + 1000`, the action fails immediately, without waiting for executor settlement.
6. A wrong or repeated key fails at once. A release-time change between reads fails.
7. After the executor settles, `receipts.finish()` must return a complete receipt (R1 ack returned true, counters consistent, gate idle). Otherwise the action fails. Observation then continues for `observationMs`, as before.
8. On any failure: cancellation is requested, the open receipt is `expire()`d (this stops the gate), and a bounded `finish()` records its final state. Receipt errors are copied into the reasons. No further action runs.
9. The capture completes only if the ledger's whole journey is complete.
10. Output: `record.ack_timing.reference: 'gate-release'`, with `release_at`, `commit_not_before`, `observed_at` and `late_observed_at`. `record.gate_receipt` holds the receipt copy, with the R1 ack kept separate from R2's `ack_seq`, and `result.gate_receipts` holds the ledger snapshot. Provenance stays `synthetic`/`UNATTESTED`. `guarded_execution_verified`, `physical_delivery_verified` and `r2_page_ack_verified` stay false, and quiescence stays `UNVERIFIED`. `speechModelPayload` is unchanged and still allowlists only step, ref, speech text and actions.

## Evidence (MEASURED, this session, Linux container, Node 22.22.0)

| Check | Before (dbb5a6d) | After |
|---|---|---|
| `node --test test/r2-capture-receipts.test.mjs` | first run: 0 of 20 passed (19 failed, 1 cancelled); receipt path absent | 22/22 pass (8 repeat runs at 21 tests and 3 at 22, all green) |
| existing `test/r2*.test.mjs` (without the new file) | 172/172, measured after the change, with no existing test edited | 172/172; with the new file 194/194 |
| Safe subset (see below) | 209/211 | 231/233 |
| `node scripts/check-r1-baseline.mjs` | exit 0 | exit 0 |
| `node scripts/preflight.mjs` | exit 1: node version, lock dependencies, dependency tree | exit 1, check-by-check identical; `lock sha256`, `lock vendor_tree`, `Day-1 gates` pass |

The 2 safe-subset failures, both in `r1-baseline-eol`, and the 3 failing preflight checks are environmental and are present at baseline. This container has Node 22.22.0, not the pinned 24.22.1, and has no `node_modules`. Installing it is an owner-gated dependency action and was not done. Every one of these failures reports `ENOENT ... node_modules/@guidepup/guidepup/...` or the Node version. The wider non-browser run (46 files, excluding browser, NVDA-package, `d67-timing`, `qualification-providers` and `d73-admission`, which spawns `powershell.exe`) gave 355/362. All 7 failures are the same missing-`node_modules` ENOENT, and none involve a changed file.

Safe subset: `node --test --test-timeout=20000 test/r2*.test.mjs test/sendguard.test.mjs test/tabwise-executor.test.mjs test/r1-baseline.test.mjs test/r1-baseline-eol.test.mjs`. It launches no browser, NVDA, network or API call. `r1-baseline-eol` runs `git cat-file` and the observer in `--check-only` refusal mode only.

## Adversarial self-review findings (fixed before handoff)

- A busy-loop: after settlement with the acknowledgement still pending, the next-read bound could be at or before the current time. The loop then spun on microtasks without advancing the clock. Fixed by not capping on `until` while the acknowledgement is pending. Regression: the duplicate-key test hung before the fix.
- A direct `captureJourney` caller could pass a ledger whose journey is longer than the capture's. The capture could then report COMPLETE with an incomplete ledger. Fixed with a final journey-completeness check, regression test included.

## Remaining limitations (INFERENCE unless marked)

- The release boundary is the moment the gate calls its acknowledgement reader. A transport that delays `gate.release` moves the anchor later. The frozen gate bounds sends (`sendMs`), but this module does not attest physical delivery time.
- R1's disclosed residual still applies: an identical stray key that lands between the before-call read and the send, while our own key is lost, looks like our key. R2 cannot separate them from untagged page events.
- Speech during the execution window is associated with the window only, not causally certified.
- On failure, a bounded 1000 ms real-time wait for gate idle is applied. A hung transport may still finish later; that late activity is refused by the ledger but cannot be retracted.
- All tests use fake transports and fake clocks. Real-time interleaving with a real NVDA socket or browser journal is unqualified.
- Ledger brand and clock checks protect against accidental misuse, not a hostile in-process caller.

## Independent review required

- Review `src/r2/capture.mjs` receipt branch, `src/r2/binding.mjs`, the `send-receipt.mjs` brand, and the 22 tests.
- Re-run the verification commands above on Windows with Node 24.22.1 and the pinned `node_modules`, including full `npm test` and preflight.
- Confirm that the M2A-reviewed ledger semantics are unchanged by the additive brand.

## Local verification

```bash
node --test --test-timeout=20000 test/r2-capture-receipts.test.mjs
```

```bash
node --test --test-timeout=20000 test/r2*.test.mjs test/sendguard.test.mjs test/tabwise-executor.test.mjs test/r1-baseline.test.mjs test/r1-baseline-eol.test.mjs
```

```bash
node scripts/check-r1-baseline.mjs
```

```bash
node scripts/preflight.mjs
```
