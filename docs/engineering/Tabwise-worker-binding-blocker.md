# D-59 worker binding — architecture blocker, no live execution

R1 must remain byte-identical. `scripts/tabwise/review-status.json` remains BLOCK. The new workflow is a refusal scaffold, not a completed live worker. No safety PASS is claimed.

Source constraints found during implementation:

1. `src/speech/sendguard.mjs:pageKeyOf` maps page acknowledgements only for Tab, Space and Enter, plus individually supported `sendkeys` characters. Escape, arrows, Home and End return an unconfirmable key. `judgeKeys` can compare them, but the actual frozen physical-send gate refuses them. Broadening the contract does not broaden the gate.
2. The frozen vendored `sendKeys` allows one character from `[A-Za-z0-9@.]`. The palette includes `invalid-email` and `Asha Test`, whose hyphen/space cannot be passed directly to that method. Space could be a separately guarded Space press; hyphen cannot silently bypass the frozen acknowledgement mapper.
3. Vendored `NVDAClient.spokenPhraseLog()` awaits all pending actions. A naive provider using it during a captured action can block until Guidepup's capture/silence wait finishes. The R2 adapter's conservative acknowledgement observation deadline is 1,000 ms from executor request; it cannot safely be extended to hide this mismatch.
4. R2's untagged cumulative speech log establishes observation-window association, not an atomic physical-send boundary. Promise settlement or an abort request does not establish physical quiescence.
5. The frozen `NVDAClient` phrase journal is populated by `#processQueue` from action-scoped speech aggregation. `capture:false` appends an empty action result; it does not expose a continuous raw speech stream. The client owned by `NVDA` is private. Therefore switching off action capture does not supply the R2 provider contract, and patching prototypes or exports would bypass the frozen integrity boundary. A separately reviewed, genuine observation interface is required.

Required independent architecture/safety ruling: reconcile the conservative R2 observation interface with the unchanged guard and Guidepup collection semantics. Prefer an initial supported-key subset and explicit rejection of unsupported steps. A live loader must retain foreground freshness, page pre-read and exact acknowledgement, vendored integrity, persisted intent, continuous speech checks, loopback isolation and bounded teardown. No invented guard receipt or weakened deadline is acceptable.

The offline worker, exact-context patch applier, loopback predicate, contract and deterministic-verdict tests can be reviewed now. They are synthetic development checks, not NVDA evidence. The completed live workflow, artifact ingestion/reconciliation, patch-approval dispatch and genuine Fernway/Spark reports remain outstanding.

## D-63 correction and current disposition

Claude completed the read-only architecture review; its conditional second-client observer candidate replaces the earlier unavailable-review state. The old palette examples above describe the original hazard; current values are AshaTest and invalid.email, and only Tab/Shift+Tab/Enter/Space presses are admitted. All worker typing remains refused. Current changes and remaining blockers are in [Tabwise-Claude-reconciliation.md](Tabwise-Claude-reconciliation.md). Observer/press executor candidates have fake-boundary tests; a complete production loader and real relay/foreground/acknowledgement/physical-quiescence qualification remain absent. The narrow observer protocol is prepared but is not authorized for dispatch. Original R1 files and the conservative R2 deadline remain unchanged.

## R2-L0 production-binding readiness (2026-10-30T07:50:13Z, baseline `78cf379` on `main`; revised after independent review CONDITIONAL PASS)

Read-only source inspection of the committed tree. Nothing was executed. All R2 evidence is still synthetic/UNATTESTED. `review-status.json` is BLOCK. `qualification-status.json` is `enabled:false`, BLOCK (D-74 retired). Line references are to `78cf379`.

### What exists

| Interface | Location | State |
|---|---|---|
| Frozen send gate: admit, commit, launched, release, settled, stop, idle | `src/speech/sendguard.mjs:119-277` | Real and frozen. `admit` refuses without an integrity check, an ack reader with `.before` or a foreground check (`:184-188`). `commit` age is at most `maxAgeMs` 100 (`:230-231`). |
| Frozen page ack: `pageAck`, `judgeKeys`, `pageKeyOf` | `sendguard.mjs:31-105` | Real. Confirmable: Tab, Shift+Tab, Space, Enter. Ignores `Control`, `Shift` and `Insert` keydowns (`:43`). |
| Vendored NVDA chord path calling the gate | `vendor/guidepup-0.36.4-r1/lib/windows/NVDA/NVDAClient.js:429-482` | Real and frozen: admit, then commit, then socket write, then release. It never calls `gate.launched`, so a stop cannot cancel a chord after commit. |
| Authentic loader: integrity, then frozen guard, then registered `getGate`, `nvda`, `NVDAClient`, `relayOwnerPid`, `createForeground` | `scripts/tabwise/qualification-loader.mjs:9-35` | Real, one-shot, scoped to observer qualification. Sets `setIntegrity(inspect)` (`:31`). Only `scripts/tabwise-observer.mjs` uses it, and that entry is default-disabled (`:11`, `:16`). It is not a reviewed R2 production loader. |
| Second-client speech observer | `scripts/tabwise/observer.mjs:6-41` | Real candidate. `read()` has the capture speech-contract shape (`:37`). It fails closed and stops the gate on connection close/end/error, journal cap or clock regression (`:11-24`). |
| Foreground probe and mismatch | `src/speech/foreground.mjs:32-87` | Real, read-only. |
| Guarded press executor | `scripts/tabwise/executor.mjs:6-45` | Real candidate: intent, then foreground, then `arm`, then `nvda.press(key,{capture:false})` (`:31`), then disarm and `idle(1000)` (`:37`). |
| Gate-release receipt ledger | `src/r2/send-receipt.mjs:37-230` | Real. Requires a frozen gate, `getGate`, a frozen ack reader with `.before`, and a synchronous `onIntent` (`:38-41`, `:85-125`). It owns `setAck` and `onIntent` (`:169`). `gateState()` is at `:215-223`. |
| Capture with receipts (M2B–M2E, D-79) | `src/r2/capture.mjs:71` onward | Real offline logic. Release-relative ack `ACK_MS` 1000 (`:10`, `:237`). Receipt deadline (`:240`). |
| R2 page snapshot validation | `src/r2/page-provider.mjs:24-38` (event checks), `:90` (`createPageProvider`) | Real. Requires `focusin` with `target===active`, and keydown with string `key`, boolean `shift`, `target===active`. It refuses any true `ctrl`/`alt`/`meta`/`repeat`. Absent modifier flags are allowed. |
| Synthetic page collector | `src/r2/page-provider.mjs:48` (`createPageInstrumentation`) | Real, synthetic `record()` collector. |
| Offline composition, return boundary, M2C stop, payload allowlist | `src/r2/binding.mjs:23-85` | Real, but it relabels every source `synthetic-unattested` (`:49`, `:63-64`). The payload accepts synthetic captures only (`:76-77`). |
| Qualification evidence writer | `scripts/tabwise/qualification-evidence.mjs:4-28` | Real. Exactly five lanes, `events`, `intents`, `focus`, `page` and `acks` (`:4`); any other name throws (`:12`). 512000 bytes per lane, 4000000 in total. The manifest scope is "single owned title observation" (`:22`). No R2 journey lane or manifest exists. |

### What is synthetic or only prepared

- `runOfflineWorker` (`scripts/tabwise/worker.mjs:34-49`) uses a fake transport, M1 capture **without receipts** (`:40`) and a placeholder manifest (`:46`). `liveGate` always throws (`:31`).
- Every gate and ack wiring for R2 is test-local. The receipt tests build their own rig (`test/r2-capture-receipts.test.mjs:20-55`). In that rig the R1 ack view filters `page.read().events` directly, with no completeness or sequence check on that view (`:35`). The only real wiring is title-only (`qualification-core.mjs:25-30,44`), and its ack reader is not frozen, so the receipt ledger would refuse it (`send-receipt.mjs:41`).
- **No R2 page-journal source keeps the R1 ack view and the R2 snapshot view consistent.** The qualification page script (`qualification-providers.mjs:16-25`) listens to `focusin` but records type `focus`. Its events carry no `active` and no `ctrl`/`alt`/`meta`/`repeat`, and its snapshot has no `session`, `clock` or `t`. `createPageProvider` refuses that shape, and renaming or inferring the missing fields would invent evidence.
- Provenance: no production label exists for a real R2 capture. `binding.mjs` fixes `synthetic`/`UNATTESTED`.

### Hosted observer runs (correction)

The earlier R2-L0 text said D-74 was the only hosted observer run. That is wrong. Three hosted observer-workflow dispatches are recorded:

| Decision | Run | Outcome | Source |
|---|---|---|---|
| D-72 | `40826157539` | Skipped with zero steps; the approval variable was deleted right after dispatch | `Tabwise-observer-execution-runbook.md:15` |
| D-73 | `40849425253` | Refused before runtime: a CRLF checkout changed the lockfile blob; D-73 retired | `LOG.jsonl:94` |
| D-74 | `40884258062` | The only run that reached the runtime and observed speech. One guarded title action; `candidate_pass=true`, `full_worker_ready=false`. The owner orchestration outcome was FAILED because the verifier expected `manifest.json` at the extraction root of a nested artifact. The artifact was later archived and independently verified locally. Retired, no retry | `qualification-status.json` |

R1 runs (`r1.yml`) used NVDA through the primary client and are not observer runs.

### Is there a continuous, independently attributable NVDA speech observation boundary?

**No.** These are three different properties, and only the first exists:

1. **Continuously subscribed observer: exists as code.** `observer.mjs` connects a second `NVDAClient` with `capture:false` and appends every `speak` event while connected. Close, end, error, the journal cap or a clock regression fail it closed and stop the gate. This shows the subscription has not ended. It does not show that no speech was lost.
2. **Verified loss-free speech capture: not established.** The relay delivers normalized strings (`observer.mjs:39`) with no relay-side sequence number, so a dropped or merged phrase cannot be detected from the client. Relay equivalence between the observer and the primary client is hard-coded unverified (`qualification-core.mjs:13`). D-74 matched one primary title phrase once (`qualification-core.mjs:57-63`). That is one sample, not a loss-free guarantee.
3. **Multi-action attribution: not established.** R2 attributes speech by window only. The window is anchored at the ledger's `released_at`, which is the ack-reader entry, not the physical send (`send-receipt.mjs:131-136`). No hosted run has observed more than one action.

### Connecting the guarded press subset (R2-L2 constraints, not proposed here)

A real composition would join the loader's guard and `nvda` to `setCheck`, a frozen `pageAck` reader, the receipt ledger's `onIntent`, the executor and the observer. **It is deferred to R2-L2.** It must not be built as a helper that accepts destructured `guard`/`nvda` handles. `isQualificationRuntime()` can only tell whether an object came from the observer-qualification loader. It cannot stop an arbitrary live guard or `nvda` instance from being passed in pieces. R2-L2 therefore needs:
- an independently reviewed **production** loader that owns those capabilities and never exposes them for composition;
- separate owner authorization;
- the frozen R1 rules unchanged: presses limited to Tab, Shift+Tab, Enter and Space; no typing; no change to `ACK_MS`, `RECEIPT_SETTLE_MS`, `maxAgeMs` or `ackMs`; no vendor or `judgeKeys` change.

### Gap table

| # | Gap | Kind | Evidence |
|---|---|---|---|
| G1 | No single page-journal source yields both an R2-valid snapshot and a consistent, validated keydown ack view | software → **R2-L1** | `test/r2-capture-receipts.test.mjs:35` (test-local, unvalidated ack view); `qualification-providers.mjs:16-25` vs `page-provider.mjs:24-38` |
| G2 | Real guard/executor/receipt/observer composition behind a reviewed production loader | software + review → **R2-L2**, separately authorized | `binding.mjs:23-41`; title-only wiring in `qualification-core.mjs:25-30,44` |
| G3 | Real-browser in-page R2 journal (script that records `focusin`, `active` and modifier flags) | software, after R2-L1; needs browser authorization to test | `qualification-providers.mjs:16-25` |
| G4 | Worker runs M1 without receipts. `liveGate` throws | software; deliberately disabled | `worker.mjs:31,40` |
| G5 | No production provenance label, R2 journey lanes or manifest. The writer is title-scoped with five fixed lanes | software | `binding.mjs:63-64`; `qualification-evidence.mjs:4,22` |
| G6 | No journey-level teardown (observer, browser, NVDA, quiesce) | software (reuse `createQualificationTeardown`) | `qualification-core.mjs:31-35` |
| G7 | Loss-free observer capture, relay equivalence and multi-action continuity | physical qualification | see above; `qualification-core.mjs:13` |
| G8 | Foreground freshness on the hosted VM: commit age ≤ 100 ms with a real probe | physical | `sendguard.mjs:231`; D67 timing used injected foreground (`Tabwise-D67-review-response.md:16`) |
| G9 | Real Chromium keydown ack for Shift+Tab and Space under NVDA (browse vs focus mode) | physical | `pageKeyOf` (`sendguard.mjs:31-39`) is unexercised live for R2 presses |
| G10 | Cancellation: the NVDA chord cannot be recalled after commit, and the nvda path never calls `launched` | physical limit; disclose it | `NVDAClient.js:429-482`; `sendguard.mjs:237-240` |
| G11 | Physical quiescence: `idle()` tracks the JS in-flight token only. `quiescence:'UNVERIFIED'` | physical | `sendguard.mjs:272-273`; `send-receipt.mjs:185` |
| G12 | Speech latency vs `observationMs` and late speech | physical | M2E handoff "Risks" |
| G13 | `released_at` is ack-reader entry, not physical send | inherent; disclosed | `send-receipt.mjs:131-136` |

## R2-L1 specification — offline page-journal compatibility adapter (NOT implemented)

**Goal.** Close G1 only. Build a pure adapter over **injected synthetic event data**. One accepted journal state must yield:
- an R2 page snapshot that `createPageProvider` accepts;
- a keydown view for the frozen `pageAck` `read(cursor)`.

Completeness, sequence, focus and modifier checks are explicit. The adapter introduces no physical input, browser, DOM or timer implementation and imports no I/O modules. Its injected `source.read()` and optional `writer.append()` callbacks may themselves perform I/O; R2-L1 tests must supply only controlled synthetic sources and disposable writers. It reuses `createPageProvider` for R2 snapshot validation rather than re-implementing it.

### Permitted files (R2-L1)

- New: `src/r2/page-journal.mjs`.
- Tests: append to the admitted `test/r2-page-provider.test.mjs`, so `ci/offline-tests.json` stays unchanged.
- Docs: new `docs/engineering/R2-L1-page-journal.md`, `docs/CODEMAP.md`, and the normal ledgers.
- Unchanged:
  - all existing source, including `page-provider.mjs`, `capture.mjs`, `binding.mjs`, `send-receipt.mjs` and `sendguard.mjs`;
  - every `QUALIFICATION_FILES` member, including `qualification-evidence.mjs` and `qualification-providers.mjs`;
  - frozen R1, the vendor tree, workflows, the CI inventory, the status JSONs and `package*.json`.

### Interface

`createPageJournal({source, writer, maxEvents = 1000, maxBytes = 262144})` returns a frozen `{snapshot(), keys(cursor)}`.
- `source.read()` returns a raw synthetic journal, synchronously or as a promise: `{session, complete, clock:'page-monotonic-ms', t, active, state, event_count, overflow, dropped, events}`. Require `event_count === events.length`, `overflow === false` and `dropped === 0` before accepting evidence; never silently synthesize these provenance/completeness declarations. Each event is `{seq, t, type, target, active, ...}`. A keydown additionally has `key`, `shift`, `ctrl`, `alt`, `meta` and `repeat`.
- `writer` is optional. When present, it is called only as `writer.append('page', entry)`.
- `snapshot()` returns the accepted state in the `page.read()` shape of `capture.mjs:59`, after `createPageProvider` validation.
- `keys(cursor)` returns `[{seq, key, shift}]` for keydown events with `seq > cursor`, from the same accepted state. This is the shape `pageAck`/`judgeKeys` read (`sendguard.mjs:45-53,66-70`).

### Invariants

1. **One source.** Every `snapshot()` or `keys()` call performs exactly one `source.read()`. That read is validated against the single last-accepted state shared by both views. Neither view caches a state the other has not validated. Reject overlapping reads (including an overlap across the two methods), upstream read errors and malformed snapshots; every such failure is sticky, even if a previously pending read later resolves.
2. **Completeness.** If `complete !== true`, either view throws and latches a sticky failure. `pageAck` reports "page key log unreadable" and refuses; the capture provider also fails closed. Do not return an unvalidated `complete:false` snapshot as an accepted view, because `createPageProvider` requires `complete === true`. Preserve a failure reason for diagnostics only, not as eligible evidence.
3. **Sequence.**
   - `seq` runs exactly 1..n, contiguous.
   - `t` is finite, non-decreasing and ≤ the snapshot `t`.
   - `session` and `clock` are constant across reads.
   - Each accepted read extends the previous one: earlier events are byte-identical by canonical JSON, and the count does not shrink.
   - `cursor` is a non-negative safe integer ≤ the last accepted `seq`.
   - Any violation throws, and later calls keep throwing (the state is sticky failed).
4. **Focus.** Only `focusin`/`focusout` are accepted, and `focusin` must have `target === active`. A raw `focus` type is **refused, never renamed**. A missing `active` is refused, never inferred.
5. **Modifiers.** Every keydown must carry boolean `shift`, `ctrl`, `alt`, `meta` and `repeat`. Absence is refused, which is stricter than `page-provider.mjs` (that check stays unchanged). Any true `ctrl`/`alt`/`meta`/`repeat` is refused, matching `page-provider.mjs:36`. `key` must be a non-empty string, and `target === active`.
6. **Caps.** More than `maxEvents` events, or more than `maxBytes` of canonical JSON, is refused.
7. **Evidence lanes.** The writer uses only the existing `page` lane of `qualification-evidence.mjs:4`. Each entry is `{phase:'r2-journal', view:'snapshot'|'keys', cursor, seq_max, complete, errors}`. `focus` and `acks` remain the foreground check's and the ack reader's lanes; the adapter never writes them. No new lane name is introduced. If the writer throws, the call fails, latches a sticky failure, and returns no data; a later read must not recover the state.
8. **Static scope.** The module imports only `./page-provider.mjs`. No `node:*` module, Playwright, vendor, `sendguard.mjs`, loader, observer, executor or gate import. It exposes no guard, executor or receipt capability.

### Tests (append to `test/r2-page-provider.test.mjs`; write first)

RED is recorded against a naive stub that passes `source.read()` through to both views. A missing module does not count as RED.

Positive:
- **J-P1** Construct `createPageProvider({readJournal:()=>journal.snapshot()})` and call `page.read()` on an empty, complete `active:'body'` baseline. The page provider cannot accept an initial `focusin` without a known focus baseline. Then append focusin and keydown `Tab`, keydown `Tab` with `shift:true`, and keydown `' '`. A second `page.read()` is accepted and `keys(0)` equals the keydown subset of those events by `{seq, key, shift}`.
- **J-P2** The frozen `pageAck` over `keys`. For synthetic tokens (`{id, info:{path:'nvda', keys:[{vk}]}}`; no gate), `before()` then `ack()` confirm Tab, Shift+Tab and Space. An injected `Control` keydown with all flags false is ignored by `judgeKeys`.
- **J-P3** Interleaved `snapshot()` and `keys()` calls over a growing journal stay consistent and append-only.
- **J-P4** Writer lanes: the fake writer enforces the five-lane list from `qualification-evidence.mjs:4` and records only `page` entries. A second case uses the real `createQualificationWriter` in a disposable temp directory and finishes without "unknown qualification journal".

Negative:
- **J-N1** `complete:false`, `overflow:true`, missing/mismatched `event_count`, or nonzero/missing `dropped`: both views refuse, `pageAck.before` returns an unreadable reason, and later valid reads cannot recover.
- **J-N2** Sequence: a gap, a duplicate, a start other than 1, a `t` regression, an event `t` greater than the snapshot `t`, a cursor out of range.
- **J-N3** History: an earlier event changed between a `snapshot()` read and a following `keys()` read, a shrinking count, or a session or clock change. After any of these, every later call keeps throwing.
- **J-N4** Focus: a raw `focus` type, a `focusin` with `target !== active`, a missing `active`.
- **J-N5** Modifiers: a missing `ctrl`/`alt`/`meta`/`repeat`, any of them true, a non-boolean `shift`, an empty `key`, a keydown with `target !== active`.
- **J-N6** Caps exceeded (events, bytes).
- **J-N7** A stray non-ignored keydown before a send: `pageAck.before` over `keys` reports it. This shows the ack view does not hide strays.
- **J-N8** The writer throws: the call throws, returns no view data and remains sticky failed.
- **J-N9** A static import allowlist check on `src/r2/page-journal.mjs`.
- **J-N10** The adapter output contains no `guard`, `execute`, `press` or `release` property, and the module export list is exactly `createPageJournal`.
- **J-N11** Overlap a pending `snapshot()` with `keys()` (and reverse); both refuse, and later source completion cannot clear the sticky failure. Inject a `source.read()` rejection and verify the same behavior.

Mutation check for review: remove each invariant's check in turn. Its J-N test must fail.

### Must remain disabled

- `liveGate` throw (`worker.mjs:31`), `review-status.json` BLOCK, `qualification-status.json` `enabled:false`.
- `tabwise-run.yml` and `tabwise-observer.yml` unchanged. `runOfflineWorker` unchanged.
- No caller in `scripts/` or `src/` imports `page-journal.mjs`.
- No guard, executor, receipt or observer composition (R2-L2).
- `speechModelPayload` synthetic-only.

### Acceptance commands (Windows, Node 24.22.1)

```
node --test --test-timeout=20000 test/r2-page-provider.test.mjs
node --test --test-timeout=20000 test/r2*.test.mjs
node scripts/check-r1-baseline.mjs
node scripts/preflight.mjs
node -e "import('./scripts/tabwise/qualification-policy.mjs').then(m=>console.log(m.qualificationDigest()))"
node scripts/offline-tests.mjs --profile ordinary --out cache/r2-l1
node scripts/offline-tests.mjs --profile stress --seed 172785 --out cache/r2-l1
git diff --check
git diff --name-only
```

- The digest command's output must equal the value recorded before the change.
- `test/r2*.test.mjs` is expected to give 243 plus the new J-tests.
- The ordinary and stress profiles must keep 47 selected and 9 excluded files.
- `git diff --name-only` must list only the permitted files.

### Independent review criteria

- Only the permitted files changed. Existing sources, the qualification digest, frozen R1 and the CI inventory are unchanged.
- One source of truth: no view returns data from a read the other view's state would reject.
- Refusals are explicit, and nothing is renamed or inferred (`focus`, `active`, modifier flags).
- The writer uses the `page` lane only.
- Each invariant maps to a J-N test that fails under the mutation check.
- RED evidence is genuine.
- No physical, browser, gate or loader capability is reachable from the module.

### Residual limitations after R2-L1

- The adapter validates **injected synthetic data** only. It does not show that a real page records every event (G3), and it does not address G2 or G4–G13.
- Being stricter than `page-provider.mjs` on absent modifier flags is a choice. A real in-page script must record all five flags.
- R1 ignores NVDA's stop-speech `Control` keydown (`sendguard.mjs:43`). A real browser reports that key with `ctrlKey:true`, which R2's existing check (`page-provider.mjs:36`) refuses. A live R2 journey that receives such a keydown would therefore fail closed. R2-L1 does not change this; it needs an R2-L2 design decision.

### Unresolved decisions (owner)

1. Test placement: append to the admitted `test/r2-page-provider.test.mjs` (recommended), or a new file plus an owner-approved `ci/offline-tests.json` entry.
2. Whether the adapter should require all five keydown flags (recommended, stricter), or accept their absence as `page-provider.mjs` does.
3. How R2 should treat NVDA's own `Control` keydown (see residual limitations). This is deferred to R2-L2 and has no effect on R2-L1.
