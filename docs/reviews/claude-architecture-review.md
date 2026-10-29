# Claude independent architecture/safety review: TW-REVIEW-01 (NVDA/R2 binding)

- Reviewer: Claude (Opus 5.5), independent of the implementer (Codex). Read-only.
- Brief: `REVIEW.md` in `C:/Users/ANIRUDDH/.codex/private/tabwise-claude-review/20261028T194054Z/`
- Verification run time (from `date -u`): 2026-10-28T19:50:47Z
- Scope: architecture ruling and safety findings only. **This is not a complete-worker PASS.** No live binding or execution is authorized by this report.

## 0. Evidence classes used
- **SOURCE-CONFIRMED**: read directly in the sealed snapshot at the cited file:line.
- **RUN-OBSERVED**: output of a command I ran myself, listed in §1.
- **PRODUCER-REPORTED**: taken from `producer-tests.txt`; not independently reproduced except where §1 says so.
- **INFERENCE**: reasoning from source-confirmed facts. No runtime observation backs it.
- **EXTERNAL-UNVERIFIED**: a fact about NVDA, the NVDA Remote relay, Playwright or GitHub that the snapshot cannot establish. I consulted no external documentation.

## 1. Package identity and what I actually did
- The manifest SHA256 is `f73e1ffcd9723e6ea441c8fd254c026dffa508bff6aac353d813b6fc8a2a0228`, which matches REVIEW.md.
- I recomputed sha256 and byte length for all 88 manifest entries: 0 mismatches. `source/` holds exactly those 88 files. (RUN-OBSERVED)
- The outbox was empty before this write.
- **What I inspected (read-only):**
  - `docs/engineering/Tabwise-worker-binding-blocker.md`
  - `TABWISE-PRODUCT-DIRECTION.md` §§6.5, 6.5a, 6.6, 8, 13–16
  - `src/r2/capture.mjs`, `src/r2/contract.mjs`, and the three `test/r2-capture*.test.mjs` files
  - in `vendor/guidepup-0.36.4-r1/`:
    - `lib/windows/NVDA/{NVDA,NVDAClient,start,keyCodeCommands}.js`
    - `lib/windows/{r1Gate,sendKeys,runVbsScript}.js`
    - `lib/constants.js`
    - `VENDORED.md`
  - `src/speech/{sendguard,runguard,foreground,vendortree,capture,browser}.mjs`
  - `scripts/r1.mjs`
  - `fixtures/r1/{steps,lock}.json`
  - `scripts/tabwise/{worker,verdict}.mjs` and `scripts/tabwise/review-status.json`
  - `scripts/tabwise-run.mjs` and `scripts/check-r1-baseline.mjs`
  - `.github/workflows/tabwise-run.yml`
  - `packages/contracts/{index,palette,limits,schemas}.mjs`
  - `test/tabwise-worker.test.mjs` and `test/tabwise-verdict*.test.mjs`
- **What I ran**, from `source/` only, on Node v24.22.1:
  - `node scripts/check-r1-baseline.mjs` returned `{"ok": true, "revision": "0c93fa73e0c111a2df65302adfe0006d63f50a39", "errors": []}` and exited 0. (RUN-OBSERVED)
  - `node --test --test-timeout=10000 test/r2-capture.test.mjs test/r2-capture-boundaries.test.mjs test/r2-capture-corrections.test.mjs test/tabwise-worker.test.mjs test/tabwise-verdict.test.mjs test/tabwise-verdict-integrity.test.mjs` reported tests 40, pass 40, fail 0, duration_ms about 280, and exited 0. (RUN-OBSERVED)
  - This reproduces the producer's 40/40 count. These are offline fake-transport tests. They are **not** NVDA, browser or runner evidence.
- **What I did not do:** no npm install, full suite, preflight, workflow, runner, NVDA, desktop input, network, Meta, Supabase or Git operation. I did not read the active checkout. I made no source edits. My only write is this file.

## 2. Overall verdict
- **Architecture:** a defensible path exists, but it is **conditional**. It runs a second, never-sending `NVDAClient` as a read-only observer (§4), with a capture-off executor through the unchanged R1 gate (§5). The binding blocker document is correct that `spokenPhraseLog` cannot serve as R2's stream.
- **Live binding and execution: BLOCK**, for these reasons:
  1. The observer's equivalence to the stream NVDA actually speaks depends on relay behavior the snapshot cannot establish (§4.4, EXTERNAL-UNVERIFIED). One owner decision is needed (§4.5).
  2. There are two latent composition defects. Unsupported keys (F-1) and partial typed values (F-2) would be physically sent **before** being refused once a real executor is bound.
  3. The real provider, loader, observer, page/foreground providers, network isolation, teardown ordering and ingestion are not implemented (§7).
- `liveGate` correctly throws unconditionally (`scripts/tabwise/worker.mjs:44`). It must keep doing so until a later final review of the completed worker.

## 3. Rulings on the five questions

### Q1. Is `spokenPhraseLog` the continuous stream? **No. It is action-scoped and aggregated.** (SOURCE-CONFIRMED)
- `NVDAClient.spokenPhraseLog()` waits for all queued and in-flight actions before it returns `#spokenPhrases` (`NVDAClient.js:75-78`).
- `#spokenPhrases` gets exactly one entry per action:
  - With capture on, it holds that action's listener-collected phrases joined with `". "` (`NVDAClient.js:328-361`).
  - With capture off, it holds `""` (`NVDAClient.js:357-361`).
- Speech that arrives outside an action's capture listener is never journaled. That includes speech during `#stopReading`, whose handler only sets a flag (`NVDAClient.js:379-381`), speech between actions, and all speech under `capture:false`.
- Arrival times and message boundaries are discarded.
- `NVDA.js` holds the client privately (`#client`, created at `NVDA.js:267`), so no supported path reaches its event stream.
- The only continuous signal in the frozen code is that `NVDAClient` emits a public EventEmitter `"speak"` event for **every** relay speak message, regardless of capture mode (`NVDAClient.js:196-225`).

### Q2. Is there a source-supported observation interface outside the frozen files? **Yes, in design. BLOCKED pending external evidence (see §4).**

### Q3. Composition with the 1,000 ms executor-request cap. **Yes, with `capture:false`. It is fail-closed, not widened (see §5).**

### Q4. Initial keys and values. **A supported subset only (see §6).**

### Q5. Defects. **See §8. Existing defects are listed separately from missing implementation.**

## 4. Proposed observation interface (outside frozen files)

### 4.1 Mechanism
- Construct a second instance of the **already loaded, frozen** vendored class: `require.cache[<vendor>/lib/windows/NVDA/NVDAClient.js].exports.NVDAClient`.
  - It must be the cached module object, never a fresh copy and never upstream Guidepup. `vendorIntegrity` compares module identity (`src/speech/vendortree.mjs:154-165`).
  - The prototype and exports are frozen (`NVDAClient.js:509-512`). Instantiating the class does not modify them.
- Use only its public surface: `new NVDAClient()`, `connect({capture:false, deadlineMs})`, `on('speak', h)` / `off`, and `disconnect()`.
- The observer module must **never** call `sendKeyCode`, `enqueueAndTap`, `spokenPhraseLog` or any NVDA.js method. Even a mistaken call would still have to pass the gate. The test must still prove no call happens.
- Connect it only **after** `nvda.start()` has returned `relay_pid === pid` (`NVDA.js:270-273`).
- After the observer's channel join, call the exported `relayOwnerPid()` (`start.js:5,54`) again. Require that it equals the `relay_pid` from start. Otherwise stop the gate and fail setup.

### 4.2 Contract mapped onto R2's `speech.read` (`src/r2/capture.mjs:26,60-84`)
- **Session.** One opaque id (random UUID) per observer instance, created at a successful connect. The observer never reconnects. The vendored client never reconnects after success either (`NVDAClient.js:68-69,163-166`).
- **Utterance boundary.** One relay `speak` message is one phrase: the string emitted at `NVDAClient.js:223-224`.
  - Provenance must disclose the vendored normalization: non-string sequence items are dropped, each part is trimmed and whitespace runs collapsed, and parts are joined with `", "`.
  - `source` is a fixed literal, for example `"nvda-remote-observer/guidepup-0.36.4-r1"`. Code must never use `source` for authorization (see F-3).
- **Append-only log.** `phrases: string[]` is appended inside the `speak` handler and never cleared or rewritten. The R2 core already rejects a session change, a prefix rewrite or a shrink (`capture.mjs:65`).
- **Arrival times.** Keep a side journal of `{seq, t: performance.now()}` per phrase, written in the handler.
  - `capture.mjs` stamps receipt at read time (`capture.mjs:72`), so its resolution is the poll interval.
  - The side journal is for disclosure only. It must not change the R2 contract or backdate anything.
- **Liveness.** `connected === true` only if all of these hold:
  - a successful connect;
  - `!getGate().isStopped()`;
  - the observer has not been asked to disconnect.
  An unexpected observer `end`/`close`/`error`/protocol failure stops the gate sticky through the client's own `protocolError` (`NVDAClient.js:187-195,243-244`). That makes gate-stop the loss signal. Any gate stop, for any reason, therefore reads as not live. That is conservative and correct.
- **Continuity.** No message is lost while the same TLS socket stays open (INFERENCE from in-order TCP/TLS and the framer at `NVDAClient.js:226-242`). If the socket is lost, the gate is stopped, `connected` becomes false, and R2 marks the capture `disconnected` (`capture.mjs:63`). There is no gap-filling.
- **Completeness.** `complete === true` while the observer is live. Set `complete === false` permanently on any of: a handler exception, a frame or protocol error, or a phrase-count or byte cap breach (bound it under `JOURNAL_BYTES`, 512,000).
- **Drain and teardown order** (mirrors R1 `finish`, `src/speech/capture.mjs:182-190`):
  1. `guard.disarm()`;
  2. `guard.quiesce(liveWaitMs)`; on not quiet → `guard.stop(..., 'timeout')`;
  3. final boundary `speech.read()` and `page.read()`;
  4. `observer.disconnect()`. `disconnect()` nulls `#socket` first, so the later `close` does not stop the gate (`NVDAClient.js:243-244,504-506`);
  5. browser close, only if quiet;
  6. `nvda.stop()` last.

  Disconnecting the observer **after** `nvda.stop()` would turn a normal shutdown into a gate-stop error. That is safe but misleading, so the order above is required.

### 4.3 What the observer does *not* establish
- **Causality.** Association stays `observation-window-only` (`capture.mjs:117`).
- **That NVDA spoke nothing outside the observed windows.** Boundary reads detect speech that crosses a window and fail it as `ambiguous` (`capture.mjs:81`).

### 4.4 Missing evidence (EXTERNAL-UNVERIFIED), the reason for the BLOCK
1. **E-1.** The NVDA Remote local relay delivers every speak message from the controlled NVDA to **every** joined master in channel `guidepup`, not only the first.
2. **E-2.** A second master joining causes **no** NVDA speech, earcon/sound, focus change or setting change. A join announcement would itself appear as an utterance in the stream under test.
3. **E-3.** The relay echoes the primary master's key messages to the observer, or else it does not. Either way the observer ignores non-speak, non-cancel, non-join types (`NVDAClient.js:209-211`). That part is SOURCE-CONFIRMED for the client side only.
4. **E-4.** `relayOwnerPid()` still identifies the owned NVDA process after the second connection.
5. **E-5.** Speech delivery from the relay to the observer has no material lag compared with the primary client. This bounds whether `observationMs` (2,000 ms, `worker.mjs:50`) is enough.

### 4.5 The smallest explicit decision needed (owner)
**D-OBS:** authorize, or decline, one bounded, zero-cost **observer-equivalence qualification run** on a GitHub-hosted Windows runner under the existing R1 guards. It is not a Tabwise run. It would:
- send NVDA+T (`reportTitle`, already used by R1, `src/speech/capture.mjs:317`) through the unchanged gated primary path with `capture:true`;
- require the observer's phrase log for the same window to contain the primary client's returned phrase verbatim;
- require zero observer phrases before the action, which addresses E-2;
- require `relayOwnerPid` to be unchanged, which addresses E-4.

If the owner declines, the alternatives are:
- **(b)** a Tabwise-owned relay listener. This is new TLS and protocol code needing its own review and is strictly larger.
- **(c)** NVDA log-file speech. Its flush is unbounded and it uses another clock, so it can only corroborate, never serve as the primary stream.

I recommend (a). It reuses frozen, already-reviewed parsing.

## 5. Execution/observation composition under the 1,000 ms cap (Q3)
- **The executor must use `press(k, {capture:false})`** (and `type` likewise, if typing is later allowed; §6).
  - Capture mode cannot fit the cap. It runs `#stopReading` (at least 250 ms debounce, up to 1,000 ms per cancel wait, and it **loops while speech continues**) and then a 1,000 ms silence debounce (`NVDAClient.js:328-356,376-405`, constants at L48-50).
  - Note the literal `false` is required. `DEFAULT_CAPTURE = "initial"` and `options?.capture ?? this.#capture` replace only null or undefined (`NVDAClient.js:328`).
- **What capture:false gives up.** R1 bounded attribution with the stop-speech Control. Under capture:false, speech from the previous action may continue into the next action's boundary read. `capture.mjs:81` then halts the journey as `ambiguous`. That is fail-closed and correct. Whether it happens often enough to make journeys usually INCONCLUSIVE is a measurement (5b), not something to design around.
  - An explicit, separately gated stop-speech action **before** `node_window.from` is a possible later option. Control is NVDA-consumed: `pageKeyOf` returns null for a modifier-only chord, `sendguard.mjs:35-36`.
  - It needs its own decision. It must not be folded silently into `execute`.
- **R1's acknowledgement stays authoritative and unchanged.**
  - The gate's own `pageAck` reader runs inside `release` (`sendguard.mjs:242-264`), along with the 100 ms foreground freshness check (`maxAgeMs`) at admit and post.
  - R2's `ack_seq` observation (`capture.mjs:141-147`) is a **second, independent reader** over the same append-only page keydown log, with its own cursor.
  - R2 must never feed, replace or pre-confirm the R1 acknowledgement, and R1's result must never be copied in as R2's observation.
- **The cap's reference point is honest.** `node_window.from` is taken immediately before `execute` (`capture.mjs:127-133`), so R1 admission time (foreground check, `pageAck.before`) is inside the 1,000 ms. A slow admission fails as `incomplete`.
  - Do **not** widen `ACK_MS`, move `from` to after admission, or backdate from page time.
  - The expected cost is some flaky INCONCLUSIVE results. Measure it in 5b.
- **Operation timeout.** The worker bounds `execute` with `timeoutMs: 1000` (`worker.mjs:50`, applied at `capture.mjs:53-57,130-133`).
  - R1's `release` alone can take `ackMs` 1,000 plus margin, then `settleMs` 50, then a post check.
  - So a send that R1 later confirms can still be timed out by R2. That is fail-closed. On timeout `withTimeout` does not cancel the operation (`src/speech/capture.mjs`), so the R1 send keeps running. That is why the following separation is mandatory.
- **Three states, recorded separately and never collapsed:**
  1. **Promise settlement** (`execution.settled`): the executor promise resolved or rejected. For a capture-off press this means R1 `release` returned, so either the acknowledgement was confirmed or the gate is now stopped as misdelivered. Settlement is **not** quiescence.
  2. **Cancellation request** (`execution.cancellation_requested`, `controller.abort()` at `capture.mjs:165-166`): only a request. The executor **must** map `signal.abort` to `guard.stop('<step>: R2 cancellation requested', 'timeout')`, sticky, as R1 does for action timeouts (`src/speech/capture.mjs:266`). The gate has no per-send cancel; `launched(token, cancel)` only kills a running cscript (`sendguard.mjs:237-240`).
  3. **Established physical quiescence**: only when `guard.quiesce(ms)` returns quiet (`!inflight && live.size === 0`, `sendguard.mjs:273`) after disarm. Even then, a key already written to the socket or sent by cscript **cannot be recalled** (`VENDORED.md`, D-40). Record it as `quiescence: 'QUIET_AFTER_STOP'` or `'LIVE_AT_TEARDOWN'`, never `'VERIFIED'`, and keep `guarded_execution_verified` false unless a later review defines otherwise.
- **Per-action wrapper.** Each R2 `execute` must reproduce R1 `key()` (`src/speech/capture.mjs:255-275`):
  1. a fresh foreground/page check;
  2. `guard.arm(step)`;
  3. send with `{capture:false}`;
  4. `guard.disarm()`;
  5. `await setImmediate`;
  6. `guard.idle(t)`, and if not quiet, `guard.stop`.

## 6. Keys and typed values (Q4)
- **Supported initial press set:** `Tab`, `Shift+Tab`, `Enter`, `Space`. `pageKeyOf` confirms exactly Tab/Space/Enter (± Shift) (`sendguard.mjs:30,37-38`), and R1 already exercised these (`fixtures/r1/steps.json`).
  - Possible browse-mode interception of Enter or Space is an evidence item. R1 ran with `virtualBuffers.enableOnPageLoad=false`; the R2 profile must reuse that setting or re-qualify.
- **Refused before any provider call:** `Escape`, `ArrowUp/Down/Left/Right`, `Home`, `End`.
  - These pass `decodeSpec`, because they are in `KEYS` in `packages/contracts/palette.mjs`.
  - Through the gate they are **physically delivered first** and only then halted as misdelivered (`sendguard.mjs:37,48,255-258`). See F-1.
  - Do not expand `PAGE`. It is frozen R1.
- **Typed values.** Only the sendkeys class `[A-Za-z0-9@.]` is supported, one character per admission (`runVbsScript.js:17,27-29`, `NVDA.js:700-705`).
  - `test.user@example.com` is supported.
  - `Asha Test` is **not** supported as one `type`, because of the space. A space could be sent as a separately guarded `Space` press between two typed runs. That mixes the NVDA-key path and the sendkeys path inside one palette value, and needs an explicit decision (**D-SPACE**).
  - `invalid-email` is **not** supported (hyphen). Changing the palette, for example to `invalid.email`, is an owner contract decision (**D-PALETTE**), not an implementation detail.
  - Until both are decided, typing stays refused as it is now (`worker.mjs:49`). See F-2 for the partial-send hazard.

## 7. Minimal provider/executor interface for Codex's next bounded step
This is an interface only. Everything is **offline and fake-backed** until D-OBS is resolved and a final review passes.

```text
loadGuarded(cfg) -> {guard, nvda, NVDAClient, integrity}
  - New Tabwise loader. It must NOT import scripts/r1.mjs; that module runs runR1.
  - The same order as r1.mjs:
    1. check the R1 baseline, fixtures/r1/lock.json and vendor_tree before any import;
    2. sendGate(...);
    3. setGate (one-shot);
    4. vreq NVDA.js;
    5. setIntegrity(vendorIntegrity).
  - Dynamic import only after verification (F-4).

createObserver({NVDAClient, getGate, relayOwnerPid, expectRelayPid, deadlineMs}) -> SpeechProvider
  SpeechProvider.read() -> {source, session, connected, complete, phrases[]}   // §4.2
  SpeechProvider.journal() -> [{seq, t_node_ms}]                              // disclosure only
  SpeechProvider.close()   // disconnect; idempotent; teardown step 4 only
  Invariant: no code path references sendKeyCode / enqueueAndTap / spokenPhraseLog.

createExecutor({guard, nvda, check, allowed: SUPPORTED_PRESS}) -> execute(action, {signal})
  1. refuse unless action.press ∈ SUPPORTED_PRESS (never sends)
  2. signal.aborted ? refuse : signal.onabort = () => guard.stop(..., 'timeout')
  3. R1 key() wrapper (§5) with nvda.press(k, {capture:false})
  4. resolve {settled:true, guard: guard.status()}; never claims quiescence

preflightJourney(spec) -> throws before any provider is constructed if any step's press ∉ SUPPORTED_PRESS
  or any typed value fails /^[A-Za-z0-9@.]+$/ over the whole string.
```

## 8. Findings (most severe first)
Existing defects are F-1 to F-7, in this snapshot. Missing live implementation is listed separately in §8.2.

### 8.1 Existing defects

**F-1: HIGH (latent; becomes a physical-send defect on binding).** Unsupported keys reach `execute`.
- **Where:** `src/r2/capture.mjs:15-21` accepts any non-modifier key; `scripts/tabwise/worker.mjs:49` refuses only `type`; `packages/contracts/palette.mjs` `KEYS` includes Escape, the arrows, Home and End; `src/speech/sendguard.mjs:37,48,255-258`.
- **Counterexample:** a spec with `steps:[{step:1,key:'Escape'}]` passes `decodeSpec` and is executed. With a real `nvda.press`, the gate admits, commits and writes the key. `release` then finds `{key:null}`, counts it as missing and calls `misdelivered`. The key has already reached the page and NVDA before the halt. The R2 tests treat ArrowDown and Escape as acknowledged, so the core gives no protection.
- **Evidence:** SOURCE-CONFIRMED for the path; INFERENCE for the physical effect.
- **Smallest correction:** a frozen `SUPPORTED_PRESS` set (§6), checked in the worker over the **whole journey** before `captureJourney`, and again inside the executor. Keep `capture.mjs` provider-agnostic.

**F-2: HIGH (latent).** Typed values are sent partially before refusal.
- **Where:** `NVDA.js:700-705` sends each character in its own `enqueueAndTap`; `runVbsScript.js:28-29` refuses a character only when it is reached.
- **Counterexample:** `type('Asha Test')` physically types `A`,`s`,`h`,`a`, then throws `R1_CHAR_REFUSED: " "`. `invalid-email` types `invalid` and is then refused. The page state is left half-mutated.
- **Today:** this is masked by `worker.mjs:49`.
- **Evidence:** SOURCE-CONFIRMED.
- **Smallest correction:** validate the whole string before the first character (`preflightJourney`). Keep `type` refused until D-SPACE and D-PALETTE are decided.

**F-3: MEDIUM.** The provenance gate runs **after** execution, and it trusts a self-asserted string.
- **Where:** `worker.mjs:50-51` checks `capture.source !== 'fake-nvda'` only after `captureJourney` has run every step. `result.source` is whatever the first `speech.read()` returned (`capture.mjs:67`).
- **Counterexample:** providers whose `execute` is real and whose `speech.read` returns `source:'nvda'`. Every step executes, then the worker throws. Conversely, a real executor paired with a speech provider that claims `'fake-nvda'` passes the check.
- **Evidence:** SOURCE-CONFIRMED.
- **Smallest correction:** `runOfflineWorker` builds its own fake executor, or checks a module-private brand (WeakSet membership) on the providers **before** calling `captureJourney`. Never authorize on `sample.source`.

**F-4: MEDIUM.** R1 baseline coverage is narrower than what the worker loads, and it is checked **after** imports.
- **Where:** `scripts/check-r1-baseline.mjs:7-11` hashes only `r1.yml`, `scripts/r1.mjs` and `package-lock.json`. `scripts/tabwise-run.mjs:3-5` statically imports `worker.mjs`, which imports `src/r2/capture.mjs`, `src/speech/capture.mjs`, `sendguard.mjs` and `runguard.mjs` (`worker.mjs:1-4`). The check runs only afterwards, at `tabwise-run.mjs:7`.
- **Counterexample:** a commit that makes `judgeKeys` return `[]` unconditionally, or relaxes `ciGuardErrors`, passes the baseline, and the modified module has already been evaluated.
- **Evidence:** SOURCE-CONFIRMED.
- **Smallest correction:**
  - Also verify every `fixtures/r1/lock.json` sha256 (which covers sendguard, capture, runguard, foreground, vendortree, browser, r1.mjs and r1.yml).
  - Verify the `VENDORED.md` vendor-tree hashes.
  - Make the entry point import nothing but `node:` built-ins and the checker, then `await import()` the worker only after `ok`.

**F-5: MEDIUM (latent).** `liveGate` approval is a repo string that is not bound to the reviewed content.
- **Where:** `worker.mjs:40-41` passes when `review-status.json` has `verdict === 'PASS'`; reviewer, review_ref and the content scope are not checked.
- **Counterexample:** one commit sets `"verdict":"PASS"` and changes provider code. Only the unconditional throw at `worker.mjs:44` stops it today.
- **Evidence:** SOURCE-CONFIRMED.
- **Smallest correction:**
  - Require a non-null `reviewer`, a `review_ref`, an `owner_approval_ref` (the DECISIONS.md entry, §15) and a `reviewed_sha256` over an explicit, sorted file list. Recompute that hash at run time.
  - Note that any repo-held status file is self-attesting to anyone with write access to `main`. The real controls stay branch protection plus the owner's per-dispatch approval.

**F-6: MEDIUM.** The patch network denylist can be bypassed.
- **Where:** `worker.mjs:34`.
- **Counterexamples (none matches the regex):**
  - `<img src="//x.example/p">` and `<link rel=prefetch href=//x.example>`
  - `<form action=//x.example>` and `<meta http-equiv=refresh content="0;url=//x.example">`
  - CSS `@import url(//x.example)`
  - `navigator.sendBeacon('//x.example')` and `new EventSource('//x.example')`
  - `import('//x.example/m.js')` and `location='//x.example'`
  - `(0,fetch)('//x')`, `self.fetch?.('//x')` and `window['fe'+'tch']`
- **Evidence:** SOURCE-CONFIRMED for the regex; INFERENCE that the bypasses fetch, since the browser is not implemented.
- **Smallest correction:** keep the regex as a lint only. Enforce at the network layer: a context-level route that aborts every request failing `allowLoopback` (`worker.mjs:7`, re-checked on redirects at the route layer), service workers blocked, WebSockets routed or blocked, and no DNS prefetch.
- **Not verified here:** the exact Playwright options (`serviceWorkers:'block'`, WebSocket routing) and their version support are EXTERNAL-UNVERIFIED. Confirm them via Context7 at implementation time.

**F-7: LOW.** Artifacts are uploaded without verification, and the manifest's runner identity is self-asserted.
- **Where:** `.github/workflows/tabwise-run.yml:45-52` (`if: always()`); `worker.mjs:56` (runner block written by the worker, `head_sha` zeros in the synthetic case); `packages/contracts/schemas.mjs`.
- **Counterexample:** a failed or partial run uploads whatever is in `runner.temp/tabwise-evidence/`, and its manifest can claim any `head_sha` or actor.
- **Evidence:** SOURCE-CONFIRMED.
- **Smallest correction:** ingestion (§6.6) must reconcile `manifest.runner` against the GitHub API run record (run id, attempt, workflow path, event, head_sha, actor) and re-verify every sha256. A partial upload must be classified as INCONCLUSIVE evidence, never scored.

**Informational, no change required now (SOURCE-CONFIRMED):**
- Per-run `concurrency` (`tabwise-run.yml:21-23`) matches §6.5 by design. The `TOTAL_WORKERS` 2 and `PUBLIC_WORKERS` 1 caps must be enforced by the backend lease.
- `run-name` (`tabwise-run.yml:3`) displays an unvalidated `run_id`. It is display-only and never reaches a shell.
- `timeout-minutes: 5` (`tabwise-run.yml:29`) is setup-only. Set it to 1.5× the measured worst case, capped at 25, after 5b.
- The pinned action SHAs (`tabwise-run.yml:32,36,47`) cannot be checked offline.

**Positive controls observed (SOURCE-CONFIRMED):**
- Inputs reach the script only through `env` (`tabwise-run.yml:40-44`), so there is no expression injection into `run:`.
- `permissions: contents: read`, `persist-credentials: false`, no secrets, no `npm ci`.
- `decodeSpec` runs before `liveGate` (`tabwise-run.mjs:8-10`), and every error exits 2.
- `liveGate` always throws (`worker.mjs:44`).
- The R2 core fails closed on disconnect, session reset or prefix rewrite, clock regression, late acknowledgement, and boundary-crossing speech or page events (`capture.mjs:49,63-65,81,97,101-104,147`).

### 8.2 Missing live implementation (not defects; each blocks PASS)
1. The `loadGuarded` loader (§7) and its integrity sequence.
2. The observer (§4) and D-OBS evidence E-1…E-5.
3. The real page provider: continuous keydown/focus/app-event log with page-monotonic clock, `complete` semantics, and reset detection. `browser.mjs`'s `__r1Keys` is the model.
4. The foreground provider wiring.
5. The executor (§5) with abort → `guard.stop` and the R1 `key()` wrapper.
6. Browser network isolation (F-6) and the loopback fixture server.
7. Screenshots and axe as separate lanes.
8. Teardown in the §4.2 order.
9. Evidence written to `RUNNER_TEMP` with a hashed manifest.
10. Persisted run intent (`onIntent`) before the first send.
11. Ingestion and identity reconciliation (F-7).
12. Verdict reconciliation against real capture records.
13. The 5b timing measurement that sets `observationMs` and `timeout-minutes`.

## 9. Required failing tests, then acceptance criteria (offline first)
Write each test red first, against fakes. No NVDA, browser or network.

1. **T-F1.** A spec containing `Escape`, any arrow, `Home` or `End` throws before **any** provider method is called; the spy counts are zero for `execute`, `speech.read` and `page.read`. The same holds for an unsupported key at step N>1: step 1 must not execute either.
2. **T-F2.** For `type` with `'Asha Test'` and with `'invalid-email'`, zero sendkeys calls happen. Use a fake `sendKeys` spy injected via the loader's test seam, never by patching vendor.
3. **T-F3.** `runOfflineWorker` with an `execute` spy and a `speech.read` claiming `'fake-nvda'`, but without the private brand, throws with zero `execute` calls. With an unbranded provider claiming `'nvda'`, zero `execute` calls too.
4. **T-F4.** Changing one byte of `src/speech/sendguard.mjs` (in a temp copy of the tree) makes the entry point refuse **before** `worker.mjs` is imported. Assert it via an import-side-effect marker.
5. **T-F5.** `review-status.json` with `verdict:'PASS'` but null reviewer, missing `owner_approval_ref` or a mismatched `reviewed_sha256` still blocks. The unconditional throw stays until final review.
6. **T-F6.** Every counterexample in F-6 is refused by the route predicate in a pure unit test of the routing decision function: every URL form, including `//host`, redirects to non-loopback hosts, `ws:` and `blob:` creating fetches.
7. **T-OBS-1.** The observer module's source contains no reference to `sendKeyCode`, `enqueueAndTap` or `spokenPhraseLog`. A fake `NVDAClient`'s send methods throw if called, and a full fake journey never triggers them.
8. **T-OBS-2.** A fake client emitting `speak` ×3, then `close`, gives `read()` phrases in order with a stable session. After `close`, `connected:false` and the gate is stopped (fake gate). `captureJourney` then yields `disconnected`.
9. **T-OBS-3.** `relayOwnerPid` returning a different pid after observer connect makes setup fail with the gate stopped and zero `execute` calls.
10. **T-OBS-4.** The teardown order is asserted by call log (§4.2). If `nvda.stop` precedes `observer.close`, the test fails.
11. **T-EXEC-1.** `signal.abort()` during a pending fake `press` calls `guard.stop(_, 'timeout')` exactly once. The record shows `settled:false`, `cancellation_requested:true`, and `quiescence ≠ 'VERIFIED'`.
12. **T-EXEC-2.** `press` is always called with `{capture:false}`. A call with `{}` or `undefined` options fails the test, because of the `DEFAULT_CAPTURE` trap.
13. **T-EXEC-3.** A fake R1 `release` that confirms at 1,100 ms after the executor request yields R2 `incomplete`. R2 never reads R1's acknowledgement result as its own `ack_seq`.
14. **T-ACK-SEP.** R2's page-log cursor and the fake R1 `pageAck` cursor are independent. Advancing one never advances the other.

**Acceptance criteria for this bounded step:**
- All of the tests above pass.
- The existing 40 still pass.
- No file in `fixtures/r1/lock.json`, `VENDORED.md` or the R1 baseline changed: the baseline and lock re-verify.
- `liveGate` still throws unconditionally.
- No new dependency.
- The `review-status.json` verdict stays BLOCK.

## 10. Safety checklist items (§6.5) that cannot yet PASS
1. **R1 frozen.** Partial. The baseline covers 3 files (F-4); the lock and vendor tree are not verified by the Tabwise entry.
2. **Guards reused.** Not yet. There is no loader or executor; capture-off composition is unproven at runtime.
3. **R2 contract unchanged.** OK in offline scope. The `speech.read` binding depends on D-OBS.
4. **Loopback and no egress.** Not yet. The predicate exists; there is no route-level enforcement (F-6).
5. **Workflow identity.** Partial. `workflowGuardErrors` exists; ingestion reconciliation is missing (F-7).
6. **Permissions.** Statically acceptable in this scaffold.
7. **Input delivery.** Not yet. The key allowlist and whole-value typing preflight are missing (F-1, F-2); D-SPACE and D-PALETTE are open.
8. **Cancellation and timeouts.** Not yet. Abort → `guard.stop` mapping, teardown order and the measured `timeout-minutes` are missing.
9. **Evidence integrity.** Partial. The offline manifest verifies; real-run manifest and ingestion are missing.
10. **Actions policy.** Not assessed here (D18a; owner/GitHub Support).

## 11. Decisions this review surfaces (owner)
- **D-OBS** (§4.5): authorize or decline the observer-equivalence qualification run. This is the smallest decision that unblocks the observation design.
- **D-SPACE** (§6): whether a palette value may combine sendkeys runs with a separately guarded Space press.
- **D-PALETTE** (§6): replace `invalid-email` with a sendkeys-safe invalid value, or drop typed invalid input from P0.
- **(Optional) D-STOPSPEECH** (§5): whether a separately gated stop-speech action may precede each R2 action window.

---
*End of report. I made no code changes, have no runtime NVDA, relay or browser observations, and award no worker PASS. Live binding and execution remain **BLOCKED**.*
