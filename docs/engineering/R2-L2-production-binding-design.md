# R2-L2 — production binding design (DESIGN ONLY, not implemented)

Branch `design/tabwise-r2-l2-boundaries`, baseline `a8232fefa431f449be2f0de398966b6eb68504cc` (`main` after PR #8). Written by Claude as the primary engineering agent; ChatGPT is the independent reviewer. Revision 2 after the independent review "CHANGES REQUIRED" (findings 1–10, mapped in §0.1); revision 3 applies the final corrections H1, H2, M1 and M2 (mapped in §0.2) and changes nothing else. Documentation only: no code, test, workflow, status, vendor, fixture or frozen-R1 change; nothing was executed against a browser, desktop input or NVDA. Uncommitted.

Line references are to the baseline. "MEASURED" means read from source or from a command in this session; "INFERENCE" means reasoned but not observed; "PHYSICAL" means only a hosted experiment can settle it.

Status this design does **not** change: `liveGate` throws (`scripts/tabwise/worker.mjs:25-32`); `scripts/tabwise/review-status.json` is `BLOCK`; `scripts/tabwise/qualification-status.json` is `enabled:false`, `BLOCK` (D-74 retired). All R2 evidence is synthetic/UNATTESTED. Incremental budget is ₹0 until a separate owner approval. This document authorizes nothing.

---

## 0. Summary

R2-L2 closes gap **G2** (real guard/executor/receipt/observer composition) and specifies **G3** (real Chromium journal), **G5** (production provenance) and **G6** (journey teardown) from the R2-L0 gap table (`Tabwise-worker-binding-blocker.md:79-93`). G7–G13 stay open until a hosted run measures them.

The corrected design:

1. **One page per process.** Each fixture page runs in its own one-shot process: authentic runtime, NVDA start, one isolated browser context, one journal, one receipt ledger, one observer, one `captureJourney`, teardown, sealed evidence. A healthy/broken pair is two consecutive processes in the same hosted job. No speech connection is shared between pages. This matches the one-ledger-per-gate rule (`send-receipt.mjs:41`), the one-shot loader (`qualification-loader.mjs:17`) and the two-path document route (`network.mjs:4-5`) without changing any of them (§2).
2. **Fixture bytes stay frozen; the served document is a recorded transformation.** The runner verifies the fixture hash, then serves a copy whose single `<title>` text gains the run nonce. The transformation is deterministic and checked by the verifier, so the frozen foreground gate (`foreground.mjs:32-38`) is used unchanged (§2.2).
3. **Runner-owned page recorder** with a state contract that is a pure function of DOM attributes and text. Every state change is therefore accompanied by a real `MutationRecord`, so the unchanged provider rule at `page-provider.mjs:135` cannot refuse a legitimate read (§3).
4. **R2 key accounting** refuses Control and Insert keydowns. It resolves a standalone Shift through a bounded pending state instead of rejecting it on sight, and accepts a shifted Tab with no standalone Shift, recording that the prefix was not observed. Frozen R1 is unchanged (§4).
5. **Internal action ids `a1…an` map one-to-one to manifest task ids.** The map is recorded and recomputed by the verifier. Labels never pass through it (§2.4).
6. **Bounded evidence.** Page reads are stored as verified deltas with run-length coalescing of unchanged reads. A rejected raw snapshot is stored in full exactly once, and lane caps are checked against the run spec **before** the first input (§8.2).
7. **The runner can never self-label `qualified`.** Its highest class is `genuine-unqualified`.

Three R2-only source contract changes are required (§10): `alignTimeline` key semantics (C-1); a production speech payload builder (C-3); and, only if the owner chooses per-action visual evidence, a capture hook (C-2). None touches frozen R1, the vendor tree or the qualification files.

### 0.1 Review corrections

| # | Finding | Correction | Section |
|---|---|---|---|
| 1 | The foreground gate needs a nonce-bearing title, but fixture titles are ordinary | The fixture hash is checked, then exactly one `<title>` text is rewritten as `"<title> <nonce>"` in the served copy. The transformation and the served hash are recorded and recomputed by the verifier. The document title, URL, nonce, Chromium PID and fixture hash are all checked before the first input. The nonce is redacted in model payloads. `foregroundMismatch` is unchanged | §2.2 |
| 2 | The single-page session conflicted with the same-session silence rule, one ledger per guard and whole-journey capture | Option A, one one-shot process per page, is chosen; Option B (a multi-page ledger extension) is compared and rejected. The silence rule is restated per hosted run, not per speech connection, and left pending as **O-4** | §2.1, §6.4 |
| 3 | Shift+Tab accounting could reject a legitimate partial read | A pending Shift resolves within a bounded window. An intent is never treated as a commit. A shifted Tab is checked against the owned action. A Tab with shift and no standalone Shift is accepted and recorded as `shift_prefix:'not-observed'`. Everything else fails closed | §4.3 |
| 4 | Task ids vs `a[0-9]+`, and `alignTimeline` Space / Shift+Tab | A recorded, verified bijection `a<i>` ↔ task id. The fix is an R2-only change to `alignTimeline` (C-1) that uses `expectedKey` semantics; the current scorer does not support those keys | §2.4, §10 |
| 5 | Cumulative snapshots could exceed the lane cap | Delta reads with prefix hashes, coalesced unchanged reads, one full rejected snapshot, a reconstruction verifier, and caps checked before input. Exceeding a cap fails closed | §8.2 |
| 6 | State could change without a mutation | State is limited to attribute- and text-derived values. `url_path` and `hidden_focus` are removed, and URL and title become identity checks. Live text is stored verbatim and bounded (no async hashing). No provider change is needed | §3.3 |
| 7 | The brand/import graph was inconsistent; the fake brand had no trust boundary | The session imports only `isQualificationRuntime`. The entry alone dynamically imports and calls `loadQualificationRuntime`. There is no fake brand: unbranded runtimes are always `synthetic`. Static tests check this exact graph. The one-shot scope is stated honestly | §1 |
| 8 | No per-action screenshot API | Visual evidence is pre-journey and post-journey only (no new API). Per-action visual needs the R2 capture hook C-2, left as **O-9**. Axe and visual provenance are recorded in separate lanes | §8.3 |
| 9 | App event sink | Optional instrumentation. It is never required of withheld fixtures, never added to fixture bytes, never used for scoring. Page-authored events are kept separately | §3.4 |
| 10 | Slices and decisions | S1–S7 have been rewritten, the contract changes are listed explicitly in §10, and O-1 to O-9 are reconciled | §11, §14 |

### 0.2 Revision 3 corrections (final review)

| ID | Finding | Correction | Section |
|---|---|---|---|
| H1 | An unbranded runtime could still reach real browser launch, NVDA, the foreground helper or input, merely labelled `synthetic` | The authentic session refuses an unbranded runtime **before** it creates or imports any real capability. Offline fakes enter only through a separate composition module, `r2-compose.mjs`. That module receives already-built handles, imports no launcher, loader, vendor or helper, assigns no provenance, and is not reachable from the entry | §1.2, §1.3, §11 (S5a/S5b) |
| H2 | The raw observer speech lane has no action identities | Model-facing speech comes only from `captureJourney`'s validated per-action records, through an exact field allowlist. Raw speech is kept separately and is used only for provenance re-verification. `speechModelPayload` stays synthetic-only; a production builder (C-3) is specified | §8.3, §8.6, §10 |
| M1 | Nonce redaction | Both the literal and the NVDA-spaced forms are redacted from a copy, with every transformation recorded. The raw transcript is never changed. If sanitization is ambiguous, the page is refused for model use | §8.7 |
| M2 | Page isolation overstated | "Impossible" is replaced by the actual provisional guarantee and its limit. P-11 stays an unresolved physical question | §2.1, §6.3 |

---

## 1. Capability ownership and import graph

### 1.1 What exists (MEASURED)

- `loadQualificationRuntime` (`qualification-loader.mjs:9-35`) does several things:
  - checks frozen integrity, then dynamically imports sendguard, vendortree and foreground;
  - refuses if vendor modules are already in `require.cache` (`:17`);
  - creates one `sendGate` and registers it (`:20`), then creates the NVDA instance (`:21`);
  - installs the integrity closure (`:31`), which can include `additionalIntegrity` (`:28`);
  - returns a frozen runtime object (`:33`) and brands it in a module-private WeakSet (`:7-8,34`).
- The existing observer qualification already follows the shape this design needs:
  - its entry imports the loader dynamically and calls it (`tabwise-observer.mjs:23,27`);
  - it refuses an unbranded runtime (`:27`);
  - the core imports only `isQualificationRuntime` (`qualification-core.mjs:7`) and labels provenance from the brand: `'owned-vendored-runtime'` versus `'injected-offline-test'` (`:13`).
- The executor and observer take destructured live handles (`executor.mjs:6`, `observer.mjs:6`), so they must only ever be called from inside the session.

### 1.2 Module graph (production)

```
scripts/tabwise-r2.mjs  (entry; --run | --page <id> | --check-only)
 ├─ static: node built-ins, ./check-r1-baseline.mjs, ./tabwise/r2-policy.mjs, ./tabwise/r2-evidence.mjs,
 │          ./tabwise/qualification-integrity.mjs, ./tabwise/qualification-crash.mjs, ./tabwise/network.mjs
 ├─ --page only, after approval + clean-tree checks:
 │    await import('./tabwise/qualification-loader.mjs')  -> loadQualificationRuntime, isQualificationRuntime
 │    refuse unless isQualificationRuntime(runtime)
 │    await import('./tabwise/r2-session.mjs')           -> runR2Session(runtime, data)
 └─ --run: spawns `node scripts/tabwise-r2.mjs --page <id>` once per planned page, sequentially;
           never imports the loader or the session; runs the offline run-level verifier (S3) at the end

scripts/tabwise/r2-session.mjs   (authentic only; exports runR2Session only)
 ├─ static: ./qualification-loader.mjs -> isQualificationRuntime ONLY (same as qualification-core.mjs:7)
 ├─ static: ./r2-compose.mjs -> composeR2Page
 ├─ after the brand check only (dynamic): playwright (Chromium launch), ./network.mjs (createIsolatedContext),
 │          the runtime's foreground probe factory, ./observer.mjs (real relay socket), ./executor.mjs,
 │          ./observer-qualification.mjs (createQualificationTeardown), @axe-core/playwright
 ├─ static: ../../src/speech/foreground.mjs -> foregroundMismatch (pure; the probe itself comes from the runtime)
 └─ builds real handles from the branded runtime, then calls composeR2Page(handles, data)

scripts/tabwise/r2-compose.mjs   (capability-free composition; exports composeR2Page only)
 ├─ ../../src/speech/sendguard.mjs -> pageAck   (no import of foreground.mjs: it also exports foregroundProbe and imports node:child_process)
 └─ ../../src/r2/{capture,page-journal,page-source,page-recorder,send-receipt,step-map}.mjs
```

Rules:
- **Only `scripts/tabwise-r2.mjs` (R2) and `scripts/tabwise-observer.mjs` (existing) reference `loadQualificationRuntime`.**
- `r2-session.mjs` and `r2-compose.mjs` do not contain that identifier.
- Only `scripts/tabwise-r2.mjs` imports `r2-session.mjs`. Only `r2-session.mjs` and test files import `r2-compose.mjs`; the entry never imports it, and no CLI flag or environment variable selects it.
- `r2-session.mjs` exports exactly `runR2Session`; `r2-compose.mjs` exports exactly `composeR2Page`.
- `r2-compose.mjs` has no static or dynamic import of `playwright`, `@axe-core/playwright`, `node:child_process`, `node:net`, `node:fs`, `./network.mjs`, `./observer.mjs`, `./executor.mjs`, `src/speech/foreground.mjs`, the loader or `vendor/`. It names no function that launches a browser, starts NVDA, spawns the foreground helper or opens a socket.
- `--run` mode never loads a runtime. Each `--page` child is a fresh Node process, so each has a fresh loader and module cache.

### 1.3 Authentic versus synthetic

**Synthetic execution boundary (H1).** "Synthetic" is an evidence label, not a permission. An unbranded runtime must never reach real capabilities, so the boundary is placed in code ownership rather than in labelling:

- **`runR2Session(runtime, data)` is authentic-only.** Its first statement is `if (!isQualificationRuntime(runtime)) throw Error('R2 session requires the owned vendored runtime')`. This runs before any `await`, before any dynamic import, and before any capability is created. There is no synthetic branch in this function.
- **Only after the brand check** does it dynamically import Playwright, `network.mjs`, the observer and executor modules and axe, and only then does it:
  - launch Chromium;
  - take `guard` and `nvda` from the branded runtime;
  - create the foreground probe through the runtime's foreground module;
  - open the observer socket.

  It then calls `composeR2Page(handles, data)` and attaches provenance `'owned-vendored-runtime'` to the result. Only this function assigns provenance.
- **`composeR2Page(handles, data)` is the fake-injection seam.**
  - `handles` is `{guard, getGate, nvda:{press,start,stop}, observer:{read,close}, foreground:{check,close}, page:{evaluate, screenshot, axe, close}, writer, clock, now}`. `foreground.check(ctx)` already returns the `foregroundMismatch(await probe.check(), {pid, nonce})` result, built by the session.
  - It composes the journal, ack reader, ledger, executor wiring and `captureJourney` from these handles only.
  - It returns a JSON-only result **without** provenance or class.
  - Offline tests call it directly with fakes. A result with no session-attached provenance is classed `synthetic` by the evidence writer and verifier (§8.4), so a fake can never be promoted.
- **What a fake can reach.** Through `composeR2Page` a fake reaches only the functions it supplied. The module imports nothing that launches a browser, starts NVDA, spawns the foreground helper or sends input (§1.2 rules). Passing real handles would require the branded runtime's live objects, which exist only inside a `--page` child after approval and are handed only to `runR2Session`.
- **Not exposed through the authenticated entry.** `scripts/tabwise-r2.mjs` imports only `r2-session.mjs`. It has no flag, environment variable or path that reaches `composeR2Page` directly, and it refuses an unbranded runtime before calling the session (as `tabwise-observer.mjs:27`). `r2-session.mjs` refuses it again.
- **No fake brand exists.** Nothing in production code builds or authorizes one.
- **No handles in results.** Both functions return JSON-only results. A test walks each result recursively and refuses any function or class instance.

**Tests for this boundary:**
- `runR2Session({})` and `runR2Session(destructuredRealLookingObject)` reject with the brand error.
- A module-cache assertion shows `playwright`, `network.mjs`, `observer.mjs`, `executor.mjs` and `@axe-core/playwright` were **not** loaded by that call.
- A static test parses `r2-compose.mjs` and `r2-session.mjs` imports and checks the §1.2 rules, including that every capability import in `r2-session.mjs` is dynamic and textually after the brand check.
- `composeR2Page` with fakes completes a Tab/Enter journey and its result has no `provenance` or `class`.
- The evidence writer classes it `synthetic`.

### 1.4 What the one-shot loader does and does not guarantee

- **Does:** within one process, a second `loadQualificationRuntime` call refuses once the vendor tree is in `require.cache` (`:17`). One process therefore gets at most one loader-created gate and NVDA instance.
- **Does not:** it is not a sandbox. Any code running in the same process can import modules or reach Node APIs, and the static import rules are code-review rules checked by tests. They show that the reviewed code follows the graph; they do not stop hostile code. The protection against unreviewed code is:
  - the integrity checks (clean tree, HEAD, reviewed digests);
  - per-send `checkSend` over `QUALIFICATION_FILES` plus `R2_FILES` through `additionalIntegrity`;
  - the review process.

### 1.5 Identity and integrity sequence (per page process)

1. Entry: `TABWISE_R2_ENABLED==='true'`, `checkR2Approval` (S4), clean checkout, `checkFrozenIntegrity`.
2. Integrity: `createQualificationIntegrity` (`qualification-integrity.mjs:12`) over the qualification scope, plus the same mechanism over `R2_FILES`. Both receipts go to the `events` lane before runtime load.
3. `loadQualificationRuntime({root, additionalIntegrity})` with `additionalIntegrity = () => [...qual.checkSend(), ...r2.checkSend()]`. The gate calls it in `admit` (`sendguard.mjs:184-185`) and again in `commit` (`:228-229`).
4. Brand check, then `assertAuthentic()`.
5. Per action: `assertAuthentic()` before arm and after disarm (as `qualification-core.mjs:52,57`), and `getGate() === guard`.
6. Teardown: `verifyPhase()` for both scopes, then `assertAuthentic()`. Any failure gives class `incomplete`.

`QUALIFICATION_FILES` (`qualification-policy.mjs:7-11`) and the loader are not edited.

---

## 2. Page lifecycle, fixture identity and action ids

### 2.1 Healthy/broken lifecycle: option comparison

| | A. One one-shot process per page (chosen) | B. Multi-page lifecycle in one process |
|---|---|---|
| Receipt ledger | One per gate per process. Fits `send-receipt.mjs:41` unchanged | Needs a ledger reset or multi-install extension to an R2 file, which reopens the M2B/D-79 invariants |
| `captureJourney` | One call per page with that page's whole journey. Fits as is | One call per page, but the gate, ledger and post-final stop checks (`binding.mjs:55-62`) span pages and need new rules |
| Isolated context | One `createIsolatedContext` per page serving `/index.html` (`network.mjs:4-5,21-25`) | Needs a context per page in one browser, or a route change |
| NVDA | Fresh `nvda.start` per page with reset receipt; `nvda.stop` at teardown | One NVDA instance across pages; delayed speech from page 1 could fall into page 2's windows |
| Speech | Separate observer connection per page | One connection; still a subscription, not loss-free |
| Cost | About one NVDA start/stop per page (P-11) | New R2 lifecycle code and review |

**Recommendation: A.** It changes no existing contract and gives each page its own NVDA start, observer connection and capture baseline. That provisionally separates delayed announcements between pages, within the limit stated in §6.3; it does not exclude them physically (P-11). Its cost is that the healthy page and the broken page never share a speech connection, and this design does not claim they do.

### 2.2 Per-page process lifecycle (Option A)

`--run` reads the approved run plan (fixtures, pair order, nonce seed) and spawns one `--page` child per page, sequentially, healthy then broken within each pair. The order is fixed in the plan and recorded. A child's non-zero exit stops the run: no later page starts, and the run is `incomplete`.

Inside each `--page` child:

1. **Fixture identity.**
   - Read the fixture bytes. Compute `fixture_sha256` (UTF-8, CRLF→LF, the convention in `contract.mjs:9-10` / `manifest.json` "hash").
   - It must equal the hash in the approved withheld manifest. Development fixtures are allowed only for the unscored dress rehearsal (`assertEvaluable` refuses them for scoring).
2. **Title transformation `title-nonce-suffix/1`.**
   - `nonce = randomBytes(4).toString('hex')`, the same format `qualificationFixture` enforces (`qualification-providers.mjs:4`).
   - The normalized text must contain exactly one match of `/<title>([^<]+)<\/title>/i`, with non-empty trimmed text. Otherwise the page is refused (it is never repaired).
   - `served = text.replace(match, "<title>" + title + " " + nonce + "</title>")`.
   - Record `{transform:'title-nonce-suffix/1', fixture_sha256, served_sha256, original_title, nonce, match_offset}` in the `events` lane and the manifest.
   - The verifier re-applies the transformation to the fixture bytes and must reproduce `served_sha256` exactly. The fixture files and their registered hashes are never changed.
   - Development titles are short ("Newsletter sign-up", "Drafts", "Notification settings"; MEASURED). All six development pages are 1317–2074 bytes, far under the 100 000-byte limit of `createIsolatedContext` (`network.mjs:9`).
3. **Browser.**
   - Owned Chromium with `BROWSER_ARGS`; record the browser PID.
   - Create `createIsolatedContext(browser, {port, source: served})`, then add the R2 recorder init script (§3).
   - Navigate to `http://127.0.0.1:<port>/index.html`.
4. **Pre-input identity check.** All of the following must hold before arming anything, or the page is refused:
   - the recorder read shows `session` equal to this page's session id;
   - `title === original_title + " " + nonce`;
   - `location.pathname === '/index.html'`;
   - `network_restrictions === true`, `complete === true`, `active === 'body'`;
   - `foregroundMismatch(await probe.check(), {pid, nonce})` is `[]`, waited for as in `qualification-core.mjs:45-47`.

   The result `{fixture_sha256, served_sha256, pid, nonce, title}` is written to `events` as `phase:'pre-input-identity'`.
5. **NVDA.** `nvda.start` with the settings reset receipt and read-back (`qualification-core.mjs:38-41`), then the relay owner PID check, then the observer (§6).
6. Wire the journal, ack reader, ledger and executor; run `captureJourney` (§5).
7. Teardown, which ends with `nvda.stop()` (§7). Then the integrity phase checks, then seal.

**Foreground during the journey.** The frozen gate checks the PID and the nonce in the title on every send (pre and post verdicts, `sendguard.mjs:205-210,260-263`). If a fixture script changes `document.title` mid-journey and drops the nonce, the next send is refused. That is fail-closed and is recorded as such; the gate is not weakened.

**Speech effect of the title.** NVDA may speak the window title, including the nonce, on load and whenever focus returns to the document. The dialog-focus broken page is a likely case.
- Raw speech is kept verbatim in the `speech` lane and in `capture.json`.
- Model payloads are built from a redacted copy in which the literal and the NVDA-spaced forms of the nonce are replaced with the fixed token `[run-nonce]`. Every transformation is recorded and the verifier recomputes it. Ambiguous sanitization makes the page ineligible for model use (§8.7).
- Healthy and broken pages get the same transformation, so the nonce carries no label information.
- Scoring hypotheses (e.g. `"enter your email address"`) do not involve the title.

### 2.3 Independence of the two pages

Each page has its own:
- process, gate, ledger, NVDA start/stop, observer connection, browser and context;
- recorder session id, nonce, evidence directory and manifest.

The run-level manifest (S3) lists each page manifest's sha256 together with the plan, the order and the child exit codes.

### 2.4 Task ids ↔ action ids

- Manifest task ids are strings such as `to-email`, `submit`, `close` (MEASURED). The ledger requires `/^a[0-9]{1,12}$/`, unique ids, and at most 1000 actions (`send-receipt.mjs:42-44`).
- **Mapping `tabwise-r2-step-map/1`:**
  - For a task list `T` in manifest order: `action[i] = 'a' + (i+1)`, so the map is `{action:'a'+(i+1), task:T[i].step, press:T[i].press}`.
  - Task ids must be unique and match `/^[a-z][a-z0-9-]{0,63}$/`, and presses must be in `SUPPORTED_PRESS`. Otherwise the page is refused before launch.
  - The map is a bijection and is reversed by lookup.
- **Where each id is used:**
  - Capture, ledger, intents, receipts and executor labels (`tabwise:a<i>`) use action ids.
  - Model payloads, model claims, `alignTimeline` output and scoring use task ids. The map is applied once, when payloads are built from sealed evidence.
- **Labels never pass through the map.** Independent labels (`labels.development.json` shape: `locus:{step, element}`) are read as written. `judgePage` compares the claim locus, in task ids, with the label locus.
- The verifier recomputes the map from the approved manifest and refuses if it differs from the recorded one.

---

## 3. Real Chromium page journal

### 3.1 Why the existing scripts cannot be used (MEASURED)

- **Qualification page script** (`qualification-providers.mjs:16-25`):
  - records `focusin` as `focus`;
  - has no event `active`, no `ctrl`/`alt`/`meta`/`repeat`, and no `session`/`clock`/`t`/`state`/`event_count`/`overflow`/`dropped`;
  - so `page-journal.mjs:31,33,36` refuse it.
- **Development fixtures** carry their own recorder (`window.__r2Events`, written through `r2.app`/focus listeners in the page). It is page-authored and page-mutable. The fixtures are hash-pinned and are not edited.

### 3.2 Recorder (`src/r2/page-recorder.mjs`)

- **Installation and identity:**
  - One pure init-script function, installed after `createIsolatedContext`'s own init script and before any page script.
  - Its state lives in a closure. The only globals are `__tabwiseR2Journal` and `__tabwiseR2App`, both defined non-writable and non-configurable.
  - The session id is passed in as an init-script argument.
- **Element identity:**
  - `null`, `document`, `documentElement` and `body` map to `'body'`.
  - Any other node maps to `"<id or tag>#<ordinal>"`, where the ordinal comes from a WeakMap and is never reused.
  - The bare `id` is also recorded as `element`, for label matching.
  - The ordinal is necessary because the dialog-focus broken fixture replaces the button with a clone that has the same id.
- **Listeners** (capture phase, passive, on `window`):
  - `keydown` records `key, code, location, shift, ctrl, alt, meta, repeat, isTrusted, target, element`;
  - `focusin` and `focusout` record `target, element, related, isTrusted`;
  - a `MutationObserver` on `document` (subtree; childList, attributes, characterData) appends one `mutation` event per record, with `target, element, mutation, attribute, added, removed`.
- **Timestamps and active element:** each event's `t` is `performance.now()` taken in the listener, and `active` is the identity of `document.activeElement` taken in the listener.
- **Caps and loss:**
  - The caps are 1000 events and 262 144 bytes, the adapter defaults (`page-journal.mjs:57`).
  - An event that does not fit, or a clock regression, sets `overflow` or appends a reason, increments `dropped`, and sets `complete:false`.
  - Nothing is compacted, and the adapter refuses any such read (`page-journal.mjs:20-23`).
- **Read** (`__tabwiseR2Journal()`), synchronous:
  1. Call `observer.takeRecords()` and append those records as `mutation` events.
  2. Compute `state` and the identity fields.
  3. Take `t` and return `structuredClone` of `{session, complete, clock:'page-monotonic-ms', t, active, title, url, state, event_count, overflow, dropped, events, page_reported, reasons, network_restrictions}`.

  Because the whole read runs in one synchronous turn, no page task can interleave between the flush and the state.

### 3.3 State contract (finding 6)

`state` is a pure, synchronous function of DOM **attributes and text**. Therefore any change to it requires a DOM mutation, and the `takeRecords()` flush puts that mutation in the same read. The unchanged provider rule "state changed ⇒ mutation or app event in delta" (`page-provider.mjs:135`) then holds for legitimate pages.

```
state = {
  dialogs: [ident...],          // elements matching dialog[open], [role=dialog]:not([hidden]), [role=alertdialog]:not([hidden])
  invalid: [ident...],          // [aria-invalid="true"]
  live: [{target, role, aria_live, text}],   // [role=alert],[role=status],[role=log],[aria-live]; text = textContent
}
```

- Each list is in document order with at most 16 entries. Each live `text` is at most 512 UTF-16 units. Exceeding either sets `state_overflow:true`, and the R2 page source refuses that read. Nothing is truncated or silently omitted.
- **Removed** from revision 1:
  - `url_path`: a history change can happen without a mutation;
  - `hidden_focus`: computed visibility can change through CSS without a mutation;
  - DOM properties that are not attributes, such as `checked` and `value`.

  The scorer does not need any of them.
- **Identity, not state.** `title` and `url` are checked on every read by the page source:
  - `url` must stay `http://127.0.0.1:<port>/index.html`;
  - `title` must stay equal to the served title.

  A change refuses the read with the reason recorded. It is never smuggled into state, and focus changes are never renamed as mutations.
- **No in-page hashing.** `crypto.subtle.digest` is asynchronous; the DOM could change between the read and the hash resolving, which would desynchronize state from events. Live text is therefore stored verbatim (bounded above), and Node computes any sha256 in the evidence layer.

**Provider dependency.** No R2 provider or adapter change is needed for state. The provider's focus rules (`page-provider.mjs:110-134`) apply to real focus events unchanged. P-1 checks them against real Chromium ordering. If P-1 finds a legitimate Chromium sequence the provider refuses (for example a `focusout` whose snapshot names a third element), that would be a separately reviewed R2 provider change with its own RED test. It is not assumed here.

### 3.4 App events and page-reported data (finding 9)

- **The sink is optional instrumentation.**
  - The recorder defines `__tabwiseR2App(name, detail)`. A call appends `{type:'app', name, detail, source:'page-authored'}`, with `detail` limited to JSON and capped at 1 KB.
  - Withheld fixtures are **not required** to call it, and fixture bytes are never edited to add calls.
  - Scoring (`judgeR2`, `judgePage`) never reads app events.
  - The manifest's `expect_app` fields are author expectations, not evidence.
- **The development fixtures' own `__r2Events`** are copied at each read into `page_reported` (bounded, 64 KB; overflow refuses). They are labelled `provenance:'page-authored'` and never merged into `events`.
- **Runner-observed versus page-authored.** Runner-observed events are the listener-recorded `keydown`, `focusin`, `focusout` and `mutation` events. `app` and `page_reported` are page claims and are never taken as truth. Since state is mutation-backed (§3.3), the provider never needs an app event to accept a state change.

### 3.5 Node page source (`src/r2/page-source.mjs`)

`createR2PageSource({evaluate, session, served, journey, writer, now})` → `{read(), pending()}`. `evaluate` is the session's private Playwright binding.

`read()` performs one `evaluate(() => window.__tabwiseR2Journal())`, then works in this order:
1. **Raw evidence (§8.2):** writes the delta record to `page-reads`.
2. **Refusals.** It throws, which `page-journal.mjs:69` latches, on any of:
   - wrong `session`;
   - `network_restrictions !== true`;
   - `title` or `url` differing from the served identity;
   - `state_overflow`;
   - `isTrusted !== true` on a key or focus event;
   - a prefix differing from its own previous raw read;
   - any key-accounting refusal (§4.3).
3. Returns the raw object unchanged. Extra fields pass through.

### 3.6 Connection to the merged R2-L1 adapter

```
page --evaluate--> createR2PageSource.read() --> createPageJournal({source, writer})  (R2-L1, unchanged)
                                                   ├ snapshot() -> captureJourney page.read
                                                   └ keys(c)    -> pageAck({read})  (frozen R1) -> ledger -> guard.setAck
```

- **One adapter per page process**, so the R1 ack view and the R2 snapshot view share one accepted history.
- **Serialization.** R1's ack reader polls `keys()` inside `release` (`sendguard.mjs:249`; `pageAck` loop `:77-89`), while `captureJourney` polls `snapshot()` concurrently (`capture.mjs:249-255`). The adapter refuses overlapping reads (`page-journal.mjs:65`).
  - The session therefore routes both views through one single-flight queue (`serial()`, which chains promises).
  - The adapter's overlap refusal stays as the backstop.
  - Queueing adds at most one evaluate round-trip per read. It must fit inside the 1000 ms ack bound (P-5).
- `captureJourney` is called directly, not through `captureOfflineJourney`, so each journal has exactly one provider.

---

## 4. NVDA-generated keys

### 4.1 What reaches the page

| Source | Path | Sent in an R2 journey? |
|---|---|---|
| Stop-speech Control | `#stopReading` only when `capture` is truthy (`NVDAClient.js:328-329,394`) | No. The executor uses `{capture:false}` (`executor.mjs:31`) |
| Shift of Shift+Tab | one chord `[160, 9]` (`NVDAClient.js:273-286`) | Only if a journey declares Shift+Tab |
| Insert | NVDA-key chords (e.g. `[45,84]`, `qualification-core.mjs:26`) | No |
| Anything else | outside the gate | Never expected |

- **MEASURED:** the development manifest uses only `Tab` (6) and `Enter` (4) presses. Shift+Tab and Space matter only for withheld journeys.
- **INFERENCE:** with `capture:false` Tabwise sends no Control. Whether NVDA itself synthesizes Control or Insert keydowns during a relayed key is PHYSICAL (P-3).

### 4.2 Conflict

- Frozen `judgeKeys` and `pageAck.before` ignore `Control`, `Shift` and `Insert` (`sendguard.mjs:43,46,94`).
- R2 refuses `ctrl/alt/meta/repeat` (`page-provider.mjs:37`, `page-journal.mjs:37`), so a Chromium Control keydown (`ctrlKey:true`) is refused.
- A bare Insert keydown (all flags false) and a bare Shift keydown (`shiftKey:true` only) pass both layers unseen.

### 4.3 R2 key accounting (in `page-source.mjs`; frozen R1 unchanged)

**Inputs:**
- the journey, as `{action, press}` per index;
- a read-only accessor for the token intents the ledger has seen, from the `intents` lane;
- Node `now()`.

Accounting runs over each new keydown in raw order. It keeps the state `current` (index of the action whose intent was most recently seen), `pending` (null or `{seq, observed_at}`) and `prefix` (per action).

| Event | Condition | Result |
|---|---|---|
| `Control` or `Insert` keydown | any | **Refuse** with the seq |
| `Shift` keydown, `shift:true`, other flags false | `pending === null`, the current action's press is `Shift+Tab`, an intent with keys `[160,9]` has been seen for it, and no main key has been observed for it yet | `pending = {seq, observed_at: now()}`; the read is **accepted** |
| `Shift` keydown | any other case (no intent, wrong action, second Shift, already pending) | **Refuse** |
| `Tab`, `shift:true` | `pending` set and the current press is `Shift+Tab` | `pending = null`; `prefix = 'observed'` |
| `Tab`, `shift:true` | `pending` null and the current press is `Shift+Tab` | `prefix = 'not-observed'` (the browser did not report a standalone modifier) |
| `Tab`, `shift:true` | the current press is not `Shift+Tab` | **Refuse** |
| any other keydown | `pending` set | **Refuse** (a Shift followed by something other than a shifted Tab) |
| any other keydown | `pending` null | Passed through to R1/R2 acknowledgement as today |

**Bounded resolution.** On every read, and on the final read, if `pending` is set and `now() - pending.observed_at > ACK_MS + RECEIPT_SETTLE_MS` (2000 ms, using the R2 constants `capture.mjs:10,12`), the read is refused with "Shift at seq N unresolved". After `captureJourney` returns, the session performs one final read, and any `pending` refuses. A pending Shift is never discarded.

**Intent is not commit.** Seeing an intent only allows a Shift to be *pending*. The action is acknowledged only through the unchanged paths:
- frozen `pageAck` (one non-ignored Tab with shift true);
- the ledger commit inference and `finish` (`send-receipt.mjs:135-136,191-214`);
- R2 `ack_seq` (`capture.mjs:258-262`).

A Shift seen for an intent that never commits ends unresolved and is refused.

**Disclosure.** `prefix:'not-observed'` is recorded per action. It is not treated as evidence that the Shift was delivered as part of the chord; the shifted Tab's own `shift:true` is the evidence.

**Raw history.** Every keydown, including refused ones, is in the `page-reads` lane before accounting runs (§8.2).

**Tests (S2):**
- **Positive:**
  - a Shift arriving in read k and the Tab in read k+1 gives no refusal at read k;
  - Shift and Tab in one read;
  - a shifted Tab without a standalone Shift gives `not-observed`;
  - Tab, Enter and Space pass through untouched.
- **Negative:**
  - Control (`ctrl:true`) is refused with its seq;
  - Insert is refused;
  - Shift with no intent;
  - Shift during a Tab action;
  - Shift followed by Enter;
  - Shift followed by a Tab with `shift:false`;
  - two Shifts;
  - a pending Shift past 2000 ms (fake clock);
  - a pending Shift at the final read;
  - a shifted Tab in a Tab action;
  - each refusal latches both adapter views, `pageAck.before` returns unreadable, and the raw input object is unchanged (deep-equal).

### 4.4 Alternative (O-1)

Option B admits a Control keydown only when it correlates with a gate token whose keys are exactly `[162]`. It needs a reviewed change to `page-journal.mjs:37` and `page-provider.mjs:37`, and is warranted only if R2 adopts `capture:true` or P-3 shows NVDA-originated Control. **Recommendation: Option A (§4.3).**

---

## 5. Guarded execution: call sequence

### Composition (per page process)

Each step is bounded and tracked in the session's `active` set, as in `qualification-core.mjs:16-19`.

1. Validate the step map and `preflightJourney` (`input-policy.mjs:6-14`). There are no `type` steps (`executor.mjs:8`).
2. Writer, integrity receipts, brand check, `assertAuthentic()`.
3. Fixture identity, served transformation, browser, isolated context, recorder, navigation.
4. Journal adapter over `createR2PageSource`, with serialized views.
5. NVDA start and settings receipt.
6. Ack reader: `pageAck({read: serial(c => journal.keys(c)), ackMs: guard.bounds.ackMs})`, wrapped to append to `acks`, then frozen.
7. Foreground probe:
   - `check = ctx => foreground.check(ctx)` (the session-built `foregroundMismatch` closure, §1.3), appended to `focus`;
   - `guard.setCheck(check)`;
   - then the pre-input identity check (§2.2 step 4).
8. Receipt ledger: `createSendReceiptLedger({gate:guard, getGate, ackReader, onIntent: syncIntentRecorder, actions: map.actions, now})`.
   - This installs `setAck` and `onIntent` (`send-receipt.mjs:85,169`).
   - `syncIntentRecorder` appends to `intents` synchronously and never returns a thenable (`:108-119`).
9. Relay owner check, then observer and its initial read.
10. Executor: `createGuardedPressExecutor({steps: map.actions, nvda, guard, checkForeground, persistActionIntent})`.
11. `captureJourney({fixture_id, actions: map.actions, speech: observer, page: {read: serial(() => journal.snapshot())}, execute: executor.execute, clock, observationMs, pollMs, timeoutMs, receipts: ledger})`.
12. The session's final page read: accounting, pending Shift, `ack.final()`.
13. `gateState()` check (as `binding.mjs:55-62`).
14. Teardown.

### Per-action sequence (unchanged from revision 1)

| # | Step | Where | Cancellable? |
|---|---|---|---|
| 1 | pre-action reads | `capture.mjs:229-235` | yes |
| 2 | `receipts.begin` | `capture.mjs:240`; `send-receipt.mjs:172-187` | yes |
| 3 | executor started, not awaited | `capture.mjs:249-252` | yes |
| 4–7 | sequence check, persist intent (awaited), foreground preflight, arm | `executor.mjs:15,24,26-27,29` | yes |
| 8 | `nvda.press(key,{capture:false})` → queue → `sendKeyCode` | `executor.mjs:31`; `NVDAClient.js:273-358` | yes |
| 9–10 | socket usable; `admit` (stopped/armed/inflight, integrity, reader/before/check present) | `NVDAClient.js:431-436`; `sendguard.mjs:179-188` | yes |
| 11 | token, `inflight`, intent → ledger → sync recorder | `sendguard.mjs:189-193` | yes |
| 12 | `before` → `pageAck.before` → `journal.keys` | `sendguard.mjs:196-204` | yes (epoch `:199`) |
| 13 | `auth.at`; foreground `pre` | `sendguard.mjs:205-210` | yes |
| 14 | socket usable again | `NVDAClient.js:437-440` | yes |
| 15 | **COMMIT** (`sends += 1`, age ≤ 100 ms) | `NVDAClient.js:441`; `sendguard.mjs:214-235` | last refusal point |
| 16 | keydown/keyup messages written in the same turn | `NVDAClient.js:444-458` | **no** |
| 17 | write callbacks ≤ `writeMs` 2000; timeout closes the socket | `NVDAClient.js:459-472` | no |
| 18 | `release`: ledger stamps `released_at`, then `pageAck` ≤ 1000 ms | `sendguard.mjs:242-259`; `send-receipt.mjs:127-153` | no |
| 19 | settle 50 ms; foreground `post`; `inflight=null` | `sendguard.mjs:260-263` | no |
| 20 | disarm, `idle(1000)` | `executor.mjs:34-40` | — |
| 21–23 | R2 observation, `receipts.finish`, window close | `capture.mjs:253-306,285` | — |

### Commit boundary and cancellation limits

- **Before commit:** every stop refuses cleanly (epoch, `sendguard.mjs:135-144,199,207,225`).
- **After commit:** nothing can be recalled.
  - The nvda path never calls `gate.launched`.
  - Bytes already queued to the socket cannot be withdrawn.
  - A partially delivered chord can leave a modifier held down (P-7). The gate records `misdelivered` and stops; the session performs no further input; the ephemeral hosted VM is the backstop.
- **Abort** (`executor.mjs:19`, `capture.mjs:350`) only stops the gate.

---

## 6. Speech attribution

### 6.1 Clients

- **Primary:** the vendored `NVDA` instance's private client. It only sends gated chords. With `capture:false` its phrase log holds an empty entry per action (`NVDAClient.js:358-361`). It is **never** evidence, and `spokenPhraseLog()` is never called.
- **Secondary:** the session-owned observer (`observer.mjs:6-39`), one per page process, created after the NVDA start receipt and relay PID check. It never reconnects; `close`, `end` or `error` stops the gate (`:11,23`). It is closed in teardown after the final reads.

### 6.2 Journal and windows

- The observer's cumulative journal (`observer.mjs:13-22`) is append-only, and capture refuses a rewrite (`capture.mjs:122`).
- A phrase joins an action only if the read that last saw it absent was requested after the validated `released_at`, and it was observed by `released_at + observationMs` (`capture.mjs:140-149`). Otherwise it is `unattributed`, which makes the action ambiguous.
- `released_at` is the ledger's entry into the ack reader, not the physical send (G13).

### 6.3 Late, missing and disconnected speech

| Case | Behaviour | Class |
|---|---|---|
| before release or after window | `unattributed`, action `ambiguous` | `incomplete` |
| silence in window, subscription live | `observed-silence`, `transport_live:true` (`capture.mjs:340-343`) | see §6.4 |
| disconnect/error/cap/clock regression | gate stopped | `incomplete` |
| after teardown starts | final observer journal only | diagnostic |
| from a previous page | not excluded; provisionally bounded as below | `incomplete` if detected; otherwise undetectable (P-11) |

**Page isolation: the provisional guarantee (M2).** What the design provides:
- Separate per page: process, gate, ledger, browser context, observer connection and NVDA start.
- Before spawning the next child, the parent records that the previous child exited. It also records that the NVDA process the previous child reported (PID in its stop receipt) is no longer running. If that NVDA PID is still alive after a bounded wait, the next page is not started and the run is `incomplete`.
- The next child's capture records `preexisting_phrases` at its first observer read (`capture.mjs:126`). Phrases already present then are excluded from every action window.
- A phrase emitted before the first action's `released_at` is `unattributed`, which makes the action ambiguous (§6.2).

What it does **not** provide:
- It cannot show that a phrase heard during a page's action window was caused by that page. Speech is associated by time window only.
- An announcement queued by a previous page, or by any leftover process, and emitted after the next child subscribes and inside an action window would be attributed to that action. Nothing in software can distinguish it.
- Whether NVDA stop/restart drains such speech is the unresolved physical question **P-11**. Until a hosted run answers it, page isolation is a provisional software-level separation, not a measured property.

### 6.4 Silence and the paired control (O-4, pending)

A live subscription is not loss-free capture:
- The relay has no sequence numbers (`observer.mjs:39`).
- Relay equivalence is unverified (`qualification-core.mjs:13`; `observer-qualification.mjs:22`).

The validation broken page's barrier **is** silence, so a lost phrase looks exactly like the defect.

Revision 1 proposed counting broken-page silence only when "the same session" captured the healthy announcement. Under Option A no session spans two pages. The rule is therefore restated, and it is **not adopted without owner approval**:

> **O-4 (pending):** a broken page's `observed-silence` at its locus step counts toward R2 PASS only if, in the **same hosted job**, on the same VM and NVDA installation, the paired healthy page ran in the immediately preceding process and its observer captured the expected announcement for the same task step within the same `observationMs`. The two pages use separate NVDA starts and separate observer connections. This is a per-run positive control for that phrase class, not per-phrase loss-freedom.

If O-4 is refused, broken-page silence is recorded as `silence_class:'subscription-live'` and scored `INSUFFICIENT_EVIDENCE`. That leaves only non-silence barriers able to qualify. The alternative of a shared connection requires Option B (§2.1) and is not recommended.

---

## 7. Quiescence and failure handling

### 7.1 Software-checkable versus physical

| Property | Software check | Physical question |
|---|---|---|
| no JS send in flight | `guard.idle` (`sendguard.mjs:272`) | — |
| no launched op | `guard.quiesce` (`:273`); always 0 on the nvda path | — |
| socket writes returned | write callbacks (`NVDAClient.js:459-472`) | delivery to NVDA and the OS |
| counters | ledger `finish` (`send-receipt.mjs:204-208`) | — |
| no pending bounded op | session `active` set empty | — |
| observer, browser, probe and NVDA closed | teardown results, child exit code | NVDA speech queue drained; a late NVDA exit before the next page (P-11) |
| page key exactly once | R1 `pageAck`, R2 `ack_seq`, accounting | browse/focus mode (G9) |
| foreground fresh at commit | age ≤ 100 ms | hosted probe latency (G8) |
| stuck modifier | none | P-7 |
| physical quiescence | not verifiable: `quiescence:'UNVERIFIED'`, `physical_quiescence_verified:false` | P-9 |

### 7.2 Sticky stops, pending operations, timeouts

**Latches:**
- gate `halt` (`sendguard.mjs:135-136`);
- journal (`page-journal.mjs:64,85-94`);
- provider (`page-provider.mjs:95,138`);
- observer `fail`;
- ledger `failed`;
- executor `stop`;
- probe `dead` (`foreground.mjs`);
- the session's own `sessionFailure`.

None can be cleared.

**Bounds:**
- All async work goes through `bounded(label, fn, ms)`.
- Frozen and R2 constants are unchanged: `ACK_MS` 1000, `RECEIPT_SETTLE_MS` 1000, `maxAgeMs` 100, `ackMs` 1000, `writeMs` 2000.
- A per-page deadline aborts and stops the gate; the plan value is set in S5a tests. The `--run` parent has its own overall deadline.
- An op still pending at teardown is recorded in `pending_operations` and makes the page `incomplete`.

### 7.3 Teardown and terminal verification

Teardown extends `createQualificationTeardown` (`observer-qualification.mjs:24-36`) and runs in this order:
1. disarm, then `quiesce(1000)`, then stop if still live;
2. final reads: journal, `ack.final()`, observer journal, accounting;
3. observer close, then probe close;
4. browser close, only if quiet;
5. `nvda.stop()`;
6. `verifyPhase()` for both scopes, then `assertAuthentic()`;
7. confirm the loopback sentinel is empty;
8. seal, then verify from disk.

Each failure lowers the page to `incomplete`.

### 7.4 Abort and crash

- `installQualificationCrashHandlers` is reused unchanged: exit code 2, record once, then abort (`qualification-crash.mjs:2-7`). SIGINT and SIGTERM abort.
- A crashed child leaves append-only lanes and no manifest. The verifier classifies that directory as `incomplete` and never repairs it.
- The parent sees the non-zero exit and starts no further page.
- Orphaned NVDA or Chromium processes after a crash are not claimed to be cleaned locally. The ephemeral VM is the backstop.

---

## 8. Evidence and provenance

### 8.1 Writer (`scripts/tabwise/r2-evidence.mjs`)

It uses the same mechanics as `qualification-evidence.mjs`: exclusive create, lane and total caps, seal once, verify from disk. That file and its five-lane, title-only scope are **unchanged**.

Per page directory:

| Lane / file | Content | Writer |
|---|---|---|
| `events` | phases, integrity receipts, pre-input identity, transformation, step map, action intents, refusals | session |
| `intents` | token intents (synchronous, inside `admit`) | `syncIntentRecorder` |
| `focus` | foreground verdicts | `check` |
| `page-reads` | delta read records (§8.2) | page source |
| `page-rejected.json` | the single full rejected raw read, if any | page source |
| `page` | adapter entries (`page-journal.mjs:62`) | adapter |
| `acks` | R1 ack results | ack wrapper |
| `receipts` | final `ledger.read()` | session |
| `speech` | observer journal (verbatim) and normalization note | session |
| `capture.json` | the `captureJourney` result | session |
| `axe` | axe-core results, pre and post (§8.3) | session |
| `visual/pre.png`, `visual/post.png` | screenshots (§8.3) | session |

### 8.2 Bounded page-read representation (finding 5)

**Changed read.** Each read that differs from the page source's previous raw read appends one record:

```
{kind:'read', read:n, requested_at, returned_at,          // Node monotonic ms
 session, page_t, events_from, events_to,                  // events_from = previous events_to
 new_events:[...],                                         // exactly events[events_from, events_to)
 active, title_ok, url_ok,
 state: <full state> | null,                               // null = identical to the last stored state
 state_sha256, prefix_sha256,                              // sha256 of canonical JSON of events[0, events_to)
 page_reported_from, page_reported_new:[...],
 decision:'passed'|'refused', reason|null}
```

**Unchanged reads** have no new events and the same `active`, `state`, `page_reported` and `t` regression status. Consecutive ones are coalesced into `{kind:'unchanged', reads:k, first_requested_at, last_returned_at, page_t_first, page_t_last}`, flushed before the next changed read and at seal. Individual timings of unchanged reads are summarized, not listed. That is disclosed in the evidence scope.

**Rejected read.** If the raw read is not a prefix-extension of the previous raw read, or any page-source refusal fires:
- the full raw object is written once to `page-rejected.json` (bounded by the recorder cap plus `page_reported` cap, ≤ 340 000 bytes);
- the read record carries `decision:'refused'`, the reason and the file's sha256.

The journal latches, and no further source read happens (`page-journal.mjs:55,64`). There is therefore at most one rejected file per page.

**Adapter or provider refusals** happen after the page source has passed the read. The delta record is already written, so the exact rejected snapshot can be rebuilt from the deltas. The adapter's own `complete:false` entry in `page` names the reason.

**Reconstruction (verifier):**
1. Replay the `new_events` arrays in order.
2. Check `events_from` continuity and recompute every `prefix_sha256` and `state_sha256`.
3. Check that each event appears exactly once.
4. Compare `events_to` with the adapter's `seq_max` entries in `page`, and with the capture samples' `cursor`.

Any mismatch, or a missing seal, makes the page `incomplete`.

**Caps checked before input.** From the run spec the session computes:
- `max_reads = actions × (ackMs/10 + 2 + (timeoutMs + RECEIPT_SETTLE_MS + observationMs)/pollMs + 4) + 8`;
- a per-record bound of 512 bytes overhead, plus 4 096 bytes per stored state.

It then requires each of these to fit its cap:
- `page-reads` ≤ 262 144 event bytes + `max_reads × 512` + `16 × 4 096` state changes (any state change beyond 16 refuses as `incomplete`);
- `page` ≤ `max_reads × 256`;
- `capture.json` ≤ `max_reads × 4 608`.

The derived caps are written to the manifest. If they exceed the total cap (12 MB per page), the page is refused **before the first input**. A cap reached at runtime throws and the page is `incomplete`. Nothing is dropped, and caps are never raised at runtime.

### 8.3 Visual and axe evidence (finding 8)

- `captureJourney` has no per-action hook (MEASURED, `capture.mjs:57-72`). This design does **not** take screenshots between actions.
- **Pre-journey**, after the pre-input identity check and before the journal baseline is accepted:
  1. axe-core run (`@axe-core/playwright` 4.14.0 is already in `package.json`; no install);
  2. `page.screenshot` (viewport only, so the browser UI and its nonce-bearing title are not captured).
- **Post-journey**, after the final page read and before teardown: axe-core run, then `page.screenshot`. Neither sends input. Axe DOM side effects after the final read are outside the journal by construction. Before the baseline, the recorder records them and they become part of the accepted baseline.
- **Lanes:**
  - Axe results go in `axe` with the axe-core version and the sha256 of the injected source.
  - Screenshots are under `visual/`.
  - The visual-arm payload is built **only** from `visual/*` plus the step-mapped task list (task ids and presses).
  - The speech-arm payload is built **only** from `captureJourney`'s validated per-action records in `capture.json`, through the C-3 builder and its allowlist (§8.6), with nonce redaction (§8.7). The raw `speech` lane is **not** a payload source; it has no action identities.
  - `speechPayloadErrors` and `armErrors` (`contract.mjs:107-127`) are applied, and each payload's sha256 is in the manifest.
- **Scoring contract:** `judgeR2` needs a visual claim per page (`contract.mjs:145-147`), not per-action images. Pre/post satisfies it mechanically.
- **Bias, disclosed:** a weaker visual control makes `causal_claim` (`contract.mjs:154`) easier to obtain. Whether pre/post is acceptable for a scored run, or per-action visual is required through the capture hook C-2 (§10), is **O-9, pending**.

### 8.4 Evidence classes

| Class | Meaning | Assigned by |
|---|---|---|
| `synthetic` | unbranded runtime (any offline test) | session |
| `incomplete` | any refusal, sticky failure, pending op, cap, integrity failure, unsealed directory, `LIVE_AT_TEARDOWN`, failed reconstruction, or a child that did not exit 0 | session or verifier |
| `genuine-unqualified` | authentic runtime, hosted runner attestation verified, every action complete, sealed and reconstructed | session (its highest) |
| `qualified` | `genuine-unqualified` evidence independently assessed (R7) and accepted by the owner under a recorded decision | outside the runner only |

The verifier recomputes each class. A synthetic directory can never be promoted.

### 8.5 Manifests and attestations

- **Page manifest** `tabwise-r2-page-evidence/1`: `{class, step_map, transform, files:[{path,bytes,sha256}], caps, source, runner, evidence_scope}`, plus `manifest.sha256`.
- **Run manifest** `tabwise-r2-run-evidence/1`: `{plan_sha256, order, pages:[{id, dir, manifest_sha256, exit_code, class}], run_class}`. `run_class` is the minimum page class.
- **Source attestation:**
  - HEAD and clean tree;
  - `qualificationDigest` and the R2 digest;
  - the frozen-R1 result and the `fixtures/r1/lock.json` hash;
  - both integrity `manifest_sha256` values;
  - the vendor manifest;
  - fixture and served hashes.
- **Runner attestation:**
  - `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT==='1'`, actor, workflow path, event, `refs/heads/main`;
  - Node, Chromium, NVDA read-back and axe-core versions;
  - owner decision ref and reviewer ref.

  It is checked by `checkR2Approval`.
- **Evidence scope string:** "R2 causal-smoke page evidence; one page per process; observation-window association; silence is subscription-live; unchanged page reads summarized; physical quiescence unverified; no full-worker clearance."

### 8.6 Model-facing speech payload (H2)

**Why the raw lane cannot be used.** The `speech` lane holds the observer's cumulative journal: a list of phrase strings with no action identity (`observer.mjs:13-22`; `capture.mjs:59`). The association of a phrase with an action exists only in `captureJourney`'s result:
- `records[i].raw_seq` and `records[i].text` (`capture.mjs:151`);
- `capture_status` and `silence` (`:340-343`);
- under the window rule of §6.2.

**Why the existing builder cannot be used.** `speechModelPayload` (`binding.mjs:72-85`) accepts only a capture whose `source` is the offline constant and whose provenance is `synthetic`/`UNATTESTED` (`:76-77`). It refuses genuine captures by design, stays unchanged, and is not claimed to accept them.

**C-3 builder.** `src/r2/speech-payload.mjs` exports `buildR2SpeechPayload({capture, stepMap, redaction, manifest})`. It runs offline, over a sealed page directory that the S3 verifier has already accepted.

**Eligibility.** Every condition must hold, otherwise the builder refuses and the page is `model_eligible:false` with the reason recorded:
1. The page class is `genuine-unqualified`, the manifest verifies, and the reconstruction of §8.2 passed.
2. `capture.completed === true`, `gate_stop` is absent, and no record has `invalidated`.
3. Every record's `capture_status` is `speech` or `observed-silence`, and its `association` is `'observation-window-only'`.
4. `capture.unattributed` is empty.
5. The record `step` values equal the step map's action ids in order, and the presses match.
6. The raw-to-record check passes (below).
7. The redaction of §8.7 is unambiguous.

**Raw-to-record check (provenance, not payload).** For each record, `text` must equal the `\n`-join of the `capture.raw` entries whose `seq` is in `raw_seq`. Each of those entries must equal the phrase at the same position in the sealed `speech` lane journal. Raw speech is therefore kept separately and used only to verify the records; it never enters the payload.

**Exact allowlist.** The builder constructs the payload field by field. It never copies or spreads a record:

```
{ fixture_id,                                    // blinded fixture id from the approved manifest
  actions:      [{ step: <task id>, press }],    // from the step map, in order
  observations: [{ step: <task id>,              // record.step mapped through the step map
                   ref: 'speech:' + record.seq,
                   speech: <redacted record.text> }] }   // '' for observed-silence
```

This is the same shape `buildArmPayload` produces (`preparation.mjs:218-227`), so the builder reuses it after mapping and redaction.

**Excluded by construction:**
- `page.*` (snapshots, samples, events, state, `rejected`), `unattributed_page`, `page_reported` and app events;
- axe, screenshots, `title`, URL and the nonce;
- `ack_timing`, `gate_receipt`, `execution`, `node_window`, `observation_window`, `raw_seq`, `reasons`, `silence` and receipts.

**Post-checks.**
- The keys at every depth must be exactly the allowlisted set; an extra key refuses.
- `speechPayloadErrors(payload)` must be empty.
- The payload sha256, the redaction record and the builder version are written to the run's arm-input manifest. The verifier rebuilds the payload from the sealed directory and compares hashes.

### 8.7 Nonce redaction (M1)

**Input:** the record texts selected in §8.6. **Output:** a redacted copy, plus `redaction = {version:'nonce-redact/1', nonce_sha256, edits:[...]}`. The raw transcript in the `speech` lane and in `capture.json` is never modified.

**Forms redacted.** For each record text, all non-overlapping matches are replaced left to right with `[run-nonce]`:
1. **Literal:** the 8-character nonce, case-insensitive, not adjacent to another letter or digit.
2. **NVDA-spaced:** the nonce characters in order, each separated by one or more whitespace characters, or by whitespace plus at most one of `, . -`, case-insensitive. This covers character-by-character reading such as `3 f 9 a 0 c 1 b`.

**Edit record.** Each edit records `{seq, form:'literal'|'spaced', start, end, original}`, where `start` and `end` are UTF-16 offsets in the raw text. The verifier re-applies `nonce-redact/1` to the raw texts and must reproduce the redacted texts and the edit list exactly.

**Ambiguity check, run on the redacted text.** Sanitization is ambiguous, and the page is refused for model use, if any of these holds:
- after mapping digit words `zero`…`nine` to digits and dropping separators, a run of 4 or more consecutive nonce characters remains in a run of tokens that each consist of one hex character or one digit word (this covers partial, interrupted or spelled-out readings);
- a match of either form overlaps another match, or crosses a record boundary;
- the redaction marker text `[run-nonce]` already occurred in the raw text.

An ambiguous page:
- is still sealed and keeps its evidence class;
- gets `model_eligible:false` with reason `nonce-sanitization-ambiguous`;
- contributes no arm payload.

Refusal is preferred to a false negative. A false positive costs one page, and a later run uses a fresh nonce.

**Label neutrality.** Healthy and broken pages receive the same transformation and the same redaction rules. Edit counts are kept out of the payload, so they cannot leak which page is which.

---

## 9. Approval boundaries

**Unchanged:**
- `liveGate` throws;
- `review-status.json` BLOCK;
- `qualification-status.json` `enabled:false`, BLOCK;
- the existing workflows (`preflight.yml`, `r1.yml`, `tabwise-observer.yml`, `tabwise-run.yml`);
- frozen R1 and the vendor tree.

R2 gets its own `scripts/tabwise/r2-status.json`, which ships `enabled:false`, `BLOCK` (O-2).

**Before any hosted R2 execution, in order:**
1. Independent review of the S1–S6, S5a/S5b and C-3 code and this design.
2. Owner decision with a new D-number naming:
   - the exact SHA, `R2_FILES` and R2 digest;
   - the run plan (fixtures, pair order), withheld fixtures and independent labels;
   - the budget (≤ $1.50 / ≤ 2 h per the PLAN R2 row; ₹0 incremental until then), actor and workflow.
3. A status-only activation commit by the owner.
4. One dispatch with the `d73-observer-dispatch.ps1` one-shot discipline, then immediate revocation.
5. Reset to disabled/BLOCK.

**D-72, D-73 and D-74 are retired and cannot be reused.** The dress rehearsal on development fixtures and the scored withheld run are separate decisions.

---

## 10. Required R2-only source contract changes

Each needs its own RED test and independent review during implementation. None touches frozen R1, the vendor tree, `QUALIFICATION_FILES` members or fixtures.

| ID | File | Change | Why | Required? |
|---|---|---|---|---|
| C-1 | `src/r2/contract.mjs` (`alignTimeline`, `:60-86`) | Compare the acknowledged event with `expectedKey(press)` semantics (Space → key `" "`; Shift+Tab → key `"Tab"` and `shift:true`; others → key equal to the press and `shift:false`) instead of `event.key !== a.press` (`:69`). Move `expectedKey` (`capture.mjs:48-54`) to a shared R2 helper and import it in both places | Today a correct Space or Shift+Tab acknowledgement is reported as "acknowledged key differs from declared press". Development journeys (Tab/Enter only) are not affected | Yes, unless O-3 restricts withheld journeys to Tab/Enter |
| C-2 | `src/r2/capture.mjs` | Optional `afterAction(recordCopy)` callback, awaited and bounded, called after an action's observation window closes and before the next action's pre-reads. Its errors fail the capture | Per-action screenshots | Only if O-9 requires per-action visual |
| C-3 | new `src/r2/speech-payload.mjs` (and `src/r2/step-map.mjs` for the shared step map) | `buildR2SpeechPayload` with the eligibility rules, exact allowlist, raw-to-record check and `nonce-redact/1` of §8.6–§8.7. It reuses `buildArmPayload` and `speechPayloadErrors`. `speechModelPayload` (`binding.mjs:72-85`) is unchanged and stays synthetic-only | No existing builder accepts a genuine capture, and the raw speech lane has no action ids | Yes, before any model arm runs on genuine evidence |

No change is required to `page-provider.mjs`, `page-journal.mjs`, `send-receipt.mjs` or `binding.mjs` under this design. P-1 could still require a separately reviewed provider change (§3.3).

---

## 11. Implementation slices (dependency order)

**Common rules for every slice:**
- test first, with RED recorded;
- prefer existing admitted test files; a new file needs an owner-approved `ci/offline-tests.json` entry (O-5);
- frozen R1 baseline, `preflight.mjs` and the qualification digest unchanged;
- `git diff --check`;
- no commit by Claude.

**Dependencies:**
- S1, S3, S4 and C-1 can be built in parallel;
- S2 after S1;
- S5a (composition) after S2, S3 and C-1;
- S5b (authentic session) after S5a;
- C-3 after S3 (it needs the verified sealed directory and the step map);
- S6 after S4 and S5b;
- S7 after S6 and the owner decision;
- model arms on genuine evidence after C-3.

### S1 — Page recorder (`src/r2/page-recorder.mjs`)
- **Contract:** §3.2–§3.4.
- **Tests:** appended to `test/r2-page-provider.test.mjs`, using a minimal DOM shim written in the test (no installs).
- **Positive:**
  - focus, Tab and Enter sequences, and mutation-backed state changes, are accepted unchanged by `createPageJournal`;
  - a same-id clone gets a different identity;
  - `takeRecords` flushes before state;
  - `page_reported` is separate.
- **Negative:**
  - event and byte cap overflow, and clock regression, lead to the adapter refusing;
  - `state_overflow`;
  - page code cannot overwrite the globals;
  - `focus` is never emitted;
  - an app event never changes the classification.
- **Disabled:** no caller; no browser in offline CI.
- **Residual:** real Chromium order (P-1) and `isTrusted` under NVDA (P-2).

### S2 — Page source and key accounting (`src/r2/page-source.mjs`)
- **Contract:** §3.5, §4.3, §8.2 (the `page-reads` records).
- **Tests:** appended to `test/r2-page-provider.test.mjs`, with every positive and negative case listed in §4.3, plus:
  - identity (title, URL, session) refusals;
  - `isTrusted:false`;
  - a non-prefix read produces exactly one `page-rejected.json`;
  - coalescing of unchanged reads;
  - reconstruction of an adapter-refused snapshot from deltas.
- **Disabled:** no session.
- **Residual:** P-3.

### C-1 — `alignTimeline` key semantics
- **Files:** `src/r2/contract.mjs`, `src/r2/capture.mjs` (import only), a new shared helper module or an export from `contract.mjs`.
- **Tests:** appended to an admitted R2 contract test file.
  - RED: Space with key `" "` and Shift+Tab with key `Tab`/shift true currently report a mismatch.
  - GREEN: both pass.
  - Negative: Tab with shift for a Tab action, and Space reported as `"Space"`, are mismatches.
- **Residual:** none.

### S3 — Evidence writer and verifiers (`scripts/tabwise/r2-evidence.mjs`)
- **Contract:** §8.1, §8.2, §8.4, §8.5 (page and run manifests, class recomputation, reconstruction, transformation and step-map recomputation).
- **Negative tests:**
  - tampered lane;
  - extra or missing file;
  - unsealed directory;
  - a broken delta chain or prefix hash;
  - duplicated or missing event;
  - a served hash that does not reproduce;
  - a step map that differs from the manifest;
  - a synthetic class claiming genuine;
  - any self-claimed `qualified`;
  - a cap exceeded at runtime.
- **Disabled:** no production use.

### S4 — Policy and status (`scripts/tabwise/r2-policy.mjs`, `scripts/tabwise/r2-status.json`)
- **Contract:** mirrors `checkQualificationApproval` (`qualification-policy.mjs:14-27`) with R2 names, the run-plan hash, and an explicit refusal of D-72, D-73 and D-74.
- **Tests:** the shipped status refuses; each field mismatch refuses; a valid fixture status at the right HEAD passes.
- **Disabled:** ships BLOCK.

### S5a — Composition seam (`scripts/tabwise/r2-compose.mjs`)
- **Contract:** §1.2 rules, §1.3 (H1), §2.4, §5, §6, §7 over injected handles only.
- **Positive tests** (fake handles, fake page evaluate, fake observer, fake clock; called directly, never through the entry):
  - a Tab/Enter journey completes;
  - receipts complete;
  - the result has no `provenance` or `class`, and the evidence writer classes it `synthetic`;
  - exact teardown order;
  - the step map and transformation are recorded.
- **Negative tests:**
  - unserialized `keys()`/`snapshot()` latches (the test shows the queue is needed);
  - Control mid-journey stops the gate with its seq;
  - a fixture with zero or two `<title>` elements is refused before launch;
  - a pre-input title, URL, PID or nonce mismatch is refused before arm;
  - the cap preflight fails before input;
  - observer disconnect;
  - foreground mismatch at pre and post;
  - integrity changes between admit and commit;
  - a stop after commit leaves `misdelivered`;
  - a pending op at teardown;
  - the crash path leaves an unsealed `incomplete` directory;
  - the result contains no functions;
  - static import test: no capability import (§1.2 list).
- **Disabled:** no entry imports it.

### S5b — Authentic session (`scripts/tabwise/r2-session.mjs`)
- **Contract:** §1.2–§1.5 and §2.2. It refuses unbranded runtimes first, builds real handles only after that, calls `composeR2Page`, and attaches provenance.
- **Tests (offline, refusal only):** the H1 boundary tests in §1.3 (brand refusal, capability modules not loaded, dynamic-after-check static test), plus the static graph test (§1.2). No offline test reaches a real launch.
- **Disabled:** no entry imports it until S6; status BLOCK.

### C-3 — Production speech payload builder (`src/r2/speech-payload.mjs`)
- **Contract:** §8.6 and §8.7.
- **Positive tests:**
  - a sealed fixture directory gives exactly the allowlisted shape with task ids, and silence as `''`;
  - the literal and spaced nonce forms are redacted, the raw text is unchanged, and the edit list reproduces;
  - the payload hash recomputes.
- **Negative tests:**
  - a `synthetic` or `incomplete` class;
  - an invalidated record;
  - non-empty `unattributed`;
  - a record `text` not matching `raw_seq`;
  - a raw entry not matching the speech lane;
  - a step order or press mismatch;
  - an extra key anywhere;
  - a page-, DOM- or visual-like value (`speechPayloadErrors`);
  - each ambiguity case (partial run, digit words, overlap, a pre-existing marker);
  - `speechModelPayload` still refuses the genuine capture.
- **Disabled:** used only offline over sealed evidence; no model call in tests.

### S6 — Entry (`scripts/tabwise-r2.mjs`)
- **Modes:** `--check-only`, `--page`, `--run`, as in §1.2.
- **Tests:** offline refusals only:
  - environment variable absent;
  - BLOCK status;
  - dirty tree;
  - `--check-only` and `--run` never load a runtime (module-cache assertion);
  - `--run` stops after the first non-zero child exit, using a stub child.
- **Disabled:** status BLOCK; no workflow.

### S7 — Workflow and one-shot dispatch (owner-gated)
`.github/workflows/tabwise-r2.yml` (windows, `workflow_dispatch`, job-level vars gate, timeout) and a dispatch script adapted from `d73-observer-dispatch.ps1`. Drafting it needs O-6. Publication, activation and dispatch are separate owner steps (§9).

### 11.1 Shortest path to official R2 causal smoke

1. Build S1, S2, S3, S4, C-1, S5a, S5b, S6 and C-3 offline.
2. Independent review.
3. An authorized headless-Chromium recorder check with CDP input and no NVDA (P-1).
4. O-6, then S7.
5. One hosted **dress rehearsal** on one development pair (not scored) to settle P-2, P-3, P-4, P-5, P-8 and P-11.
6. If it reaches `genuine-unqualified`, a new owner decision for the withheld, independently labelled pairs.
7. Model arms run offline over sealed evidence (same model and version; speech payloads from C-3 per §8.6–§8.7, visual payloads per §8.3).
8. `judgeR2` (`contract.mjs:134`) with `axeMissed` (`:129`).
9. R7.

Preserved throughout:
- healthy/broken controls and independent labels;
- development hashes refused for scoring;
- the speech-versus-visual comparison;
- the axe baseline;
- "no barrier claimed on a healthy page".

---

## 12. Remaining physical uncertainties

| ID | Question | First evidence |
|---|---|---|
| P-1 | Chromium focusout/focusin order and `activeElement`; mutation timing vs focus | authorized headless-Chromium S1 check (no NVDA) |
| P-2 | NVDA-injected keys arrive `isTrusted:true` with the expected key and flags | hosted dress rehearsal |
| P-3 | NVDA synthesizes Control/Insert/Shift keydowns during relayed presses | dress rehearsal (§4.3 refuses on the first) |
| P-4 | foreground ≤ 100 ms at commit (G8) | dress rehearsal `intents`/`focus` timings |
| P-5 | serialized reads keep ack and R2 reads within 1000 ms | dress rehearsal `page-reads` timings |
| P-6 | speech latency vs `observationMs`; late speech; relay loss | dress rehearsal; paired controls |
| P-7 | stuck modifier after a write timeout | not safely testable; disclosed; ephemeral VM |
| P-8 | browse/focus mode effects (G9) | dress rehearsal |
| P-9 | physical quiescence (G11) | not established |
| P-10 | whole-VM egress isolation | not established (browser-level only) |
| P-11 | NVDA stop/restart between page processes drains the previous page's queued speech, is clean, and is fast enough for the job timeout. Unresolved; page isolation stays provisional until then (§6.3) | dress rehearsal child timings, stop receipts, PID-exit records and speech lanes |
| P-12 | NVDA speaking the nonce-bearing title inside an action window changes attribution only by adding text that redacts unambiguously; how NVDA actually reads the nonce (literal, spaced, digit words) | dress rehearsal speech lane and redaction records |

---

## 13. R3 and R7 (separate gates)

- **R3:** needs, in addition to the existing patch applier (`src/repair/apply.mjs`, re-exported at `worker.mjs:23`) and review approval (`scripts/tabwise/review-approval.mjs`):
  - the genuine pipeline S1–S7;
  - a rerun of the same withheld task with the patched fixture, as a new process with its own transformation record;
  - a wrong-patch control;
  - a human reviewer recorded before the rerun.

  It has its own decision and budget. Not started.
- **R7:** needs the S3 verifiers runnable by someone other than the runner, an owner-named assessor, recorded failures and abstentions, and no tuning. `qualified` is first assignable here. Not started.

---

## 14. Owner decisions

| # | Decision | Recommendation | Status |
|---|---|---|---|
| O-1 | NVDA Control/Insert policy | Option A (§4.3); Option B only on hosted evidence | pending |
| O-2 | R2 status file | new `r2-status.json`, disabled/BLOCK | pending |
| O-3 | Withheld fixture contract, given to authors **before** authoring and never applied by editing after hashing: exactly one non-empty `<title>`; presses from `SUPPORTED_PRESS` (or Tab/Enter only, which makes C-1 optional); the app sink is optional and never scored | as stated | pending |
| O-4 | Silence acceptance: the per-hosted-run paired positive control of §6.4, with separate NVDA starts and observer connections | adopt as written, or refuse (silence then counts as `INSUFFICIENT_EVIDENCE`) | **pending; not adopted** |
| O-5 | Test placement / CI inventory | new offline files for S3 to S6 with approved inventory entries; S1 and S2 appended to the admitted file | pending |
| O-6 | Workflow drafting (S7) | only after S1–S6 (including S5a/S5b) and C-3 review | pending |
| O-7 | R7 assessor | named before any scored run | pending |
| O-8 | Budget | ≤ $1.50 / ≤ 2 h per the R2 row; ₹0 incremental until approved; dress rehearsal and scored run approved separately | pending |
| O-9 | Visual control granularity: pre/post only (no source change, disclosed bias toward `causal_claim`) vs per-action through C-2 | pre/post for the dress rehearsal; owner chooses before the scored run | **pending** |

## 15. Remaining architectural blocker

None in software design. The binding is implementable with the R2-only changes in §10: C-1, C-3, and C-2 only if O-9 asks for it. What blocks qualification is physical and governance:
- P-1 to P-12 can only be answered by an authorized hosted run;
- O-4 decides whether silence-type barriers can qualify at all;
- O-9 decides whether the visual control is strong enough for a causal claim.

## 16. Changed-file inventory (this design task)

| File | Change |
|---|---|
| `docs/engineering/R2-L2-production-binding-design.md` | new (this document, revision 3) |
| `docs/ledger/STATE.md` | R2-L1 merge reconciliation; R2-L2 design status |
| `docs/ledger/LOG.jsonl` | appended entries only |
| `docs/ledger/PLAN.md` | appended R2-L2 section only |

No source, test, workflow, status, CI, vendor, fixture, frozen-R1 or package file changed.
