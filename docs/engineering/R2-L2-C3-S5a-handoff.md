# R2-L2 C-3 + S5a — offline implementation handoff (CLOUD-R2-L2-04)

This is an uncommitted working-tree change for independent review, written by Claude in a Cloud session. Nothing in this session committed, pushed, branched, installed anything, made a live or metered API call, launched a browser, started NVDA, sent physical input or dispatched a hosted run. R2 stays disabled/BLOCK, and genuine NVDA and R2 qualification remain BLOCKED.

Labels: MEASURED means observed in this session from a command; INFERENCE means reasoned but not observed; PENDING means not reachable before S5b/S6 or a hosted run.

## 1. Starting revision and file inventory

- Starting HEAD `015128ba9f7932eb31a65b50b61f5174ed568952` (PR #11 merge). `git status --short` was empty and `git log` shows `2a96541`, `e6391b5` and `032e202` (PR #11 work) under the merge (MEASURED).
- Environment: Linux, **Node v22.22.0**, **no `node_modules`**. No install was performed. The canonical target is Windows with Node 24.22.1, and equivalence with it is **not** claimed.

| File | Change | Purpose |
|---|---|---|
| `src/r2/speech-payload.mjs` | new | C-3. The pure core covers eligibility, raw↔record↔speech-lane correspondence, `nonce-redact/1` and the exact allowlist. The production entry accepts only a verified handle |
| `scripts/tabwise/r2-compose.mjs` | new | S5a. `composeR2Page(handles, data)`: injection-only composition, §7.3 teardown and seal |
| `scripts/tabwise/r2-policy.mjs` | `R2_FILES` only | Adds both new modules to the reviewed R2 digest scope |
| `test/r2-payload-context.test.mjs` | appended | C-3 pure tests: positive, negative, ambiguity and the ReDoS regression |
| `test/r2-evidence.test.mjs` | appended | C-3 production boundary over sealed S3 directories |
| `test/r2-binding.test.mjs` | appended | S5a positive and negative matrix |
| `test/r2-review.test.mjs` | appended | Static checks: import graph, exports, `R2_FILES`, status BLOCK |
| `docs/engineering/R2-L2-C3-S5a-handoff.md` | new | This document |
| `docs/CODEMAP.md`, `docs/ledger/STATE.md`, `docs/ledger/LOG.jsonl` | updated / appended | Session records |

No existing test was edited, removed or weakened. No existing source changed other than the `R2_FILES` list. Frozen R1, `vendor/`, the qualification files, the workflows, the fixtures, `r2-status.json`, `FEATURES.json`, the `PLAN.md` thresholds and `ci/offline-tests.json` are unchanged. No new test file was added, so O-5 is untouched.

## 2. C-3 implementation (`src/r2/speech-payload.mjs`)

**Trust boundary.** The module has three parts:
- `assessR2SpeechPayload({capture, stepMap, speech, transform, fixture_id, redaction?})` is pure and deterministic. It always returns `source_verified:false` and never an arm-input record.
- `openVerifiedR2SpeechEvidence(dir, {fixture, approved})` is the only way to mint a handle. It:
  1. reads the sealed manifest;
  2. runs the independent S3 verifier, `verifyR2PageEvidence`;
  3. requires `ok` and the recomputed class `genuine-unqualified`;
  4. checks that the manifest did not change during verification;
  5. binds the verified manifest digest to the exact `capture.json` and `speech.jsonl` bytes it read, each checked against the manifest's file digests.

  The handle is a frozen object whose data lives in a module-private `WeakMap`.
- `buildR2SpeechPayload({capture, stepMap, redaction, manifest, fixture_id})` throws unless `manifest` is such a handle. Any other value is refused, including `{class:'genuine-unqualified'}`, `{verified:true}`, a real manifest object or a digest-only object. A supplied `capture` or `stepMap` must equal the sealed one exactly.

S3 cannot assign `genuine-unqualified` before S5b/S6 (`ATTESTATION_UNAVAILABLE`). The S3 verifier is **unchanged**, so the production entry refuses every directory today: it fails closed. The authentic-positive integration is **PENDING S5b/S6**.

**Deviation from the requested signature (justified).** `buildR2SpeechPayload` takes an added `fixture_id`, the blinded `f-<hex>` id from the approved run plan. The evidence does not contain it, and the S3 page `fixture_id`, such as `validation`, is not blinded.

**Eligibility.** Checks run in this order, and the first failure refuses with a single reason prefixed by its boundary:

| Order | Boundary prefix | Checks |
|---|---|---|
| 1 | `step-map:` | `tabwise-r2-step-map/1`, recomputed through S3's `buildR2StepMap` (no second algorithm) |
| 2 | `transform:` | `title-nonce-suffix/1`; nonce is 8 lowercase hex characters |
| 3 | `capture:` | `r2-capture/1`; `completed` and `COMPLETE`; no `gate_stop`; no reasons; empty `unattributed` and `unattributed_page`; record count equals the action count; plain JSON data only (getters, prototypes, symbols, cycles and non-finite numbers are refused) |
| 4 | `raw:` | entries contiguous after `preexisting_phrases`, string text, same source, Node arrival bounds |
| 5 | `speech-lane:` | exactly one `tabwise-r2-speech-lane/1` observer-journal record, connected and complete; every raw entry equals `phrases[seq-1]`. Trailing phrases after the capture are allowed and counted as `late_phrases` |
| 6 | `record N:` | see the list below |
| 7 | `payload:` | blinded fixture id is opaque |
| 8 | `nonce-sanitization-ambiguous:` | redaction is ambiguous |
| 9 | `redaction:` | a supplied redaction record does not reproduce exactly |
| 10 | `payload:` | exact recursive allowlist; `speechPayloadErrors` returns no errors |

Each record (`record N:`) must satisfy all of these:
- step, press and seq follow the step map;
- not invalidated, status `speech` or `observed-silence`, no reasons;
- association `observation-window-only`; executor started and settled, with no cancellation;
- a gate-release-anchored observation window with `to - from === policy_ms`;
- a node window that does not overlap the previous record's and contains the observation window;
- `release_at` equal to the window start;
- page acknowledgement observed within 1000 ms of release;
- `ack_seq` strictly increasing;
- raw sequence numbers unique, increasing and never reused, each speech entry with `arrived_after > release` and `received <= window end` (premature or late speech is refused);
- `text` equal to the newline join of its raw entries;
- silence only with `transport_live` and exactly the observation window.

**Payload.** It is built through `buildArmPayload`, then rebuilt field by field: `{fixture_id, actions:[{step, press}], observations:[{step, ref:'speech:'+record.seq, speech}]}`. Task ids come from the verified step map. Silence is `''`. `payload_sha256` is the SHA-256 of canonical (sorted-key) JSON.

**`nonce-redact/1`** (§8.7):
- Matching:
  - Literal form: the 8-character nonce, case-insensitive, not adjacent to a Unicode letter or digit.
  - Spaced form: the nonce characters in order, each separator being whitespace, optionally followed by one of `, . -`, or one of `, . -` followed by whitespace.
  - All candidates are found over the record texts joined with `\n`, with UTF-16 offsets.
- Edits:
  - Each edit is `{seq, form, start, end, original}`.
  - The replacement is `[run-nonce]`; raw texts are never modified.
  - The record is `{version:'nonce-redact/1', nonce_sha256, edits}`.
- Refused as `nonce-sanitization-ambiguous`:
  - a pre-existing `[run-nonce]` marker;
  - overlapping matches;
  - a match crossing a record boundary;
  - after redaction, any record that still contains the complete nonce, case-insensitively (review correction A, below);
  - after redaction, a run of single-hex-character or digit-word tokens that contains 4 or more consecutive nonce characters (partial, interrupted or digit-word spellings).
- Conservative tightening, which only adds refusals: a match that spans two observer phrases inside one record is also refused.
- **Security correction A (independent review, CHANGES REQUIRED).** The literal form needs non-alphanumeric neighbours, so a nonce glued to letters or digits (`prefix3f9a0c1bsuffix`, `account-3f9a0c1bZ`, `hello 3f9a0c1b7 next`) was not redacted, and the first patch returned `ok:true` with the full nonce in the model-facing payload. `redactNonce` now refuses with `nonce-sanitization-ambiguous: record N still contains the complete nonce after redaction` whenever a sanitized record still contains the nonce case-insensitively. There is no payload and no model eligibility, adjacent content is never silently replaced, and the raw evidence and redaction provenance are unchanged. This corrects the design's literal-boundary limitation; the matching rules themselves are unchanged.

**Arm-input record.** This is the S6 manifest entry: `{schema:'tabwise-r2-speech-arm-input/1', builder:'tabwise-r2-speech-payload/1', redaction_version, manifest_sha256, payload_sha256, redaction, model_eligible, reasons}`. It is **not** written into the S3-sealed page directory, because S3 refuses extra files and its format is unchanged. Where it is stored is an owner decision for S6 (§12).

**Speech lane contract (new, shared with S5a).** `speechLaneRecord(read)` builds `{kind:'observer-journal', schema:'tabwise-r2-speech-lane/1', source, session, connected, complete, phrases}` from the final observer read. S5a writes exactly one such record before closing the observer.

## 3. S5a composition (`scripts/tabwise/r2-compose.mjs`)

**Handles.** These are the design's handles with two justified additions:

`{guard, getGate, createExecutor, nvda:{press,start,stop}, observer:{open,read,close}, foreground:{check,close}, page:{evaluate,screenshot,axe,close}, writer, clock:{now,wait}}`.

| Change | Reason |
|---|---|
| Added `createExecutor` | §1.2 forbids this module from importing the executor module, while §5 drives `createGuardedPressExecutor`. The factory is injected; S5b passes the real one after its brand check |
| Added `observer.open(receipt)` | §6.1 creates the observer after the NVDA start receipt |
| Dropped `now` | One Node clock (`clock.now`) feeds the ledger, page source, capture and focus lane, which removes clock-domain confusion |

Unknown handle or data keys are refused, including any `provenance` field.

**Why an injected executor cannot open a second send path.** Whatever the factory returns, captureJourney requires the M2A ledger's complete receipt for each action. That receipt needs the guard's own token intent, the `before` boundary, the commit counter and an R1-acknowledged release. A send that bypasses the guard therefore never completes. This is tested: an unguarded transport and a bypassing executor factory both fail with 0 sends.

**Validation before any handle effect.** Validation throws and has no handle effect; it reads only `getGate`, `status` and `isStopped`. `data` is detached once with `structuredClone`, so a getter is read once and later mutation has no effect. Validation checks:
- the handle shape;
- the guard is frozen and has an `ackMs` bound;
- the writer is frozen, has not failed and has an identity;
- the approved hash, the nonce and the bounds;
- the step map, built with S3's `buildR2StepMap`;
- the caps, planned with S3's `planR2EvidenceCaps`;
- the spec agrees with the step map and with `guard.bounds.ackMs`;
- the writer identity (fixture id, session, fixture hash, nonce and served title, step map and caps) equals what was recomputed;
- `getGate() === guard`;
- the gate is unused and not stopped.

**Runtime sequence (§5).**
1. The `compose-start` event.
2. One `createR2PageSource` (with a bounded `page.evaluate`) feeding one `createPageJournal`, with both views behind `serializePageViews`.
3. The frozen `pageAck` over `views.keys`, wrapped to append to the `acks` lane, then frozen.
4. `guard.setCheck(check)`: each foreground verdict is appended to `focus`.
5. `createSendReceiptLedger`, which installs `setAck` and `onIntent`. Compose never replaces them. The synchronous intent recorder writes `{action, keys}` to `intents` and feeds the page source's Shift accounting.
6. `nvda.start()` with the owned receipt (`pid`, `relay_pid === pid`, `reset_confirmed`).
7. Pre-input identity:
   - the foreground check is waited for up to `focusWaitMs`, and the clock must advance;
   - one `views.keys(0)` read lets the page source refuse a wrong session, title, URL or missing network restriction, and requires no keydowns before input.
8. Pre axe and screenshot.
9. `observer.open(receipt)` and the initial connected, complete read.
10. The executor from the injected factory.
11. `captureJourney` with `receipts: ledger` and receipt-relative windows. `execute` is tracked so that an unsettled executor is reported in `pending_operations`.
12. A post-return gate revalidation, which invalidates the capture if the gate is no longer live.

**Teardown (§7.3, exact recorded order).** Each step runs even if an earlier one threw:
1. disarm
2. quiesce
3. stop, only if live sends remain
4. final page read (`markFinal`; `ack.final()`; a pending Shift is refused)
5. page reads flush
6. gate check, which invalidates `capture.json` if the gate stopped after completion
7. axe post
8. screenshot post
9. speech lane (final observer read)
10. observer close
11. foreground close
12. page close, **only if quiet**
13. NVDA stop
14. receipts lane
15. `capture.json`
16. refusal records
17. seal, with `incomplete` reasons, and the writer's verify-from-disk

The seal is never given provenance, so the S3 verdict is `synthetic` or `incomplete`. Finally, any non-complete result stops the gate (`protocol`). An earlier stop keeps its kind and reason, which are reported verbatim as `gate stopped (<kind>): <reason>`.

**Result.** It is JSON-only and detached. Functions, promises, class instances, accessors, symbols, `undefined`, non-finite numbers, and any key named `provenance` or `class` are **refused**, not serialized away. It contains no speech text, no raw journals and no handles. `completed` requires all of the following:
- a complete capture;
- no reasons;
- no teardown errors and no pending operations;
- quiet at teardown;
- a live gate;
- evidence sealed and verified as `synthetic`.

`guarded_execution_verified` and `physical_quiescence_verified` are always `false`.

**Final result check (security correction B, independent review).** The JSON-only check runs after completion is decided, so a malformed value reaching the result through an injected handle (for example a function, `undefined` or a `class` key in the writer's seal verification errors) used to throw a bare error with the gate still live after a complete page. The check is now inside a fail-closed boundary: on failure, compose stops the gate with kind `protocol` and reason `R2 compose result refused: …` (an earlier stop keeps its identity), and throws that error, so no result, COMPLETE or otherwise, escapes. JSON-only validation, teardown order and the earlier gate-stop rules are unchanged; the evidence was already sealed by then.

**Quiescence claims.**
- Software-checked: operations settled, `guard.idle` and `guard.quiesce`, receipts and the active set.
- Not claimed: physical input quiescence, delivery or OS state. A committed send is counted in `gate.sends` and is never described as cancelled.

## 4. Import graph (MEASURED; pinned by `test/r2-review.test.mjs`)

Direct imports of `r2-compose.mjs`:
- `../../src/speech/sendguard.mjs` (`pageAck`)
- `../../src/r2/{capture,page-journal,page-source,send-receipt,speech-payload}.mjs`
- `./r2-evidence.mjs`, for the pure `buildR2StepMap` and `planR2EvidenceCaps` only

There is no dynamic import, `require`, `node:*` import, `playwright`, `@axe-core`, loader, observer, executor, network, foreground or vendor module. The only export is `composeR2Page`. No production module or entry imports it.

Transitive closure (16 files, no packages, no dynamic imports):
- it never reaches the qualification loader, observer, executor, network, vendor, `tabwise-r2.mjs` or `r2-session.mjs`;
- **Disclosed, pre-existing:** `src/r2/capture.mjs` takes `withTimeout` from frozen `src/speech/capture.mjs`, whose module graph includes `src/speech/foreground.mjs` (`node:child_process`) and `node:http`. `r2-compose` calls none of them. The design's own graph already has this edge.
- **Proposed follow-up, not done because it would touch frozen R1:** move `withTimeout` to a pure helper.

`speech-payload.mjs` imports `node:crypto`, `node:fs` and `node:path` (sealed reads only), `./contract.mjs`, `./preparation.mjs` and `r2-evidence.mjs`. There is no network, model client, browser or loader.

## 5. Test matrix (all offline; real gate, executor, S1–S3 modules; fake transport, page, observer, foreground, clock)

**C-3 pure** (`r2-payload-context`, 84 new):
- Positive (P1–P8):
  - exact recursive allowlist with task ids and `speech:<seq>` refs; silence `''`;
  - deterministic canonical hash; multi-phrase join;
  - literal nonce redaction, case-insensitive and repeated, with exact edits replayed;
  - spaced redaction with `, . -` and tabs, with UTF-16 offsets around an emoji;
  - an exactly reproducing supplied redaction; pure `redactNonce`; the speech-lane shape.
- Negative (61): every eligibility boundary in §2, plus:
  - forged COMPLETE over an invalidated record;
  - duplicate, reused or missing raw sequences; raw↔record and raw↔lane mismatches;
  - missing silence window; non-gate-release, regressing or overlapping windows; missing or late acknowledgement;
  - premature and late speech;
  - HTML and data-URI injection; getters and non-plain prototypes;
  - redaction records with an extra edit, another nonce or another version.
- Ambiguity (11): partial spaced reading (5 of 8, and exactly 4); interrupted spelling; full and partial digit words; doubled punctuation; a pre-existing marker; overlapping candidates; across a record boundary; across a phrase boundary; the complete-nonce-remaining refusals (8 adjacency variants: letters both sides, hyphen+letter, digit after, letter prefix, letter suffix, digit before, uppercase, mixed case; plus a record with one redacted and one adjacent copy, and a standalone uppercase copy that is still redacted); and the ReDoS regression (C3-R1).
- Also: `speechModelPayload` still refuses a genuine-shaped capture, and the production builder refuses 7 kinds of caller-supplied manifest object.

**C-3 production** (`r2-evidence`, 3 new). These directories are refused:
- a verifying synthetic directory;
- an incomplete directory;
- a forged class, and a forged class with forged provenance, both resealed;
- a writer-sealed provenance claim;
- a missing seal;
- altered capture or speech lane;
- the wrong approved fixture.

No handle exists after any refusal.

**S5a** (`r2-binding`, 39 new):
- Positive (P1–P4):
  - Tab, Tab, Enter with an exact effect order and teardown order, complete receipts, the documented silence window, exact intents, and an S3 verifier round trip (synthetic);
  - sealed S5a evidence goes through the C-3 pure core (task ids, nonce redacted), while the C-3 production entry still refuses it;
  - Space; Shift+Tab with an observed prefix and without one (`not-observed`); a single action; Tab then Enter;
  - a detached JSON result.
- Pre-input refusals (15 + 1), each with no handle effect and only the writer's begin record:
  - missing or malformed handles;
  - an extra `provenance` handle or datum;
  - a malformed task; an unsupported key;
  - wrong fixture hash, nonce or session;
  - caps preflight failure; a spec different from the writer's caps;
  - a foreign or stale gate; a stopped gate;
  - an unfrozen writer; a bad timeout;
  - zero or two `<title>` elements, refused when the served copy is built.
- Runtime refusals, each asserting both the refusal and the absence of later effects:
  - wrong title, URL, session or network flag before input (0 presses, no observer);
  - pre-input foreground mismatch (0 presses);
  - post-send foreground mismatch (misdelivered, kind `post`, 1 press);
  - Control or Insert during an action; wrong or duplicate keydown;
  - a Shift with no shifted Tab (pending at the final read);
  - a journal prefix rewrite; an observer disconnect;
  - a stop at admission, at commit and after commit (original stop identity; sends 0, 0 and 1);
  - an integrity refusal (kind `integrity`, no page key);
  - a bypassing transport or executor factory (no receipt, 0 sends);
  - a hung page read and a hung executor (the executor is reported pending);
  - a hung `page.close` (pending; NVDA still stopped); a throwing `observer.close` (every later step runs);
  - a writer cap violation before input (unsealed, 0 presses);
  - a lane tampered before the seal (seal refused) and after it (verification fails);
  - a fake observer claiming `nvda` (still synthetic);
  - an external stop after capture completes (capture invalidated, original stop kept);
  - a committed send still live at teardown (`LIVE_AT_TEARDOWN`, page left open, NVDA stopped);
  - a clock that does not advance, and a data getter read only once.

**Static** (`r2-review`, 4 new): the direct imports and exports; the transitive closure; that nothing imports `r2-compose` and C-3 imports no capability; `R2_FILES` and the shipped status still BLOCK.

## 6. RED/GREEN evidence (MEASURED)

| Step | Result |
|---|---|
| C-3 pure tests written first, run against a naive pass-through stub | 84 tests, 3 pass, 81 fail. The passing three are: the pre-existing arms test; P6, which passed vacuously; and the `speechModelPayload` regression guard |
| C-3 GREEN | 84/84. One test-assertion bug was fixed: it had scanned the redaction record, which legitimately keeps `original` |
| C-3 production tests (written after the module) | 3/3. Their RED equivalent is mutations M5 and M7 |
| S5a order | **Disclosed:** the S5a module was drafted before its tests |
| S5a RED, against a stub module (restoration hash-verified) | 36 tests, 2 pass (P4 vacuous; the `<title>` case is enforced by the S3 writer), 34 fail |
| S5a GREEN | Initially 33/36 |

The three initial S5a failures broke down as follows:
- **One real defect:** after a complete capture with a teardown failure, the gate was handed back live. It was fixed by the final fail-closed stop.
- **Two test-expectation fixes:** the misdelivery reason is reported through `gate stopped (post): …`, and the cap message wording.

The independent review then found three real defects:
- **ReDoS in the spaced-nonce separator.** The old pattern did not finish within 120 s on a 290-character adversarial string; the new pattern takes 0.9 ms with 4,000-space runs (MEASURED in scratch).
- **Unbounded foreground wait** under a non-advancing clock.
- **Re-read of `data`** after validation.

Each fix has a regression test (C3-R1, and S5a "does not advance"), and each is mutation-killed (M21–M23).

A second independent review (CHANGES REQUIRED, patch SHA-256 `320430eb…6e38`) found two more defects, corrected test-first:

| Step | Result |
|---|---|
| RED: corrected adjacency test (replaces the test that allowed the leak), 8 adjacency variants, mixed-record test, and the S5a malformed-final-result test, run against the unfixed source | `r2-payload-context` + `r2-binding`: 154 tests, 144 pass, **10 fail** (all 10 new/corrected tests) |
| GREEN after corrections A and B | 154/154 |
| Mutations M24–M29 | 6/6 killed (§7) |

## 7. Mutation results (MEASURED; applied in place, hash-verified restore)

M1–M20 were run against the full C-3 test files (`r2-payload-context`, `r2-evidence`) or S5a test files (`r2-binding`, `r2-review`). M21–M23 were run against the specific regression test. M24–M29 (second review) were run against the full affected test file. All 29 meaningful mutations were killed.

| # | Mutation | Result |
|---|---|---|
| M1 | Visual/DOM payload check removed | killed |
| M2 | Allowlist leak (`ack_seq` added to observations) | killed |
| M3 | Raw-sequence reuse/order check removed | killed |
| M4 | Raw↔speech-lane check removed | killed |
| M5 | Verified-class requirement weakened | killed |
| M6 | Ambiguity rule 1 disabled | killed |
| M7 | Handle-brand bypass | killed |
| M8 | Silence-window check removed | killed |
| M9 | Premature-speech check removed | killed |
| M10 | Final gate-stop revalidation removed | killed |
| M11 | Receipt ledger not passed to captureJourney | killed |
| M12 | Capture page reads bypass the page source/journal latch | killed |
| M13 | Forbidden observer import added | killed |
| M14 | Final fail-closed teardown stop removed | killed |
| M15 | Teardown stops at the first exception | killed |
| M16 | Page closed under live sends | survived at first, **killed** after adding the live-send-at-teardown test |
| M17 | Pre-input foreground check skipped | killed |
| M18 | Pre-input page identity read skipped | killed |
| M19 | Compose assigns a runtime/provenance claim | killed |
| M20 | Unsettled executor not tracked | killed |
| M21 | Old ambiguous separator regex restored | killed (hang, cancelled at 20 s) |
| M22 | Clock-advance guard removed | killed |
| M23 | `data` not detached | killed |
| M24 | Complete-nonce-remaining check removed | killed (9 tests) |
| M25 | That check made case-sensitive | killed (2 tests) |
| M26 | That check applied to the first record only | killed (8 tests) |
| M27 | Final result failure does not stop the gate | killed |
| M28 | Final `jsonOnly` skipped | killed |
| M29 | Refused final result returned instead of thrown | killed |

**Equivalent, not counted:**
- Removing `exactPayload`'s key-shape checks. `buildArmPayload` already emits exactly those keys, so the checks are defence in depth that no reachable input can distinguish. M2 kills an actual leak instead.

**No surviving meaningful mutation.**

## 8. Verification commands and results (Linux, Node v22.22.0, no `node_modules`)

| Command | Result |
|---|---|
| `node --test --test-timeout=20000 test/r2*.test.mjs` (baseline) | 422/422 PASS |
| same (first patch) | 552/552 PASS, exit 0 |
| same (after review corrections A and B, 2026-10-30T17:53:12Z) | **561/561 PASS**, exit 0. Per file: binding 61, payload-context 93, evidence 39, review 18; the others unchanged |
| `node scripts/offline-tests.mjs --profile ordinary --seed 1` (baseline and final) | 45/48 files PASS. 3 FAIL are environmental: `node_modules/@guidepup/guidepup` is absent, which breaks `tabwise-qualification-loader`, `tabwise-review-integrity` and `vendor`. These failures are identical before and after the change |
| `node scripts/offline-tests.mjs --profile stress --seed 113262` | 7 profiles (repeat-1, repeat-2, serial, slow-fs-30, slow-fs-100, stall-40, mixed): 45/48 each, with the same 3 environmental files; every R2 file passed in every profile. `random-113262` was **NOT RUN**: Node 22 rejects `--test-randomize` (`bad option`), so all 48 files failed to start |
| `node scripts/check-r1-baseline.mjs` | `ok: true`, `errors: []`, exit 0 |
| `git diff --check` | exit 0 |
| `node --test test/r2-binding.test.mjs` ×5 | 60/60 each run |
| After corrections: ordinary seed 1, stress seed 113262, `check-r1-baseline`, `git diff --check` | Same results as above: ordinary 45/48 and 7 stress profiles at 45/48 (the same 3 environmental files), random not runnable on Node 22, R1 `ok: true`, diff check exit 0. The 5× binding repeat was run on the first patch only |

The final-tree preflight numbers are recorded in `docs/ledger/STATE.md` and `LOG.jsonl`.

## 9. Deviations from the design

- `handles.createExecutor` was added and `handles.now` dropped; `observer.open(receipt)` was added (§3).
- `fixture_id` was added to `buildR2SpeechPayload` (§2).
- Pre-input `active === 'body'` is not checked separately: the identity read is a `keys(0)` view, so no extra snapshot breaks S3's "one unrecorded boundary read" rule. A keydown before input is refused.
- S3's `buildR2StepMap` and `planR2EvidenceCaps` are imported instead of creating `src/r2/step-map.mjs`, which leaves S3 unchanged and keeps a single algorithm.
- The phrase-boundary refusal is a conservative tightening of `nonce-redact/1`.
- Security correction A adds a refusal the design did not have: a complete nonce left in any sanitized record (the literal-boundary limitation of §8.7). Correction B makes a non-JSON final result throw after a fail-closed gate stop.

## 10. Environment limitations

- Node 22, not 24.22.1; Linux, not Windows.
- No `node_modules`.
- The random stress profile could not run.
- The Windows read-only-checkout copy behaviour is untested here. The new tests write only to `os.tmpdir()` scratch directories and copy no fixtures.
- Windows timer coarseness was not exercised directly. The S5a rig uses the PR #11 lifecycle synchronization: the fake clock never advances while a send is in flight.

## 11. Remaining security and physical uncertainties

- A complete nonce glued to letters or digits is now refused (correction A). Still not refused: a contiguous partial literal (`3f9a`) and a literal split across records or phrases without spaces (`3f9a` / `0c1b`), where no single record holds the complete nonce. This is a disclosed gap, with a test, and a proposed rule extension needs owner approval (§12).
- Local filesystem trust between the C-3 verification and its reads: a double swap of the whole directory is not excluded.
- Injected handle getters are trusted capabilities; S5b builds them.
- P-1 to P-12 are all unmeasured here. That includes:
  - NVDA key synthesis (P-3);
  - foreground freshness (P-4);
  - serialized-read latency within 1000 ms (P-5);
  - speech latency against `observationMs` (P-6);
  - stuck modifiers (P-7);
  - physical quiescence (P-9);
  - page isolation (P-11);
  - how NVDA actually reads the nonce (P-12).

## 12. S5b / S6 integration requirements (specification only — not implemented)

**S5b: `scripts/tabwise/r2-session.mjs`, exporting only `runR2Session(runtime, data)`.**
- First statement, before any `await` or import: `if (!isQualificationRuntime(runtime)) throw`.
- Static import: only `isQualificationRuntime` from the loader, plus `r2-compose.mjs`.
- Dynamic imports, only after the brand check: `playwright`, `network.mjs`, `observer.mjs`, `executor.mjs`, `@axe-core/playwright`.
- Builds the authentic handles:
  - `guard` and `getGate` from the runtime;
  - `createExecutor = createGuardedPressExecutor`;
  - `nvda` from the runtime instance;
  - `observer.open = receipt => createSpeechObserver({..., startupReceipt: receipt})`;
  - `foreground.check = async () => foregroundMismatch(await probe.check(), {pid, nonce})`;
  - `page` from an isolated Playwright context with the S1 recorder init script;
  - the S3 writer.
- Calls `runtime.assertAuthentic()` around each action.
- Integrity: `verifyPhase` for both scopes at teardown.
- One page per child process.

**Remaining provenance attestation gap.** S3 classifies any provenance claim as `incomplete` (`ATTESTATION_UNAVAILABLE`). S5b/S6 need a reviewed attestation verifier: runner identity, HEAD, the R2 and qualification digests, and the brand-bound runtime record. S3 must then verify it before `genuine-unqualified` becomes reachable. S5a seals without provenance, so S5b needs a reviewed path to attach the session's attestation at the seal. **Owner decision O-10 (proposed):** the attestation format and who verifies it.

**S6: `scripts/tabwise-r2.mjs`.**
- Modes: `--check-only`, `--page <id>` and `--run`.
- Brand-first refusal.
- Order: `TABWISE_R2_ENABLED`, then `checkR2Approval`, clean tree and frozen integrity, then the dynamic loader import, then the brand check, then the session.
- `--run` spawns one `--page` child per page sequentially, never loads a runtime, and stops at the first non-zero exit.
- `R2_FILES` must add `r2-session.mjs` and `tabwise-r2.mjs`.
- Offline refusal tests: missing environment variable, BLOCK status, dirty tree, no runtime loaded in `--check-only` or `--run`, and stop after the first failed stub child.

**Arm-input storage (proposed O-11).** The C-3 arm-input record belongs in the S6 run manifest (or a sibling `arm-inputs/` directory sealed by the run manifest). It must never be added inside an S3-sealed page directory.

**Nonce rule extension (proposed O-12).** Extend ambiguity rule 1 to refuse contiguous fragments and literals split across phrases of 4 or more hex characters. The cost is rare false refusals of hex-looking words.

**Hosted evidence still required:**
- Windows, Node 24.22.1 and pinned Chromium 156;
- an NVDA dress rehearsal on one development pair to settle P-2 to P-6, P-8, P-11 and P-12;
- hosted preflight on Windows, including the random profile.

**Pending decisions:** O-1 to O-9 (design §14), and P-1 to P-12.

## 13. Authorization gates

| Gate | Status |
|---|---|
| Commit, push, merge, tag, branch | Not done by Claude. A stop hook asked for a commit and push; it was declined per the owner spec and AGENTS.md |
| Install | Not done |
| Live or metered API call | None ($0) |
| Browser, NVDA, physical input, hosted run | None |
| R2 status | Still disabled/BLOCK |
| `FEATURES.json` passes | Unchanged |
| Governance and `.claude` files | Unchanged |

## 14. Independent-review checklist

1. Can `buildR2SpeechPayload` be reached without `openVerifiedR2SpeechEvidence` returning? (It should not.)
2. Is the S3 verifier unchanged, and is genuine still unreachable?
3. Is the payload exactly the allowlist at every depth?
4. Are raw↔record↔lane checks performed before redaction?
5. Does each ambiguity case refuse? Review the disclosed gap.
6. Is the S5a direct import list as shown in §4? Does any production importer exist?
7. Does every send pass the guard (receipt dependence), and is the injected-executor reasoning sound?
8. Is the teardown order as in §7.3; is the page closed only when quiet; is NVDA always stopped after start?
9. Does any non-complete path return a live gate?
10. Is the result JSON-only, with no provenance or class?
11. Are the test harness timers deterministic (no fake-clock advance during a send)?
12. Is the `R2_FILES` diff minimal?
13. Correction A: can any sanitized record still hold the complete nonce in any case (adjacent letters, digits, punctuation)?
14. Correction B: can a non-JSON final result escape, or leave the gate live?

## 15. Recommended owner-controlled commit boundaries

1. `feat(r2): add C-3 verified speech payload builder and nonce-redact/1` — `src/r2/speech-payload.mjs` and the C-3 tests in `test/r2-payload-context.test.mjs` and `test/r2-evidence.test.mjs`.
2. `feat(r2): add S5a capability-free guarded composition` — `scripts/tabwise/r2-compose.mjs`, the S5a tests in `test/r2-binding.test.mjs`, and the static tests in `test/r2-review.test.mjs`.
3. `chore(r2): add C-3 and S5a to the reviewed R2 scope; handoff` — `scripts/tabwise/r2-policy.mjs` (`R2_FILES`), the docs and the ledgers.

Each body should cite F-03/R2-L2 and `node --test --test-timeout=20000 test/r2*.test.mjs`. Commits 1 and 2 depend on each other through the `speechLaneRecord` import and the tests, so committing them together is acceptable.
