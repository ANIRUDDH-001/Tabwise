# R2-L2 S5b + S6: offline integration, trust-boundary hardening and Gate D preparation (CLOUD-R2-L2-05)

Status: **uncommitted, offline only, R2 disabled/BLOCK.** No commit, push, install, API call, browser, NVDA, physical input, hosted dispatch or status change was made. The authentic-success path of S5b/S6 has **not** been executed. It stays unverified until a separately authorized hosted Windows run.

Labels: MEASURED (a command was run in this session; the result is quoted), CITED (`file:line`), INFERENCE (reasoning, not measured).

## 1. Starting revision and file inventory

- Start: `063e789f2b0429105b73dc624bb96c77a660ba70` (`main` after PR #12). `git status --short` was empty at start (MEASURED).
- Environment: Cloud Linux, Node v22.22.0, no `node_modules` (MEASURED). This is not Windows Node 24.22.1 and makes no Windows equivalence claim.

| Kind | File | Purpose |
|---|---|---|
| new | `scripts/tabwise/r2-session.mjs` | S5b authentic session; exports `runR2Session` only |
| new | `scripts/tabwise-r2.mjs` | S6 default-blocked entry (`--check-only`, `--page <id>`, `--run`) |
| new | `scripts/tabwise/r2-run.mjs` | S6 capability-free helpers: CLI, plan schema, gates, run dir, child env/command, coordinator |
| new | `docs/engineering/R2-L2-S5b-S6-handoff.md` | this document |
| modified | `scripts/tabwise/r2-policy.mjs` | `R2_FILES` adds the three new sources (comment updated) |
| modified | `test/r2-review.test.mjs` | 27 new tests appended; one pre-existing S5a assertion narrowed (see §6.3) |
| modified | `docs/CODEMAP.md`, `docs/ledger/STATE.md`, `docs/ledger/LOG.jsonl`, `docs/ledger/DECISIONS.md` | ledgers |

Untouched: frozen R1, vendor, the qualification loader, policy, integrity and crash modules, `r2-compose.mjs`, `r2-evidence.mjs`, `speech-payload.mjs`, `r2-status.json` (still `enabled:false`, `BLOCK`), `FEATURES.json`, workflows, `ci/offline-tests.json`, package manifests, `AGENTS.md`, `CLAUDE.md`, `.claude/` and governance.

## 2. Dependency map and design/source inconsistencies (checked against source before coding)

```
scripts/tabwise-r2.mjs (S6 entry)
 ├─ static: node:child_process (git via execFileSync, page children via spawn), node:fs, node:path, node:url,
 │          ./check-r1-baseline.mjs (checkFrozenIntegrity), ./tabwise/r2-policy.mjs (r2Digest, readR2Status),
 │          ./tabwise/r2-evidence.mjs (sealR2Run, verifyR2Run), ./tabwise/qualification-integrity.mjs,
 │          ./tabwise/qualification-crash.mjs, ./tabwise/r2-run.mjs
 └─ runPage only (--page, after every gate): createQualificationIntegrity -> await import(qualification-loader)
      -> loadQualificationRuntime({root, additionalIntegrity: phase.checkSend}) -> isQualificationRuntime
      -> await import(r2-session) -> runR2Session(runtime, data) -> verifyPhase, r2Digest, assertAuthentic, getGate
scripts/tabwise/r2-run.mjs: node:fs, node:path, src/r2/contract.mjs (pageHash), r2-policy (checkR2Approval, r2Digest),
                            r2-evidence (buildR2StepMap, planR2EvidenceCaps). No dynamic import, no child_process.
scripts/tabwise/r2-session.mjs
 ├─ static: ./qualification-loader.mjs {isQualificationRuntime}, ./r2-compose.mjs {composeR2Page}
 └─ dynamic, after the brand check: node:crypto, node:http, node:path, @playwright/test, @axe-core/playwright,
      ./network.mjs, ./observer.mjs, ./executor.mjs, src/speech/foreground.mjs (foregroundMismatch),
      src/speech/validate.mjs (settingsMismatch), ./r2-evidence.mjs, src/r2/page-recorder.mjs
```

The actual APIs were checked against source (CITED):
- Loader: the runtime is frozen `{guard, getGate, nvda, NVDAClient, relayOwnerPid, versions, cfg, createForeground, assertAuthentic}`, branded in a module-private WeakSet (`qualification-loader.mjs:7-8,33-34`).
- NVDA: `start(options)` takes `{settings}` (`vendor/.../NVDA.js:241`). `press(key, options)` is at `:663`, `getSettings()` at `:1006`, and `relayOwnerPid({deadlineMs})` at `start.js:54`.
- Compose: `HANDLE_KEYS`/`METHODS` (`r2-compose.mjs:21-25`) and `DATA_KEYS` (`:25`). Compose seals with `incomplete` only (`:251`).
- Writer: `createR2EvidenceWriter({enabled, dir, page:{fixture_id, session, port}, fixture, approved, nonce, spec})` (`r2-evidence.mjs:180`). Seal options `incomplete|provenance|source|runner` (`:236`). Any claim gives `incomplete` with `ATTESTATION_UNAVAILABLE` (`:310-313`).

| # | Design says | Source says | Resolution |
|---|---|---|---|
| I-1 | §1.5 step 2: a second `createQualificationIntegrity`-like scope "over `R2_FILES`" | `createQualificationIntegrity` hard-codes `qualificationDigest`. Its identity/hash manifest is **every tracked file** (`git ls-files`, `qualification-integrity.mjs:22`), which already includes every R2 file | One integrity instance (identity per send via `additionalIntegrity`, full hashes at the phase boundary) plus an `r2Digest(root) === status.reviewed_sha256` check before runtime load and after the session. No new integrity mechanism |
| I-2 | The run plan holds "fixtures, pair order, nonce seed" | No plan schema or location exists. S3 reads only `plan.pages[].id`; S4 binds a text digest | Defined `tabwise-r2-plan/1` (§4.2), passed as `--plan <path>` and bound byte-for-byte by S4's `plan_sha256`. There is **no nonce seed**: the session draws the nonce itself (`randomBytes(4)`) so no caller can fix it |
| I-3 | §1.3: the session "attaches provenance `'owned-vendored-runtime'`" | Compose refuses any `provenance` key and seals without one. S3 turns any claim into `incomplete` | The session attaches **no** claim. It reports `genuine_evidence:false` and `attestation:'unavailable (O-10)'`. A self-asserted label is exactly what O-10 must replace (§9) |
| I-4 | Compose "no entry imports it" (pinned in `test/r2-review.test.mjs`) | §1.2 rule: "Only `r2-session.mjs` and test files import `r2-compose.mjs`" | The pre-existing assertion was narrowed from `[]` to exactly `['scripts/tabwise/r2-session.mjs']` (§6.3) |
| I-5 | `foreground.mjs` imported statically by the session (§1.2) | It imports `node:child_process` at module level | Made dynamic (after the brand check) like every other capability-adjacent module. It is still reachable through compose's pre-existing closure (`src/speech/capture.mjs`), as disclosed in the S5a handoff §4 |
| I-6 | `--run` "never imports the loader" | `ci/offline-tests.json` refuses unclassified test files (`scripts/offline-tests.mjs:11-13`) | All new tests are in the already-admitted `test/r2-review.test.mjs`. No manifest change is needed |

## 3. S5b: `runR2Session(runtime, data)`

- **First statement:** `if (!isQualificationRuntime(runtime)) throw Error('R2 session requires the owned vendored runtime');`. It runs before any `await`, any read of `data`, and any dynamic import. A Proxy test shows zero traps on either argument.
- **Before any effect, in order:**
  1. The one-page-per-process latch.
  2. An exact `data` key set, then a single `structuredClone`.
  3. `runtime.assertAuthentic()` plus `getGate() === guard`.
  4. The dynamic capability imports, then `assertAuthentic()` again.
  5. An absolute evidence path.
  6. Pure validation: the served copy (`applyTitleNonce` against the approved hash), `buildR2StepMap`, `planR2EvidenceCaps`.

  The nonce and the session id are generated here.
- **Effects:**
  - A loopback listener on `127.0.0.1:0`; any request that reaches it fails the page.
  - The exclusive S3 writer.
  - Owned Chromium via `launchServer` with `BROWSER_ARGS`, a PID check, `createIsolatedContext`, then the S1 recorder init script. A launch that outlives its bound is closed when it settles and never reaches compose.
  - The runtime's foreground probe.
- **Handles (exactly S5a's contract):**
  - `guard` and `getGate` from the runtime.
  - `createExecutor` wraps `createGuardedPressExecutor`: `assertAuthentic` and the gate identity are checked before `execute`, before the foreground check (i.e. before arm), and after disarm. A failure stops the gate, and a later failure never replaces an earlier executor error.
  - `nvda.start` passes `{settings}` from `runtime.cfg`, checks the settings read-back (`settingsMismatch`) and requires the relay owner to equal the receipt PID. It returns only `{pid, relay_pid, reset_confirmed}`.
  - `observer.open` calls `createSpeechObserver` with the runtime's `NVDAClient`, `relayOwnerPid` and the start receipt.
  - `foreground.check` is `foregroundMismatch(await probe.check(), {pid: chromiumPid, nonce})`.
  - `page.{evaluate, screenshot (png), axe, close}`. Axe output is reduced to rule ids, impact and targets to fit the 512 KiB lane.
- **Cleanup (each step bounded at 10 s and recorded):**
  - The browser is closed only when the gate has no live send.
  - Then the observer, the foreground probe, and a best-effort seal of the evidence when compose never ran.
  - Then the loopback listener, then post-session authenticity.
  - Any non-complete outcome stops the gate (`protocol`); an earlier stop keeps its identity.
- **Result:** JSON-only, `tabwise-r2-session-result/1`.
  - `nvda` is `stopped`, `not-started` or `unconfirmed`, derived from compose's recorded teardown order and errors.
  - `evidence_verdict` comes from the S3 writer's own verification (always `synthetic` or `incomplete` today), with `genuine_evidence:false`.
  - `completed` needs all of: a complete compose, post-session authenticity, no loopback request, no cleanup error, no reason, and **a live gate**.

## 4. S6: `scripts/tabwise-r2.mjs` and `scripts/tabwise/r2-run.mjs`

### 4.1 Gate sequence (`checkR2Entry`, before any runtime import)

1. **Strict CLI.** Exactly one mode and exactly one `--plan <path>`; `--page` takes an id matching `^[a-z][a-z0-9-]{0,63}$`. Refused: unknown flags, `--x=y`, duplicates, positional extras.
2. **Opt-in.** `TABWISE_R2_ENABLED` must be exactly `'true'`. Inherited loader hooks are refused: any `NODE_OPTIONS`, `NODE_PATH` or `NODE_TEST_CONTEXT` (case-insensitive), any `R1T_*` fault switch, or non-empty `execArgv`.
3. **Status, plan and approval.**
   - `r2-status.json` must be `enabled:true` and `PASS`. The shipped status fails here, **before git runs or the plan is read**.
   - The plan file is then read: a regular file of at most 1 MB.
   - `parseR2Plan` runs, and the `--page` id must be in the plan.
   - `git rev-parse HEAD`, then `checkR2Approval` over the exact plan bytes. This checks the hosted CI and workflow guard, Windows, actor, run identity, retired decisions, `R2_FILES`, the R2 and qualification digests, and `plan_sha256`.
4. **Checkout.** `git status --porcelain --untracked-files=all` must be empty. The revision equals the approved one (step 3).
5. **Integrity.** `checkFrozenIntegrity(root)` and `r2Digest(root) === status.reviewed_sha256`. Then the selected fixtures are loaded:
   - a regular file whose real path is inside the plan's real directory;
   - at most 100 000 bytes;
   - `pageHash` equal to the plan's `fixture_sha256`.
6. **`--page` only (`runPage`).**
   - `createQualificationIntegrity` (HEAD, clean tree, frozen and qualification digests, full hashes of every tracked file) and the R2 digest.
   - `await import('./tabwise/qualification-loader.mjs')`, then `loadQualificationRuntime({root, additionalIntegrity: phase.checkSend})`.
7. **Brand.** `isQualificationRuntime(runtime)`.
8. **Session.**
   - Crash handlers, SIGINT/SIGTERM and a 600 s deadline are installed; each one stops the gate.
   - `await import('./tabwise/r2-session.mjs')`, then `runR2Session(...)`.
   - On every path afterwards: `verifyPhase()`, the R2 digest, `assertAuthentic()`, `getGate() === guard`, and a live gate. Any failure stops the gate.
   - Output: one `tabwise-r2-page-exit/1` stdout line and the session JSON on stderr. Exit 0 only if complete.

`--check-only` prints `runtime_loaded:false` after step 5. `--run` stops after step 5 and coordinates children (§4.3). Neither can reach `runPage`, which is pinned by tests S6-S1 and M27. An exit code set by a crash handler is never overwritten.

### 4.2 Plan schema `tabwise-r2-plan/1` (exact keys at every level)

```json
{"schema":"tabwise-r2-plan/1","split":"development|withheld","spec":{"ackMs":1000,"timeoutMs":5000,"observationMs":1500,"pollMs":50},
 "handleTimeoutMs":10000,"focusWaitMs":5000,
 "pages":[{"id":"validation-healthy","fixture":"validation/healthy.html","fixture_sha256":"<64 hex>","task":[{"step":"to-email","press":"Tab"}]}]}
```

- 1 to 64 pages, with unique ids.
- Fixture paths are relative with `/` separators; `.`, `..`, backslashes and drive letters are refused.
- Task entries are exactly `{step, press}`. Each page's step map and §8.2 caps are planned at parse time.
- Order is the listed order. "Healthy then broken within each pair" is the plan author's responsibility. It is recorded by S3's run manifest, and the plan is approved byte-for-byte.

### 4.3 `--run` coordinator (`runR2Pages`)

- **Children.**
  - One child per page, strictly sequential. The next child starts only after the previous one emitted `close` **and** its stdout was accepted.
  - The command is `process.execPath [entry, '--page', id, '--plan', planPath]` with `shell:false`, `windowsHide:true` and no `execArgv`.
  - The child gets an allowlisted environment (`r2ChildEnv`): exact names such as `PATH`, `SYSTEMROOT` and `APPDATA`, plus the `GITHUB_`, `RUNNER_` and `TABWISE_R2_` prefixes. It never gets `NODE_*`, `R1T_*`, the qualification or observer opt-ins, or any `*TOKEN*`/`*SECRET*`/`*PASSWORD*`/`*CREDENTIAL*`/`*_KEY` name (e.g. `GITHUB_TOKEN`).
- **Acceptance.** Exactly one stdout line with the exact key set `{schema, page, completed, nvda, manifest_sha256, reasons}`:
  - the expected page;
  - `completed === true`;
  - no reasons;
  - `nvda === 'stopped'`;
  - a 64-hex manifest digest.

  `class` and `provenance` keys are refused. The child's JSON never sets the run class.
- **Bounds.** Child timeout 720 s, then SIGKILL; kill grace 10 s; stdout cap 64 KiB (overflow kills); forwarded stderr at most 1 MiB per child.
- **Status codes.** A coordinator verdict replaces the child's own code in the S3 run record:

  | Code | Meaning |
  |---|---|
  | 124 | timeout |
  | 125 | result refused |
  | 126 | spawn error |
  | 127 | exit unconfirmed |
  | 128 | signal |
- **End of run.**
  - If any child's exit is unconfirmed, the run is **not sealed**: that child may still be writing.
  - Otherwise `sealR2Run` and `verifyR2Run` recompute every page class from disk. `run_class` comes from the verifier and is at best `synthetic` today.

## 5. Trust-boundary analysis

| Question | Answer and evidence |
|---|---|
| Can an unbranded object reach a capability? | No. The brand check is the first statement (S5b-S1), and the loader's WeakSet is the only brand site (S5b-S2: one `runtimes.add(`). Fabricated, frozen, cloned, prototype-derived and Proxy runtimes are refused with no gate, NVDA or foreground use (S5b-N2/N3). No capability module is resolved before refusal (S5b-N4, measured in a fresh module graph with a resolve hook) |
| Can any entry other than S6 reach S5b? | No module other than the entry names `r2-session.mjs` (`r2-policy.mjs` lists it as a reviewed-scope path string), and the entry imports it dynamically only in `runPage` (S5b-S2, S6-S1). Only S5b imports S5a (pinned) |
| Can `--check-only`/`--run` load a runtime? | Not in the reviewed code: static S6-S1 plus mutations M27 and M28. Executed with the shipped BLOCK status in a worker: zero loader, session, compose, browser, observer, executor or network resolutions (S6-E1) |
| Test-only bypass? | None. No `NODE_ENV`, test flag or `TABWISE_R2_TEST` exists, and the entry reads no environment variable itself (S6-S1). Inherited `NODE_OPTIONS`, `R1T_*` and `execArgv` are refused (S6-G3) and stripped from children (S6-R2) |
| Failed authorization and sending capability? | A refusal before the loader creates no gate (S6-E1). After the loader, every non-complete path stops the gate: the session catch (`abort('session refused')`), `!completed` → `abort('incomplete')`, and the session's own stop (pinned; M29) |
| Synthetic shown as genuine? | No. Neither S5b nor S6 writes a class or claim. `genuine_evidence:false` is constant. The run class is recomputed by S3, whose genuine path is unreachable (`ATTESTATION_UNAVAILABLE`, `r2-evidence.mjs:32`) |

**Not guaranteed (INFERENCE):** as `R2-L2-production-binding-design.md` §1.4 states, the static rules show that the reviewed code follows the graph. They do not stop hostile code in the same process.

## 6. Tests

### 6.1 New tests (27, all in admitted `test/r2-review.test.mjs`; no new file, no CI manifest change)

| Group | Rows |
|---|---|
| **S5b boundary** | N1 unbranded values with an untouched data Proxy. N2 fabricated runtime with a real `sendGate` (gate unused, no calls). N3 frozen, cloned, `Object.create` and Proxy runtimes (zero traps). N4 fresh-graph resolve log. S1 exact imports, one export, first statement, all 12 dynamic imports after it, forbidden names. S2 only S6 reaches S5b, only S5b imports S5a, the loader brand is unique |
| **S6 helpers** | A1 CLI (21 invalid vectors). P1 plan schema (24 invalid plans, 5 invalid byte inputs). P2 fixture hash, CRLF, missing file, file symlink and directory junction escape. G1 shipped BLOCK before git, plan or frozen check. G2 opt-in exactness. G3 hooks. G4 the passing path, then 10 single-gate failures plus a wrong declared fixture hash and a post-approval plan edit. R1 run directory. R2 child environment. R3 command vector with spaces, quotes and `&` |
| **S6 coordinator** (stub EventEmitter children; no process) | C1 sequential. C2 stop at first non-zero exit. C3 timeout and unconfirmed exit. C4 16 malformed, incomplete, oversized or claim-bearing outputs with exit 0. C5 spawn throw, spawn `error`, signal, late output. C6 never seal over an unconfirmed exit |
| **S6 entry** (real entry in a worker thread, isolated env, no process) | E1 shipped BLOCK in 5 mode/env combinations: exit 2, empty stdout, no runtime resolution. E2 4 usage errors |
| **Static** | S1 entry import placement and order. S2 `r2-run` capability-free, `R2_FILES`, BLOCK. Failure-path pins: completion requires a live gate; refusal stops the gate; exit code preserved; never seal over an unconfirmed exit |

### 6.2 RED → GREEN (MEASURED, `node --test --test-timeout=20000 test/r2-review.test.mjs`)

- **RED:** tests were written first against absent modules, giving 43 tests, 18 pass, 25 fail. All 25 failures were new rows; every pre-existing row passed.
- **Test-side corrections before GREEN (no production effect):**
  - `assert.rejects` with a RegExp matches `String(error)`, which starts with `Error: `, so the brand regex was adjusted.
  - `r2-policy.mjs` names the session in `R2_FILES`, so that file is excluded from the "names the session" scan.
  - Comment lines are stripped before the `r2-run` capability regex.
- **GREEN:** 43/43. After Phase E fixes and two added rows (C6 and the static failure-path pins): 45/45.

### 6.3 Changed pre-existing test (disclosed)

`S5a static: no entry or production module imports r2-compose` asserted `importers === []`. S5b is required to import `composeR2Page` (design §1.2, rule quoted in the test comment), so the assertion is now `['scripts/tabwise/r2-session.mjs']` and the title says "only the S5b session". This narrows the original test to the design's rule; it does not hide a regression. Any other importer still fails it.

### 6.4 Not covered offline (would need a production bypass, so not built)

- The authentic success path and any behaviour after `isQualificationRuntime` is true:
  - the handle wrappers' runtime calls, NVDA settings read-back and relay check;
  - browser launch and loopback;
  - axe on the CSP page;
  - the one-page latch (M6);
  - post-session checks.
- `runPage` (needs a real branded runtime); `--run` with real children; Windows `child.kill` semantics.
- `checkFrozenIntegrity` passing: it needs `node_modules`, so in G4 the frozen check is injected (a stub for the pass row, a failing stub for the refusal row).

## 7. Mutation results (MEASURED; each mutant one exact replacement, `node --test` on `test/r2-review.test.mjs`, SHA-256-verified restore)

Killed 30/32. Kill types:
- **Behavioural:** M1, M2, M3, M4, M7–M17, M19, M21–M25, M28, M31, M32.
- **Static pin only (weaker):** M5, M26, M27, M29, M30.
- **Test timeout:** M18 (an unconfirmed exit never settles, so the test times out).

| Id | Mutation | Result |
|---|---|---|
| M1/M2 | brand check removed / accepts any object | KILLED (5 rows) |
| M3/M4 | capability import / data read before the brand check | KILLED |
| M5 | session completion ignores a stopped gate | KILLED (static) |
| M6 | one-page latch removed | **SURVIVED.** Unreachable offline (needs a branded runtime). The loader's one-shot refusal (`qualification-loader.mjs:17`) is the primary guard |
| M7–M12 | opt-in truthy, hooks ignored, early BLOCK removed, approval ignored, dirty accepted, frozen ignored | KILLED |
| M13/M14 | fixture containment / hash removed | KILLED |
| M15/M16 | page-exit extra keys / NVDA termination not required | KILLED |
| M17/M18/M19 | continue after failure / no kill grace / timeout unclassified | KILLED |
| M20 | `settled` guard removed in the close handler | **SURVIVED, equivalent:** `settle()` is idempotent, so nothing observable changes. Not counted |
| M21–M25 | credential filter, duplicate mode, run dir inside the checkout, unconfirmed sealable, extra plan page keys | KILLED (M21 only after `GITHUB_TOKEN` was added to R2; it would otherwise have been equivalent) |
| M26/M27/M28 | entry brand check removed / `--run` reaches `runPage` / loader imported before the gates | KILLED (M28 behaviourally in the worker) |
| M29/M30/M31 | session refusal leaves the gate live / crash exit code overwritten / refusal exit 0 | KILLED |
| M32 | S5b dropped from `R2_FILES` | KILLED |

## 8. Verification (MEASURED, Linux Node v22.22.0, no `node_modules`)

| Command | Result |
|---|---|
| `node --test --test-timeout=20000 test/r2*.test.mjs` | 588/588 pass, 0 fail/cancelled/skipped, exit 0 (baseline 561 + 27 new) |
| `node scripts/offline-tests.mjs --profile ordinary --seed 1` | 45/48 PASS, exit 1. The 3 FAIL are environmental: `tabwise-qualification-loader`, `tabwise-review-integrity` and `vendor`, all `ENOENT .../node_modules/@guidepup/guidepup/...`, identical to baseline. Every R2 file PASS |
| `node scripts/offline-tests.mjs --profile stress --seed 113262` | see §8.1 |
| `node scripts/check-r1-baseline.mjs` | `{"ok": true, "errors": []}`, exit 0 |
| `git diff --check` | exit 0; trailing-whitespace grep of the three new files: none |
| Repeated: `--test-name-pattern 'S6-(C\|E)\|S5b-N4'` 15 times | 15/15 runs: 9 pass, 0 fail |

### 8.1 Stress profile

`node scripts/offline-tests.mjs --profile stress --seed 113262` exits 1 (MEASURED).
- repeat-1, repeat-2, serial, slow-fs-30, slow-fs-100, stall-40 and mixed: each 45/48. The same three environmental files fail every time, and every R2 file passes.
- random-113262 cannot run on Node 22: `bad option: --test-randomize`, the same as the baseline.
- The stress run began before the last two test-only edits (the Windows temp name and the junction). The final `test/r2-review.test.mjs` was re-run under the mixed fault settings (`NODE_OPTIONS=--import ./test/helpers/faults.mjs`, `R1T_FS_DELAY_MS=30 R1T_STALL_MS=60 R1T_STALL_EVERY_MS=80`): 45/45, exit 0.

## 9. O-10: attestation and genuine provenance (decision-ready; owner decision required)

**Today (CITED).**
- Any provenance claim gives `incomplete` (`r2-evidence.mjs:310-313`).
- C-3's production entry requires `genuine-unqualified` (`speech-payload.mjs`, `openVerifiedR2SpeechEvidence`), so it refuses.
- Nothing in this patch changes that. A field, a local hash, the child's JSON or a caller object can never promote a page.

**What must be bound.**
1. **Run origin:** repository, workflow file and ref, `head_sha`, run id, attempt 1, actor, GitHub-hosted runner.
2. **Reviewed source:** HEAD, `r2Digest` (R2 reviewed-source digest), `qualificationDigest`, the integrity receipt `manifest_sha256` (every tracked file), and the frozen R1 baseline revision.
3. **Runtime:** loader-branded (in-process fact) plus the runtime `versions` and NVDA settings read-back.
4. **Page:** page manifest sha256, which already commits to session id, nonce (transform record), fixture and served hash, step map, caps and every lane file hash.
5. **Run:** run manifest sha256, which commits to plan hash, order, exit codes and page manifest digests.

| | A. GitHub artifact attestation over the sealed run manifest (recommended) | B. OIDC token stored with the evidence | C. Owner custody countersignature |
|---|---|---|---|
| Mechanism | A workflow step after `--run` exits 0 attests a subject file `r2-attestation-subject.json`: the run-manifest sha256 plus items 1–3. It uses the job's OIDC identity (Sigstore/Fulcio certificate, Rekor log) through a pinned `actions/attest-build-provenance` | The child or parent requests an ID token (audience `tabwise-r2`) and stores it beside the manifest | The owner downloads the artifact, runs `verifyR2Run` offline, and signs a custody record with an owner key |
| Proves origin | Yes: certificate identity = repo, workflow ref, SHA, run id, attempt, hosted runner; transparency-logged | Run identity only. The token is a bearer credential and cannot carry the manifest digest | No. It proves custody after download, not where the evidence was produced |
| Binding to evidence | Subject digest = sealed run manifest, which transitively commits to every page file | Weak: the token is not bound to the digest | Strong for custody only |
| Replay / copy / cross-run | Refused when the verifier requires certificate run id, SHA and workflow to equal the run manifest's recorded identity, and the nonce/session to be unique per page | A copied token within its lifetime can label other bytes | n/a |
| Self-asserted `genuine-unqualified` | Impossible: only an independent verifier can raise the class, and only from a verified certificate chain plus page recomputation | Possible to misuse | n/a |
| Costs and gates | New pinned action in the workflow (S7 governance); `id-token: write` and `attestations: write`; verification needs a Sigstore trust root (a new dependency such as `sigstore`, or the `gh attestation verify` CLI and network). **Install and workflow gates** | Same permissions; custom JWT verification (a dependency) | Key management; no origin proof |

**Recommendation: A, combined with C for custody.**

**Trust assumptions:**
- GitHub OIDC and the Sigstore roots are honest.
- The hosted runner image is not compromised.
- The reviewed code at the attested SHA is what ran (enforced by the S6 gates plus per-send integrity).
- The verifier pins the expected repository, workflow path, ref and actor.

**Remaining risks:**
- Attestation proves which workflow produced the bytes. It does not prove physical NVDA behaviour (P-1 to P-12).
- A compromised runner could produce validly attested false evidence.
- Verification needs network or a pinned trust root.

**Crash and partially sealed runs.**
- Attest only after `--run` exits 0 and `verifyR2Run.ok`.
- A crashed, unconfirmed or unsealed run has no subject and stays `incomplete`.
- The step must be `if: success()` and must never use `always()`.

**How S5b supplies session evidence without breaking S5a.**
- S5a stays claim-free; the page manifest stays as sealed.
- Each `--page` child writes, after compose returns, a **sibling** `session-<id>.json` (runtime versions, settings read-back, integrity `manifest_sha256`, `r2Digest`, browser version and PID, page manifest digest) **outside** the S3 page directory.
- The parent includes these files in the attestation subject.
- This needs an S3 change: `sealR2Run`/`verifyR2Run` currently refuse any extra run entry (`r2-evidence.mjs:679-680, 697-698`). The coverage rule must admit exactly `session-<id>.json` per page, with schema checks.

**Implementation order after owner approval:**
1. Reject-only verifier tests: missing, copied, cross-run and tampered subject.
2. The S3 coverage change.
3. The workflow step (S7).
4. The independent verifier.

No schema code was added in this task, because adding a subject schema without its verifier would add surface and protect nothing.

## 10. O-11: C-3 arm-input custody (decision-ready; owner decision required)

**Constraint.** Arm inputs are derived **after** sealing: the C-3 builder reads sealed evidence through `openVerifiedR2SpeechEvidence`. Writing them inside a sealed page directory would break the S3 seal and coverage. Writing them into the run directory would break `verifyR2Run`'s exact coverage.

| | A. Separately sealed sibling `arm-inputs/` beside the run directory (recommended) | B. Extend the run manifest to list `arm-inputs/<id>.json` |
|---|---|---|
| Sealing | Own manifest `arm-inputs/manifest.json` and `manifest.sha256`, written once | The run manifest must be written after the builder runs, which delays the run seal and mixes two custody steps |
| Independence | The run seal stays immutable; arm inputs can be rebuilt and compared | One seal; rebuilding needs a re-seal |
| S3 change | None | `sealR2Run`/`verifyR2Run` coverage and schema |

**Recommendation: A.** Proposed schema:

```
tabwise-r2-arm-inputs/1 {schema, run_manifest_sha256, builder:{redaction_version, allowlist:'buildArmPayload speech', r2_sha256},
 pages:[{id, page_manifest_sha256, model_eligible, reasons:[...], payload_file|null, payload_sha256|null,
         redaction:{version, edits:<count>, nonce_commitment}|null}]}
```

**Verification rules:**
- The `run_manifest_sha256` file and every listed page manifest exist and verify (`verifyR2Run`).
- Exactly one entry per plan page, with no extra files.
- Each eligible payload is **recomputed** from the sealed page and must equal the stored bytes and `payload_sha256`.
- An ineligible page has `payload_file:null` and a non-empty reason taken from the builder's refusal.
- A missing page is a refusal, never treated as "not eligible".
- The arm-input manifest never changes a page or run class.

**Tamper tests (to write when approved):**
- a payload byte changed;
- a page dropped or added;
- `model_eligible:true` where the recomputation refuses;
- a swapped run manifest;
- a payload copied from another run (`run_manifest_sha256` mismatch);
- a redaction record that does not reproduce.

**Missing or failed eligibility.** Today every page is ineligible: the production entry requires `genuine-unqualified`. A record with `model_eligible:false` and the reason is the correct output, and no payload exists.

**`nonce_commitment`.** Do not store `sha256(nonce)` (see O-12 finding 3). Store an HMAC under a per-run secret kept only in sealed evidence, or omit it.

**No active storage path was implemented**, as the task requires.

## 11. O-12: partial and split nonce leakage (decision-ready; owner decision required; current rules unchanged)

**Measured (MEASURED; pure `redactNonce` from `src/r2/speech-payload.mjs` on nonce `3f9a0c1b`; script output kept in the Claude scratchpad):**

| Input (records) | Current result |
|---|---|
| `title Drafts 3f9a0c1b, window` / `3 f 9 a 0 c 1 b` / `3F9A0C1B` | redacted to `[run-nonce]` |
| `x3f9a0c1bx` (glued) | refused (complete nonce remains) |
| `3 f 9 a`, `three f nine a`, `three-f-nine-a`, `3.f.9.a`, split spaced across records `3 f 9` / `a 0 c` | refused (4+ run) |
| **`3f-9a-0c-1b`, `3f 9a 0c 1b`** | **passes through: complete nonce in 2-character chunks** |
| **`3f9a, 0c1b`** (one record; the observer joins vendored speech parts with `", "`, `observer.mjs:39`) | **passes through: complete nonce** |
| **fullwidth `３ｆ９ａ０ｃ１ｂ`; `3f9a` + U+200B + `0c1b`** | **passes through: complete nonce** |
| `Drafts 3f9a`, `f9a0c`, `3f9a0c1` (contiguous partial); `3f9a` / `0c1b` split across records | passes through (the disclosed gap) |
| ordinary `deaf cafe`, `3 of 9 apples`, `press f 9 a`, `1990 clicked` | pass through (no false refusal) |
| ordinary `item 3 f 9 a list` (coincidental 4-run) | refused (a false refusal) |
| 400 000-char single-character tokens; 210 000-char near-miss | 86 ms; 37 ms (linear) |

**Findings:**
1. The disclosed gap is **wider than recorded**. Several forms of the *complete* nonce pass: 2-character chunks, a comma-space split inside one record (the observer's own join), Unicode compatibility forms, and zero-width characters. The "complete-nonce" check (`speech-payload.mjs:139-140`) is a raw substring test, so separators defeat it.
2. Partial (4–7 character) contiguous fragments and unspaced cross-record splits pass, as disclosed.
3. `redaction.nonce_sha256 = sha256(nonce)` (`speech-payload.mjs:142`) is **not hiding**. The nonce has 32 bits, so the hash can be inverted by brute force in seconds to minutes. Wherever the redaction record travels, the nonce travels.
4. No observed false refusal on ordinary phrases except a coincidental 4-run of single characters.

| | A. Keep current rules | B. Normalized hex-chunk rule, `nonce-redact/2` (recommended) | C. Zero tolerance: never redact; any nonce trace makes the page ineligible |
|---|---|---|---|
| Rule | Literal/spaced redaction; raw complete-substring check; single-character 4-runs | On a copy: NFKC, remove `\p{Cf}` (zero-width), lowercase, digit words to digits. Tokens = maximal `[0-9a-z]` runs. A run of consecutive all-hex tokens is joined across any separators, **including record and phrase boundaries**. Refuse if any token or joined run contains any 4-character nonce substring (5 substrings) after the literal/spaced redaction. Raw speech is untouched; edits are recorded; the verifier recomputes | Refuse if B's detector finds any 4-gram before redaction; no `[run-nonce]` output |
| Guarantees | Only the forms in the first table row | No 4+ character nonce substring survives in any hex-token run, within or across records or phrases, in any listed form | No nonce-derived 4+ substring ever reaches a model |
| Cannot guarantee | Finding 1 forms leak | Fragments of 3 or fewer characters; fragments interleaved with non-hex words (`3f9a is 0c1b`, where each half is caught but a 2+2 split separated by words is not); homoglyphs outside NFKC; spellings like "eff", "bee" | Same detector limits as B; ineligibility could affect pages where NVDA reads the title mid-journey (likely the dialog-focus broken page) |
| False refusals (INFERENCE) | rare | about 5 / 16⁴ per random 4-hex window. English all-hex words (`deaf`, `cafe`, `added`) refuse only if they contain a nonce 4-gram. Expected ≪ 1 % of pages, recorded with reason | Every page whose speech includes the title |
| Complexity | linear | linear: one pass, run buffer capped at 11 characters, 5 substring checks; input already bounded by lane caps | linear |

**Recommendation: B**, plus:
- replace `nonce_sha256` with an HMAC under a per-run secret, or drop it;
- record the redaction version and every edit, as now;
- verifier recomputation;
- keep raw speech verbatim in the sealed lanes;
- a false refusal makes the page ineligible with its reason; it is never silently passed.

Version bump to `nonce-redact/2`. Required tests: every row of the measured table, plus ordinary-speech false-refusal controls.

**Not implemented**, pending the owner's choice.

## 12. Phase E adversarial review: findings and dispositions

| Finding (own code, before GREEN was final) | Disposition |
|---|---|
| A gate stop after compose completed (crash handler, deadline) was not reflected in session or page completion | Fixed. Both now require a live gate; pinned (M5, M29) |
| `process.exitCode = await main()` could overwrite a crash handler's 2 with 0 | Fixed (M30) |
| `--run` would seal while a child whose exit was unconfirmed might still write | Fixed: `r2RunSealable`; C6, M24 |
| A browser launch past its bound leaked when it later resolved | Fixed: closed on settle; never handed to compose (not offline-testable) |
| Session `data` read through a shallow spread | Fixed: single `structuredClone` |
| The credential filter test was vacuous (no allowlisted-prefix credential) | Fixed: `GITHUB_TOKEN` and others added; M21 now killed |
| Windows: `"` in a temp-dir name; file symlink EPERM | Fixed: no quote; directory escape via junction; the file-symlink row runs only where the link can be created (disclosed) |

**Residual risks (not fixed; owner-visible):**
1. **R-1 Independent parent termination evidence is absent.** The vendored `NVDA.stop()` calls `quit.js`, which waits for both relay-listener disappearance and owned-process termination (`quit.js:19,38-43`). The parent accepts the child's successful stop report plus child `close`; it does not independently collect those OS observations. The remaining concern is parent/coordinator custody of termination evidence and broader Windows descendant-process cleanup, not an absence of lifecycle checks. A separate reviewed parent probe remains live-qualification work.
2. **R-2 Windows process trees.** `child.kill('SIGKILL')` terminates only the Node child, so Chromium, NVDA and the PowerShell probe can outlive it. After a timeout the run stops and is not continued. The hosted VM is ephemeral. Option: `taskkill /T /F` (a new process capability; owner decision).
3. **R-3 Environment allowlist on Windows is unmeasured.** NVDA or Playwright may need a variable outside the allowlist; the effect would be a child failure (fail-closed).
4. **R-4 Identity check per send, full hash only at phase boundaries.** As designed in D67; a same-identity content swap is detected only at teardown.
5. **R-5 Duplicate JSON members: corrected in the targeted review follow-up (§17).** Plans and page-exit results now reject duplicate decoded member names before schema acceptance, including escaped equivalents at arbitrary nesting depths. Approval digest rules are unchanged.
6. **R-6 Axe on the CSP-restricted page** and screenshot size against the 500 000-byte cap are unmeasured (P-new). A failure makes the page incomplete.

## 13. Windows acceptance commands (owner; PowerShell, Node 24.22.1, after `npm ci`)

```powershell
node --test --test-timeout=20000 test/r2*.test.mjs
node scripts/offline-tests.mjs --profile ordinary --seed 1
node scripts/offline-tests.mjs --profile stress --seed 113262
node scripts/check-r1-baseline.mjs
git diff --check
$env:TABWISE_R2_ENABLED='true'; node scripts/tabwise-r2.mjs --check-only --plan nonexistent.json; $LASTEXITCODE   # expect 2, "R2 refused: BLOCK: R2 status is disabled/BLOCK"
Remove-Item Env:TABWISE_R2_ENABLED
```

Expected after the targeted review corrections: R2 599/599; ordinary 48/48 and stress 8 × 48/48 on Windows (all three environmental files pass with `node_modules`); frozen R1 `ok:true`. Watch:
- whether S6-P2's file-symlink row was exercised;
- worker-thread rows S5b-N4 and S6-E1/E2 under Node 24 (`module.registerHooks`).

## 14. Pending owner decisions and gates

- **Decisions:** O-10 (attestation, §9), O-11 (arm-input custody, §10), O-12 (nonce policy, §11). R-1 and R-2 process checks. O-1 to O-9 and P-1 to P-12 remain open (design §14).
- **Gates:**
  - S7 workflow (`.github/workflows/tabwise-r2.yml`) is not created.
  - The status-only activation commit is not made.
  - Independent review of S5b/S6 is required before any status change.
  - A hosted NVDA dress rehearsal on a development pair is required for the authentic path.
- **Authorization record:**

  | Action | Done? |
  |---|---|
  | Commit, push, merge, tag, branch or checkout | No (a stop hook asking for a commit is declined per the task) |
  | Install | No |
  | API call | No |
  | Browser, NVDA, physical input | No |
  | Hosted dispatch | No |
  | Activation or `passes:true` | No |
  | `FEATURES.json`, status, workflow, CI manifest, governance, `.claude`, frozen R1 or vendor edit | No |

## 15. Recommended owner-controlled commit boundaries

1. `feat(r2): add S6 default-blocked entry and run coordinator`: `scripts/tabwise-r2.mjs`, `scripts/tabwise/r2-run.mjs`, the S6 rows of `test/r2-review.test.mjs`.
2. `feat(r2): add S5b authentic session`: `scripts/tabwise/r2-session.mjs`, the S5b rows, and the narrowed S5a importer assertion.
3. `chore(r2): extend R2_FILES for S5b/S6; handoff and ledgers`: `scripts/tabwise/r2-policy.mjs`, this document, CODEMAP, STATE, LOG, DECISIONS.

Commits 1 and 2 share `test/r2-review.test.mjs` and `R2_FILES`, so committing them together is acceptable. Each body should cite F-03/R2-L2 and `node --test --test-timeout=20000 test/r2*.test.mjs`.


## 17. Targeted independent-review corrections (2026-10-31 IST)

Scope authorized by the owner: only `scripts/tabwise/r2-run.mjs`, `scripts/tabwise/r2-session.mjs`, `test/r2-review.test.mjs`, and this handoff. Preexisting uncommitted changes retained; no status, policy, dependency, frozen R1, vendor or workflow edits in this follow-up. O-10/O-11/O-12 and Windows process-tree cleanup remain unresolved owner/live-qualification work.

| Defect | Correction | Behavioral regression evidence |
|---|---|---|
| A relative component named `..evidence` was mistaken for a parent traversal; lexical validation missed aliases | Component-aware comparison, Windows case folding, existing checkout resolution, and nearest-existing-ancestor resolution of the proposed directory through `realpathSync.native` (including native Windows canonicalization). Missing suffixes are appended only after resolving a directory ancestor. Dangling aliases, file ancestors, missing checkout roots and resolution errors refuse. Validation creates no directories. | FIX1 exercises inside/root/nested paths, valid external/sibling paths with spaces, Windows case variants, real junctions with missing suffixes, dangling junctions, file ancestors and directory symlinks where supported. |
| `JSON.parse` silently kept the last duplicate member | Shared private `parseUniqueJson` uses JSON.parse as the grammar oracle, then an iterative token scan with a separate decoded-name set per object. Strings are skipped with JSON escape handling; array/object nesting has no recursive call stack. Both callers preserve their bounds and schemas; approved-plan hashing is unchanged. | FIX2 feeds actual duplicate-bearing JSON strings at top level, spec, pages, nested arrays and child results, including escaped-equivalent names; tests independent objects, escaped strings, malformed/truncated documents and valid controls. |
| Observer acquisition could finish after cleanup had already checked a null handle | Acquisition is tracked before invoking the factory. The first close marks teardown; late acquisition closes its owned handle and rejects admission. Close is memoized across compose/session cleanup, including rejected closes. Every tracked rejection has a handler while remaining observable to cleanup. Bounded cleanup that cannot confirm termination records an observer error and cannot COMPLETE. | FIX3 executes the session body in a fresh in-memory module with module boundaries replaced by fakes. Covers normal/repeated close, acquisition rejection, late acquisition, cleanup before settlement, delayed/failed/unsettled close, duplicate open and false-success refusal. No real capability is loaded or started. |

**RED (MEASURED, run_id `s5b-s6-fixes-red`):** 8 focused regression tests: 2 pass, 6 fail on the original source. Later adversarial missing-checkout-root and native-alias cases each failed before their corrections. **GREEN:** targeted file 55/55 and full R2 suite 598/598 before the final native-path refinement; final counts are in the acceptance table below on Windows Node 24.22.1. Final acceptance results are recorded below after the ordinary/stress checks finish.

**Test isolation:** only the in-memory session copy substitutes the brand/module boundaries and shortens its cleanup wait to 80 ms. The on-disk brand check, capability imports, 10-second cleanup bound and composition contract remain intact. Existing static assertions (including CRLF normalization) are retained. Symlink permission failures are permitted only for the explicitly platform-optional symlink row; junction coverage is mandatory on Windows. Test-file encoding failure during authoring was recovered from the recorded original diff and appended test text; the original 45 tests remain present.

**Second adversarial examination (CITED: current source; MEASURED: FIX1/FIX2/FIX3):** inspected decoded-name equality, escapes, per-object scopes, nested arrays, component-boundary comparisons, junctions with non-existent suffixes, root resolution failure, late acquisition, memoized failed closes and pending-close false success. No approval bypass or production test seam was added. Path validation is a read-only observation, not a filesystem lock: an external actor changing aliases after validation is outside the guarantee. Pending acquisition/close cannot be forcibly proven terminated here; the session returns incomplete with an unconfirmed-cleanup error and retains late-close ownership. No physical quiescence claim follows from these tests.


**Additional parser corpus (MEASURED, run_id `s5b-s6-json-adversarial`):** evaluated the exact private scanner in isolation over 2,048 valid documents (matching JSON.parse) and 2,048 duplicate-bearing documents (all rejected), including escaped quotes/backslashes, punctuation, empty keys, `__proto__`, Unicode and lone-surrogate names, and nested object/array scopes.

**Final native-path refinement:** Node 24.22.1's installed ordinary `realpathSync` implementation performs a component walk. Containment now uses its native resolver for both checkout and existing evidence ancestry. A boundary-substitution test models a non-link drive alias whose native canonical identity points into the checkout; it failed with the ordinary resolver and passes with the native resolver. Real Windows junction coverage remains mandatory; no drive mappings were created. The final acceptance rerun uses `cache/ci-h1-final` to separate its artifacts from the earlier run. No further source changes were made after that rerun started.


**Interrupted-run disclosure (MEASURED):** the final-source stress invocation writing `cache/ci-h1-final` encountered a randomized `speech.test.mjs` watchdog timeout and then a profile timeout. Its log records test duration 20,540,771.4839 ms. Windows System / Microsoft-Windows-Power-Troubleshooter records SleepTime `2026-10-30T20:45:53.2826484Z` and WakeTime `2026-10-31T02:28:14.4775583Z`. INFERENCE: machine suspension explains this elapsed-time failure; it is not silently treated as a pass. The failed artifacts are retained. The complete unchanged stress command is rerun with `--out cache/ci-h1-resumed`; thresholds, source and test selection are unchanged. Acceptance below uses that completed rerun.


**Owner-requested single-file retry (MEASURED):** randomized `test/speech.test.mjs`, seed 113262, test timeout 10000 ms and unchanged file watchdog 60000 ms: PASS, 122/122, exit 0. Artifacts: `cache/ci-h1-resumed/test-speech-retry.txt`, `results-speech-retry.json`. The superseded suspension-failed supervisor and its directly owned test child were stopped to avoid duplicate test load; its failed artifacts remain. The complete resumed stress invocation continues separately.


## 18. Final offline acceptance / owner handoff

MEASURED, run_id `s5b-s6-fixes-final`, Windows Node 24.22.1. PASS for offline merge readiness and owner review; live qualification remains BLOCKED. All commands below exited 0. The suspension-failed run remains disclosed in §17 and is not counted as passing.

| Command | Final result |
|---|---|
| `node --test --test-timeout=20000 test/r2-review.test.mjs` | 56/56 tests, zero failed/cancelled/skipped/todo |
| `node --test --test-timeout=20000 test/r2*.test.mjs` | 599/599 tests, zero failed/cancelled/skipped/todo |
| `node scripts/offline-tests.mjs --profile ordinary --seed 1 --out cache/ci-h1-final` | 48/48 selected files, 874/874 tests |
| `node scripts/offline-tests.mjs --profile stress --seed 113262 --out cache/ci-h1-resumed` | All 8 profiles: each 48/48 selected files and 874/874 tests; total 6,992 passing tests |
| `node scripts/check-r1-baseline.mjs` | `ok:true`, `errors:[]` |
| `git diff --check` | exit 0 |

The `--out` parameter changes only the diagnostic destination; selection, seeds, thresholds and profiles are unchanged. Both offline profiles retain the existing 9 excluded files and report their inventory in `selection.json`. JSON results and per-profile TAP logs are retained under the output directories above. The separate owner-requested randomized speech retry passed 122/122 under the original timeouts (§17).

**Scope / preservation:** this follow-up changed exactly the four authorized files: `scripts/tabwise/r2-run.mjs`, `scripts/tabwise/r2-session.mjs`, `test/r2-review.test.mjs`, and this handoff. The original test prefix was compared after newline normalization and is identical; no preexisting tests were relaxed. Preexisting uncommitted patch and ledger changes remain uncommitted. Branch remains `feat/tabwise-r2-s5b-s6`.

**Remaining limits:** directory-junction coverage passed on Windows. This account cannot create directory symlinks (`EPERM`), so the explicitly optional symlink row could not execute here. Non-link native alias behavior is exercised through an in-memory boundary substitution; no drive mappings were created. Read-only ancestry validation cannot lock the filesystem against later alias changes. Observer acquisition/close that cannot be confirmed within the cleanup bound remains incomplete; no physical quiescence follows. O-10/O-11/O-12, independent parent termination custody, Windows descendant cleanup and authentic hosted qualification remain pending.

**Authorization preserved:** `r2-status.json` remains `enabled:false`, `verdict:BLOCK`. No NVDA, physical input, real browser, hosted dispatch, model request, paid service, install, dependency change, S7, attestation or nonce-policy implementation occurred. No commit, push, merge, branch switch, reset or authorization change occurred. Ready for owner review with uncommitted changes.

SHA-256 of the final source/test bytes (MEASURED):

- `scripts/tabwise/r2-run.mjs`: `05e5a57941ce3c9fedb7451b1a5e3bb75c8523ebfd826669764cf53842567117`
- `scripts/tabwise/r2-session.mjs`: `9f65c4f3ba7c29d91e95b3ecc2df153a8c346055ba87a26ab1fa314512361c45`
- `test/r2-review.test.mjs`: `a6f32327ea038035cd0bf6e6e9c75fbeef109067bd57ded60f061890de7e4a56`
