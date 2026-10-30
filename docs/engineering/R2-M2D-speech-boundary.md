# R2 M2D: premature speech attribution hardening

Status: **offline engineering only. Not R2 PASS, not live readiness and not physical-send verification. R2 qualification remains BLOCKED.** The full worker remains BLOCKED. FEATURES `passes` is unchanged.

- Baseline: `1988f867c73915e373bbf87dbac2a77ab85b81f4` (merge of PR #4 onto M2A/M2B/M2C), branch `review/tabwise-m2b-m2c`. The clean tree was verified with `git rev-parse HEAD` and `git status --short`.
- Not based on the older `claude/zen-heisenberg-hqzh9p` snapshot.
- Authorization: the owner's 2026-10-29 task message "TABWISE — OVERNIGHT M2D IMPLEMENTATION, HARDENING, TESTING AND HANDOFF" (D-77). It covers this working-copy scope only. Commit, push, merge and live qualification are not authorized by it.

## Defect (MEASURED)

In receipt mode, the `captureJourney()` loop runs `readSpeech(record)` → `readPage(record)` → `gateRelease()` → settlement. `readSpeech(record)` appended every new phrase straight into `record.raw_seq` and `record.text`, whether or not a gate-release entry existed yet. Speech that appeared during intent persistence, the foreground check, or between commit and release therefore became the action's speech. The capture then completed with `capture_status: 'speech'`, and `speechModelPayload()` accepted it.

The existing M2B tests never produced speech in receipt mode, so the path was untested. The new regressions reproduce the defect. Against the unmodified baseline `capture.mjs`, 20 of the 22 new M2D tests in `test/r2-capture-receipts.test.mjs` fail, and so does the new M2C-table row. Most fail with `completed: expected false, actual true`. The two that pass at baseline are deliberate compatibility guards: M1 attribution and duplicate post-release phrases. M2D-03 and the second M2D-06 test fail at baseline only because the new `arrived_after` field is absent. They pin the new contract, not the defect.

## Fix (`src/r2/capture.mjs` only)

The fix separates observation from attribution:

1. Before each speech read, the capture keeps `floor = lastNow`, its last Node-monotonic reading. That value is no later than the read's request. After a successful read it becomes `previousSpeechFloor`.
2. In receipt mode, each new phrase gets `arrived_after: {clock:'node-monotonic-ms', t: previousSpeechFloor}`. The phrase was absent from a snapshot requested no earlier than that time, so it arrived strictly after it. This is a lower bound only.
3. A phrase joins `record.raw_seq` only if the validated `record.ack_timing.release_at` is already set **and** `arrived_after.t > release_at`. Equal timestamps do not count as an ordering.
4. Every other phrase stays in `result.raw` and is copied into `result.unattributed` with `step` and `release_at`, which is `null` when no release had been established. The action then fails with `ambiguous: speech observed before an established gate-release boundary`.
5. The existing failure path runs unchanged. It requests cancellation, expires the open receipt (which stops the gate), runs a bounded `finish()`, and runs no later action. M2C's binding stop still covers finalized receipts. Recovery reads use the same classification, so they cannot attribute early speech either.

The M1 path (no `receipts`) is unchanged: it gets no `arrived_after` and keeps its execution-window attribution. Nothing changed in `binding.mjs`, `send-receipt.mjs`, the page provider, the ACK_MS (1000 ms) policy or the model allowlist.

## Timing (plain text)

```
Node clock ──────────────────────────────────────────────────────────────▶
 begin()   intent  foreground  admit/before  commit  [send?]  released_at   ...settle  finish()
   │                                           │  not_before ... not_after=released_at │
   │<──── speech here: refused (ambiguous) ────────────────────────────────>│
 speech read k-1 requested at F (floor) ───┐
 speech read k returns phrase P ───────────┴─▶ P arrived in (F, received.t]
   attribute P  ⇔  release_at validated  AND  F > release_at
   F <= release_at (interval straddles or precedes the release entry)  ⇒  unattributed + ambiguous
 page ack: separate. Judged on the Node time each page read returned, against release_at + 1000 ms.
 Page-clock event t is never used to order speech or the gate.
```

## Why this is fail-closed, and what it does not claim

- A phrase that arrived between `commit.not_before` and `released_at` may have been caused by the send. The synthetic receipt cannot show that it was, or that it was not. M2D does not call such speech unrelated. It refuses to treat it as clean action evidence, keeps it, and returns `INSUFFICIENT_EVIDENCE`.
- Accepted speech is still `association: 'observation-window-only'`, `source: 'synthetic-unattested'`, `UNATTESTED`, with `quiescence: 'UNVERIFIED'`. The rule says only that the phrase was first present after the gate-release entry. It does not show causality or a physical-send time.
- `released_at` is the time the gate entered its acknowledgement reader, not the time of the physical send.
- Classification happens once, when a phrase is first seen. A later release never moves an `unattributed` entry into `raw_seq`.

## Regressions added

`test/r2-capture-receipts.test.mjs` gains 22 tests (M2D-01 to M2D-12). `test/r2-capture-receipts-failclosed.test.mjs` gains one row in the M2C invariant table. No existing test or threshold was edited. Both files are already admitted in `ci/offline-tests.json`, so no CI manifest change was needed.

| ID | Case |
|---|---|
| 01 | Phrase after commit, before release: unattributed, ambiguous, gate stopped |
| 02 | Phrase during `persistActionIntent` and during `checkForeground`: cancelled, receipt expired, no press |
| 03 | Phrase 25 ms after release: attributed, `arrived_after > release_at`, still UNATTESTED |
| 04 | A delayed speech read reveals a pre-release phrase and a release-entry phrase together: both refused, order kept |
| 05 | No release (transport error after commit, gate refusal) and expired release: never attributed |
| 06 | Speech, page-key and release visibility kept apart; slow intent, foreground and post-check do not taint post-release speech |
| 07 | Three actions: an early phrase in a02 does not reach a01 or a02, and a03 never runs |
| 08 | An already stopped gate keeps its reason and kind (`stop`). Cancellation is covered in 02 |
| 09 | M1 without receipts is unchanged (attributes, no `arrived_after`) |
| 10 | `speechModelPayload` refuses the premature capture; the accepted payload has no attribution diagnostics |
| 11 | Disconnect, incomplete snapshot, session reset, prefix rewrite and clock regression with early speech visible: recovery cannot attribute it |
| 12 | Phrase emitted at the release entry; phrase after a read whose floor **equals** `released_at`: both refused |
| — | Duplicate post-release phrases keep distinct seqs |
| M2C row | Speech before the release boundary meets every M2C failure invariant |

Test-design corrections made before the GREEN run (no assertion was weakened). `sendGate.release` awaits a real `setTimeout(settleMs)` and the post-check, so a transport's "after release" code runs later in fake time than first assumed. Release-time phrases are now injected at the ledger's release entry, through the frozen R1 reader wrapper. The clock-regression case regresses below the last reading. The second M2D-12 test was rewritten from a two-outcome check into a deterministic equality case.

## Evidence (MEASURED, Linux container, Node v22.22.0, synthetic only)

| Command | Exit | Result |
|---|---|---|
| `node --test --test-timeout=20000 test/r2-capture-receipts.test.mjs`, baseline `capture.mjs` | 1 | 44 tests, 24 pass, 20 fail (RED) |
| `node --test --test-timeout=20000 test/r2-capture-receipts-failclosed.test.mjs`, baseline `capture.mjs` | 1 | 12 tests, 11 pass, 1 fail (the new row) |
| same two files, after the fix | 0 | 44/44 and 12/12, repeated (see below) |
| `node --test --test-timeout=20000 test/r2*.test.mjs`, baseline | 0 | 205/205 |
| `node --test --test-timeout=20000 test/r2*.test.mjs`, after | 0 | 228/228, 0 cancelled, 0 skipped |
| `node scripts/check-r1-baseline.mjs` | 0 | `errors: []` |
| `node scripts/preflight.mjs` | 1 | Same failures as the documented baseline: node version (22.22.0), lock dependencies, dependency tree (no `node_modules`). `lock sha256`, `lock vendor_tree` and `Day-1 gates` PASS |
| `git diff --check` | 0 | clean |
| `node scripts/offline-tests.mjs --profile ordinary --out cache/r2-m2d` | 1 | 47 files: 44 PASS, 3 FAIL. 503 tests: 498 pass, 5 fail |
| `node scripts/offline-tests.mjs --profile stress --seed 172785 --out cache/r2-m2d` | 1 | 7 profiles (mixed, repeat-1, repeat-2, serial, slow-fs-30, slow-fs-100, stall-40) each 503 tests: 498 pass, 5 fail, same 3 files. `random-172785`: all 47 files fail before any test runs, with `bad option: --test-randomize` (Node 22) |
| repeat stability, both M2D files ×10 | — | 10 runs, each 56/56 pass, 0 fail, 0 cancelled |

The 3 failing files are `tabwise-qualification-loader`, `tabwise-review-integrity` and `vendor`. All fail with `ENOENT … node_modules/@guidepup/guidepup/…`. They fail identically (28 tests, 23 pass, 5 fail) with the baseline `capture.mjs` restored, so this is environmental. The pinned runtime (Node 24.22.1) and `node_modules` are absent here, and installing them is owner-gated, so they were not installed. The `random` profile cannot run on Node 22. No Windows result is claimed. The earlier hosted Windows 9 × 480 evidence applies to the unchanged baseline only.

## Unchanged semantics

- **M2A:** the ledger is not modified.
- **M2B:** the release-relative 1000 ms page acknowledgement, concurrent observation and receipt validation are unchanged. All 22 M2B tests pass.
- **M2C:** the binding stop is unchanged. All 11 original rows pass.
- **M1:** byte-identical behaviour without `receipts`. M2D-09 covers it.
- **Model allowlist:** unchanged.
- **Frozen R1, vendor, locks, workflows, CI manifest, FEATURES and qualification status:** untouched.

## Remaining risks and deferred work (INFERENCE)

- **Live over-refusal risk:** NVDA speech that follows the key within one poll interval of `released_at`, or before the transport returns, is refused. A real run may then return `INSUFFICIENT_EVIDENCE` more often. This is deliberate and needs live measurement, not a looser rule.
- **Snapshot time:** `floor` is the capture's last clock reading, not the provider's snapshot time. It is conservative, but providers do not report snapshot time.
- **Silence window:** `silence.from` is still the executor request, not `released_at`. The claim stays true, because any earlier speech would have failed, but it is a wide window.
- **Stray speech:** a phrase from another source after release is still attributed. Untagged speech cannot be separated, which is the existing R1/R2 residual.
- **Direct callers:** a direct `captureJourney({receipts})` caller still owns its gate stop (M2C limitation).

## Windows owner verification (Node 24.22.1, pinned `node_modules`)

```bash
node --test --test-timeout=20000 test/r2-capture-receipts.test.mjs test/r2-capture-receipts-failclosed.test.mjs
```

```bash
node --test --test-timeout=20000 test/r2*.test.mjs
```

```bash
node scripts/check-r1-baseline.mjs
```

```bash
node scripts/preflight.mjs
```

```bash
node scripts/offline-tests.mjs --profile ordinary --out cache/r2-m2d
```

```bash
node scripts/offline-tests.mjs --profile stress --seed 172785 --out cache/r2-m2d
```

```bash
git diff --check
```

Expected: R2 228/228. Offline profiles 503/503 per profile, if the environmental failures above disappear with pinned `node_modules`. That expectation is INFERENCE, not measured.

## Rollback

Reverse-apply the M2D patch (`git apply -R r2-m2d.patch`), or revert the single M2D commit once the owner makes it. It touches only `src/r2/capture.mjs`, the two receipt test files, this document and the ledgers. M2A, M2B, M2C and CI-H1/H2 are not touched.

## Follow-up (read-only assessment)

**R2 readiness gaps:**

- **Windows/environment verification missing:** Node 24 run of this diff, including the random profile.
- **Independent evidence missing:** a second-agent diff review of M2D (PROTOCOLS §4).
- **Owner approval required:** the commit, PR #3 integration and the M1 live-gate decision (M2C limitation).
- **Physical/NVDA qualification required:** real speech latency against `released_at`, which quantifies the over-refusal risk, plus real transport release timing.
- **External/infrastructure dependency:** hosted Windows runner with NVDA (R1 workflow).
- **No implementation defect is known** in the M2D scope after this change.

**M2E candidate (not implemented):** silence and observation-window accounting relative to `released_at`.

- Problem: receipt-mode `observed-silence` reports `from = executor request`, and the `until` window starts at executor settlement rather than at release. A slow post-check therefore lengthens the observation window, and silence claims span the pre-release period, during which speech would have failed anyway.
- Code: `captureJourney` receipt branch, the `until` computation and the `record.silence` construction.
- Smallest scope: in receipt mode only, set `silence.from = release_at` and record the attributable window `{from: release_at, to}`.
- Acceptance: red/green tests for slow intent and slow post-check silence windows, with M1 unchanged.
- Timing and approval: run it after Windows verification of M2D. It needs a separate owner decision, because it changes a reported evidence field.

**Integration risk with PR #3:**

- M2D modifies `src/r2/capture.mjs` hunks inside `readSpeech` only. That function is not touched by the M2B/M2C receipt-branch hunks, so a textual conflict with PR #3 is unlikely.
- M2D assumes the CI-H1/H2 merge `1988f86`. The test additions sit in already-admitted files.
- PR #3's current head was not inspected: no GitHub access was used, per AGENTS.md. Review must confirm that PR #3 still points at, or contains, `1988f86`.
- Nothing from `claude/zen-heisenberg-hqzh9p` was reintroduced. The diff is against `1988f86` only.
