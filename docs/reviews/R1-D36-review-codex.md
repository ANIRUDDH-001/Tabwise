# Independent adversarial review: Tabwise D-36 / R1 / I-01

**Verdict: BLOCK**

Reviewer: Codex. Reviewed 2026-10-27. Verification completed at 08:11:39 UTC (13:41:39 IST). Base: main, 6cf0598, including the actual uncommitted changes and untracked files. This review does not authorize execution.

“Confirmed” means established from source or the specified read-only measurement. It does not mean a wrong-window event was reproduced. No real NVDA, Guidepup, browser automation, desktop input, workflow or Meta API call was started.

## Blocker and major findings

### B-01 — BLOCKER — The guard does not cover Guidepup's actual keyboard sends

- **Classification:** Confirmed unsafe control flow; actual wrong-window input remains unmeasured.
- **Files/evidence:** src/speech/capture.mjs:118–133, 166, 182; installed node_modules/@guidepup/guidepup/lib/windows/NVDA/NVDA.js:679–684, 714–718; NVDAClient.js:230–258, 280–303; windows/sendKeys.js:23–27.
- **Finding:** key() checks once before the public API call. With capture enabled, Guidepup sends stopSpeech (Control), waits for cancellation or a 1000 ms timeout, then waits another 250 ms. It repeats while speech arrives. Only afterwards does it execute the requested action. This affects type as well as press and perform. No foreground check precedes repeated Control sends or the delayed requested key. Typing additionally writes a temporary VBS file and starts cscript after the outer check. Synchronous focus-evidence writes add another interval before dispatch.
- **Impact:** Tab, Enter, a character or an internal Control can reach another window after a passing check. The brief's “short gap” understates the library's waits and repeated input. The public-call-order test does not establish S1.
- **Corrective action:** Use a reviewed adapter/library change that checks ownership and cancellation at every actual send, including stopSpeech and the final action after waits. Remove hidden input loops. Keep execution on an isolated disposable desktop. Document the remaining native observation-to-send race and obtain a decision on that residual risk; this check is not atomic targeting. Test simulated focus changes during capture cancellation and before character injection.

### B-02 — BLOCKER — Timeout leaves live input running while its target is closed

- **Classification:** Confirmed.
- **Files/evidence:** src/speech/capture.mjs:19–27, 93–112, 129–133, 181–195, 244–252; installed NVDAClient.js:166–169, 213–218, 233–256, 280–303.
- **Finding:** withTimeout uses Promise.race, not cancellation. An action can time out while still inside Guidepup's stopReading loop, waiting to inject its requested key. Cleanup bounds the raw-log wait, closes/kills Chromium, then calls nvda.stop(). Guidepup stop waits for in-flight actions; it does not cancel an action already past the queue's stopped check. runR1 also continues after an ordinary action timeout.
- **Impact:** A delayed key can execute after its original browser disappears, or overlap cleanup/a later attempt, even though its public call was initially guarded.
- **Corrective action:** Treat uncertain input completion as fatal to the whole run. Cancel and positively quiesce the input worker and cscript children before removing the target window. Use an independently supervised process boundary where cancellation is unavailable. Do not begin another attempt while old input can execute. Test timed-out actions that later resume, not only promises that hang forever.

### M-01 — MAJOR — Abort/crash handling can allow more work and miss late-created resources

- **Classification:** Confirmed.
- **Files/evidence:** src/speech/capture.mjs:93–115, 129–153, 181–183, 268–282; scripts/r1.mjs:88–96, 117–133.
- **Finding:** key() does not recheck state.aborted after awaiting the probe. A signal during that wait can start cleanup and still allow send(). The crash handler never marks the run aborted/stopping. started becomes true only after start resolves; page is assigned only after browser.open resolves. Once-only cleanup can finish with neither resource recorded while interrupted/timed-out acquisition later creates NVDA or Chromium.
- **Impact:** Input can begin during shutdown; late-created processes can escape cleanup already marked finished. Native signal propagation through the workflow's shell/npm chain is additionally unverified.
- **Corrective action:** Use one stopping state checked after every asynchronous boundary and immediately before dispatch; set it on crashes. Register ownership when processes launch, terminate resources from late resolutions, and account for acquisition still in progress. Test signals/crashes during start, browser creation and a pending foreground check.

### M-02 — MAJOR — Failed cleanup or missing raw logs can still produce PASS

- **Classification:** Confirmed.
- **Files/evidence:** src/speech/capture.mjs:95–114, 197, 208–230; src/speech/validate.mjs:83–130; test/speech.test.mjs:541–557.
- **Finding:** Cleanup failures only populate cleanup_errors; status stays completed and error can remain null. Failed raw-log capture sets raw to null. judgeAttempt/judgeRun reject neither cleanup_errors nor missing raw evidence. buildSummary adds failure reasons only for interference/evidence-writer status. Three otherwise healthy attempts can therefore PASS despite failed raw capture or termination. Cleanup tests assert calls/errors, not the resulting run verdict.
- **Impact:** PASS can lack mandatory unfiltered evidence or claim fresh isolation despite unsuccessful teardown. This weakens the frozen “no errors” and raw-retention requirements.
- **Corrective action:** Require raw evidence and successful lifecycle isolation for acceptance. Fail and stop further attempts when cleanup leaves process state uncertain. Preserve the original error separately from cleanup failures. Add full-run verdict tests.

### M-03 — MAJOR — Individual evidence deletion/replacement is invisible

- **Classification:** Confirmed.
- **Files/evidence:** src/speech/capture.mjs:44–60; src/speech/runguard.mjs:19–20; test/speech.test.mjs:578–587, 666–679.
- **Finding:** The writer checks only directory existence. Deleting attempt-1.jsonl while retaining its directory makes appendFileSync silently recreate truncated history. Deleting an already-finished raw/focus/attempt file is never checked. repoSnapshot excludes every own-run evidence path, so those deletions/replacements are not interference. Tests delete the entire folder instead.
- **Impact:** PASS can accompany lost/altered evidence, including the individual-file deletion described in I-01. Directory recreation is damage handling, not integrity verification.
- **Corrective action:** Track expected files, append offsets/counts and digests; detect disappearance, truncation, replacement and unexpected files before scoring/upload. Retain a recoverable independent journal or buffered records; permanently flag damage as non-PASS. Test individual deletion during and after attempts.

### M-04 — MAJOR — Final summary-write failure occurs after the PASS decision

- **Classification:** Confirmed.
- **Files/evidence:** src/speech/capture.mjs:208–235, 254–259; scripts/r1.mjs:92–95, 148–165.
- **Finding:** evidence.status() is copied before evidence.summary() writes. If that final write fails, or recreates a just-deleted directory, the returned summary retains healthy evidence status and potentially PASS. The executable warns about write_errors but exits from stale summary.result. Abort lacks equivalent stderr fallback. buildSummary also does not force crashed status to non-PASS when all attempts already satisfy judgeRun.
- **Impact:** Exit 0 and/or a PASS artifact/log can occur without a retained final evidence set; crash status can contradict its result.
- **Corrective action:** Make final persistence/integrity part of the authoritative result and exit decision. Refresh status after writes; never announce successful PASS after failed final persistence. Emit current diagnostics to stderr on all failure paths, including abort; crashed must rule out PASS. Test summary.json-only failure and deletion immediately before writing it.

### M-05 — MAJOR — Cleanup deadlines and evidence ordering do not fit cancellation

- **Classification:** Confirmed design/deadline mismatch; actual hosted cancellation unverified.
- **Files/evidence:** src/speech/capture.mjs:65–69, 93–112, 274–282; scripts/r1.mjs:95–96; fixtures/r1/steps.json:7; installed windows/NVDA/quit.js:17–20 and lib/constants.js:8.
- **Finding:** Abort writes the summary after serial raw/browser-close/browser-kill/NVDA cleanup, each nominally allowed ten seconds. Guidepup quit uses spawnSync with a 30000 ms timeout; an in-process timer cannot interrupt that blocking call. The crash handler's overall exit timer is 30 seconds although four serial ten-second stages can be needed, so exit can precede NVDA stop. GitHub documents escalation after 7.5 seconds, then another 2.5 seconds, then process-tree termination. [Cancellation reference](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-cancellation).
- **Impact:** Cancellation can kill the runner before the partial summary is written, and cleanup stages may never be reached despite claimed bounds. always() cannot upload evidence never persisted.
- **Corrective action:** Immediately persist aborted/crashed state and current-step/action intent before slow cleanup. Supervise blocking work out of process, budget a platform-compatible total deadline, and preserve independent termination attempts. Verify real shell/npm/node cancellation only in a separately approved disposable-runner test. Keep forced-kill/VM-loss limits explicit.

### M-06 — MAJOR — Normal first errors are not printed before evidence work

- **Classification:** Confirmed.
- **Files/evidence:** src/speech/capture.mjs:87–89, 136–137, 189–203; scripts/r1.mjs:86–99, 146–164; docs/ledger/PLAN.md:146.
- **Finding:** fail() records an error but does not print it. Most failures are caught within runAttempt, bypassing executable catch/crash stderr logging. Final reporting prints validator reasons rather than a.error itself and occurs after raw/summary writes. For a startup failure, the original cause is available only in the summary. Cleanup-only failures also never become the first error field. Abort can exit after failed summary persistence without printing its in-memory summary.
- **Impact:** S3's first-error-before-writing guarantee is missing for ordinary failures; artifact/write loss can again remove the useful cause from runner logs.
- **Corrective action:** Emit the first error through an injected diagnostic sink when recorded, before subsequent writes/cleanup, preserving stack/cause. Log later cleanup errors separately. Test output ordering for ordinary setup, input, evidence and abort failures.

### M-07 — MAJOR — Post-attempt snapshots do not prevent repository interference

- **Classification:** Confirmed gap against D-36's stronger prevention requirement.
- **Files/evidence:** src/speech/capture.mjs:244–250; src/speech/runguard.mjs:15–32; scripts/r1.mjs:57–65, 139; docs/ledger/DECISIONS.md:80.
- **Finding:** There is no exclusive-run lock or immutable runtime snapshot. Detection happens after an entire attempt. An edit followed by restoration before the snapshot leaves identical HEAD/status/hashes. Persistent ordinary untracked files are correctly detected, but ignored files (including node_modules) and all own-run evidence paths are omitted. Concurrent processes can affect a live attempt before detection.
- **Impact:** Transient interference can affect input/evidence and still permit PASS. Disposable-VM and one-job isolation help but do not turn polling into prevention.
- **Corrective action:** Execute a verified immutable/read-only runtime/fixture snapshot with separately writable evidence, and enforce exclusive use by cooperating tools. Add sticky monitoring/checks before further input; define dependency/ignored-path integrity. Test edit-and-restore, transient untracked files, live fixture changes and evidence tampering. Describe detection accurately.

### M-08 — MAJOR — The evidence-isolation test checks the wrong folder here

- **Classification:** Confirmed by read-only path evaluation.
- **Files/evidence:** test/speech.test.mjs:148–172.
- **Finding:** URL.pathname remains percent-encoded. Here it is /D:/Projects/Meta%20AI/app/docs/evidence/. Manual drive-letter removal plus resolve checks a literal Meta%20AI directory instead of Meta AI. Read-only evaluation confirmed the tested path does not exist. Both listings can be empty while the real evidence changes. The listing also compares size/mtime rather than content.
- **Impact:** The new “docs/evidence unchanged” assertion does not protect this workspace. Actual temporary-folder deletion is narrowly scoped and is not itself deleting real evidence.
- **Corrective action:** Use fileURLToPath and a content-aware snapshot of the actual directory, including root existence. Test spaces, escaped/non-ASCII characters and a seeded evidence sentinel. Retain cleanup restricted to mkdtemp-owned folders.

## Other should-fix findings

### S-01 — SHOULD-FIX — Action implementations are not frozen by the R1 lock

- **Classification:** Confirmed configuration; compromise/update impact is a risk.
- **Files/evidence:** .github/workflows/r1.yml:22, 26, 50; fixtures/r1/lock.json:18.
- **Finding/impact:** Mutable @v7 tags freeze only tag text in the YAML hash, not action code. Read-only contents and no user secrets limit exposure, but actions execute on the desktop runner and handle evidence. The v7 versions genuinely exist and their official metadata currently specifies node24; nonexistent versions are not a finding. [Checkout](https://raw.githubusercontent.com/actions/checkout/v7/action.yml), [setup-node](https://raw.githubusercontent.com/actions/setup-node/v7/action.yml), [upload-artifact](https://raw.githubusercontent.com/actions/upload-artifact/v7/action.yml).
- **Corrective action:** Pin verified full commit SHAs, record provenance and update the approved R1 lock. A reviewed workflow dependency lockfile is another option. GitHub describes both approaches and mutable-tag risk in its [secure-use reference](https://docs.github.com/en/actions/reference/security/secure-use).

### S-02 — SHOULD-FIX — The runner guard does not bind the approved workflow/ref

- **Classification:** Confirmed acceptance gap; no bypass executed.
- **Files/evidence:** src/speech/runguard.mjs:6–11; scripts/r1.mjs:32–39, 62; .github/workflows/r1.yml:6–18.
- **Finding/impact:** Three environment strings do not establish workflow identity, manual trigger or approved repository/ref. Another hosted Windows workflow can call this script outside the r1 concurrency group. Outside Actions, these strings are caller-controlled: an accidental-use guard, not hosted provenance. Missing/empty GITHUB_SHA bypasses equality checking. The workflow is manual-only but lacks an approved-ref condition; dispatch can reference a branch/tag. [Dispatch documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch).
- **Corrective action:** Require a valid nonempty SHA and exact equality; validate event, repository, workflow identity and approved ref in workflow and script. Keep concurrency at the trusted workflow boundary. More environment checks alone cannot attest an arbitrary local machine; document that trust limit.

### S-03 — SHOULD-FIX — Workflow tests fail on CRLF checkout

- **Classification:** Confirmed conditional defect; exact future runner checkout unmeasured.
- **Files/evidence:** test/speech.test.mjs:698–715; .gitattributes:1–3; .github/workflows/r1.yml:37–38.
- **Finding/impact:** Tests read raw YAML and require literal LF after on:, permissions: and concurrency:. Read-only inspection found the on-section pattern matches LF but fails an in-memory CRLF version. No eol rule exists; local core.autocrlf is true. A CRLF Windows checkout can fail npm test before R1 despite valid equivalent YAML. This session's pass used LF workflow text.
- **Corrective action:** Normalize newlines or parse YAML semantically; test LF and CRLF. If mandatory repository line endings are chosen, configure them through the approved governance process.

### S-04 — SHOULD-FIX — Artifact collection can hide missing current evidence and over-collect

- **Classification:** Confirmed configuration; disclosure/expiry before R7 are unverified risks.
- **Files/evidence:** .github/workflows/r1.yml:42–55; docs/ledger/PLAN.md:131.
- **Finding/impact:** Upload covers the entire evidence tree, including any previously checked-in runs. nvda.log is copied without path/title scrubbing; its actual contents were not verified as page-only or relative-path-only. if-no-files-found: warn tolerates no upload, and creating _runner does not ensure a current summary. Thirty-day expiry is not tied to retention through R7.
- **Corrective action:** Collect the current run and explicitly identified diagnostics; require an expected-file manifest/current summary. Represent early preflight failure with an explicit diagnostic artifact. Classify/sanitize logs and retain/download all failed/partial evidence through R7. Keep collection and upload as separate always-run steps.

### S-05 — SHOULD-FIX — Test coverage does not establish the claimed safety guarantees

- **Classification:** Confirmed coverage gap; many tests are nevertheless behavioral.
- **Files/evidence:** test/speech.test.mjs:66–108, 129–138, 361–381, 476–527, 529–575, 682–715, 773–815.
- **Finding/impact:** Of 70 tests, 54 concern speech and 16 budget/client behavior. Useful tests cover validation, partial records, cleanup calls, and fake probe streams. But fakeNvda omits Control/waits/queues/VBS; fakeBrowser supplies the desired PID by construction. Script order, forbidden names, Win32 imports and workflow checks inspect text. Signals are emitted in-process with fake exit, not delivered through CI's process tree. Missing cases include late sends, startup ownership, summary-only write failure, individual deletion, cleanup affecting PASS and escaped evidence paths. Helper tests do not explicitly deliver a late reply after timeout and verify it cannot satisfy another check.
- **Corrective action:** Add deterministic delayed-completion/low-level-send tests that assert outcomes and retained evidence. Exercise script orchestration via injected dependencies or safe subprocesses unable to start NVDA. Add semantic workflow and late-reply checks. Reserve real GUI/PID/signals for an explicitly approved isolated preflight after fixes. Replacing A2 tests follows D-36; it does not itself establish native S1.

## Answers to the brief's eight questions

| Question | Assessment, evidence and action |
|---|---|
| 1. Can a key escape a passing immediate check? | **BLOCKER B-01/B-02: yes at the actual send layer.** Explicit runner perform/press/type calls use key(); Alt+Escape/raising calls are removed. Internal Control loops and delayed final actions remain unguarded. Guard/cancel actual sends. Installed NVDA.js:235–303 confirms start/stop use process operations rather than keys; timeout ownership remains defective. |
| 2. PID/read-only helper/timeout freshness? | **NOTE N-01: HWND ownership mapping is unverified.** scripts/r1.mjs:118–126 uses the browser-server process, not a guessed renderer. Playwright documents process() as the spawned browser process, but does not prove Windows top-level HWND ownership. Unknown/different PID fails closed; no confirmed PID-mismatch misdelivery was established. foreground.mjs:13–25 only calls three read-only Get APIs and does not freeze ownership. Timeout marks the probe dead so future checks fail; physical termination waits until close. Corrective action: later obtain an approved isolated read-only HWND/PID/title/nonce comparison. Keep exact equality; do not broaden to “any Chrome” or arbitrary descendants. [Playwright](https://playwright.dev/docs/api/class-browserserver#browser-server-process), [Microsoft](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getforegroundwindow). |
| 3. Is the residual gap accepted? | **BLOCKER B-01: no acceptance established for this implementation.** D-36 authorizes a read-only check, not seconds of unobserved repeated input. The brief's acceptance question is not user approval. Correct integration, then present unavoidable residual native risk for a decision. |
| 4. Cleanup/first errors/SIGINT/crashes? | **MAJOR M-01/M-02/M-05/M-06.** Independent catches and browser kill fallback improve ordinary cleanup. Late acquisitions, live input, blocking cleanup, error logging and real cancellation remain unresolved. Correct ownership/stopping state, supervision and persistence ordering. |
| 5. Do writes throw; is recreation right? | **MAJOR M-03/M-04.** evidenceWriter catches synchronous mkdir/serialization/write errors. Recreating a lost folder and marking FAIL is reasonable; it cannot recover previous files, misses individual deletion, and evaluates final-write status too early. Verify the complete evidence set and durable fallback. |
| 6. Guard/checkout/setup side effects? | **MAJOR M-07; SHOULD-FIX S-02.** Persistent ordinary tracked/untracked changes, HEAD movement and hash changes are detected. Missing SHA, transient/ignored/evidence interference escape. Installed setup 0.29.3 does nothing on Windows; install registers/downloads in the per-user Guidepup cache. npm ci targets ignored node_modules; standard Playwright browser installation uses its external cache; inspected tests use temporary paths. No definite tracked-tree dirtying from standard setup was identified. No fresh install/CI trial was permitted, so that outcome remains unverified. Keep clean-tree checks and correct the identified gaps. |
| 7. Workflow/security/hosted GUI feasibility? | **SHOULD-FIX S-01/S-02/S-04; MAJOR cancellation M-05.** Actual YAML is dispatch-only, one Windows job, global r1 concurrency without cancellation, contents read, no persisted checkout credentials, no referenced user secrets/Meta credentials, ignored install scripts and separate always-run collection/upload. v7 actions exist. Do not broaden token permissions for artifacts. GitHub documents fresh Windows VMs; Guidepup's own NVDA/Playwright workflow targets windows-2022 and windows-2025. A blanket “hosted Windows cannot run GUI NVDA” claim is unsupported. Neither source proves this exact harness's no-focus-recovery behavior or eventual image's desktop/audio/VBScript/cancellation capabilities. setup --ci performs no Windows preparation here. Pin actions and later verify exact-image capabilities under explicit approval without consuming/tuning another scored run. [GitHub runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [Guidepup workflow](https://raw.githubusercontent.com/guidepup/guidepup/main/.github/workflows/playwright-nvda.yml), [setup implementation](https://github.com/guidepup/setup/blob/main/src/commands/setup/index.ts). |
| 8. Behavioral tests/replacements? | **MAJOR M-08; SHOULD-FIX S-03/S-05.** Independently reproduced 70 passes. Several tests meaningfully verify pure/fake behavior; they do not verify complete desktop safety. A2 replacements follow the changed rule; original validator negatives and ten-step assertions remain. Add adversarial cases and fix the evidence-path assertion. |

## Frozen specification, hashes and incident classification

**MEASURED:** All nine values printed by node scripts/r1.mjs --hashes match the current lock: zero mismatches. The command only prints hashes; comparison was independent. signup.html and validate.mjs retain their previous hashes:

- signup.html: b9f6f6159943c646ffae1f510a07ae9cd65e07c500bab140bcdcd08d4b3d7a71
- validate.mjs: fe19e73d46a3084a90c8ffe1c00ae8b730c2517a7ff080fad24f3b72b04b7fb2

All six old hash entries are preserved exactly under supersedes. Spec/steps/capture/runner hashes intentionally changed; foreground/runguard/workflow are newly covered. Parsed old/current steps and expectations are identical; steps.json changed focus configuration and decision annotation. Package manifests/lockfile and validator have no uncommitted diff.

**MEASURED:** The normalized Day-1 frozen section hashes to ca0c9feb568e7c9c4ea41832607f510af0cbf5548242adcd77f729e039af3362, matching D-23. Ten steps, expected speech, 3/3, $0 Meta budget, 1.5-hour ceiling and the one-scored-run policy are unchanged in the proposed text. M-02/M-04 nevertheless weaken effective enforcement by admitting false PASS. Matching hashes do not establish correct behavior.

**Confirmed ledger state:** INCIDENTS.md:30–43 retains H1–H3 and H-a–H-c as unresolved. “Setup failed before step 1, rerun allowed” is explicitly INFERENCE with incomplete evidence, neither PASS nor voided. Missing evidence does not prove no steps executed. Historical terminal observations, deleted files, process snapshots and nvda.log were not recovered here; their MEASURED labels are historical attributions, not new reviewer measurements. Read the append-only log's older A2 attribution with its later competing-explanations correction.

**NOTE N-02 — inherited documentation inconsistency:** PLAN.md:11, 26 and FEATURES.json's R1 description still name the personal Windows host; D-36/PLAN.md:147 supersede it with hosted Windows. Concurrency serializes runs but does not enforce one scored run across fresh VMs/reruns. **Impact:** future execution/scoring instructions remain ambiguous. **Corrective action:** append an authoritative host/decision-rule cross-reference and keep a durable approval/scored-run register. Do not silently rewrite D-23's frozen section or permit repeat scored attempts. None was performed here.

## Verification and boundaries

- Read the complete brief, actual tracked diff/untracked implementation/workflow/incident files, frozen spec, ledgers, tests, package configuration and installed Guidepup 0.36.4/setup 0.29.3 implementation.
- npm test: exit 0; 70 tests, 70 pass, 0 fail/cancel/skip. Reported duration 5058.0325 ms. This is fake/temporary-file coverage, not a GUI result. Client tests inject fake requests; no live Meta call was used.
- node scripts/r1.mjs --hashes: exit 0; nine hashes independently compared, zero mismatches.
- Read-only path evaluation confirmed M-08. In-memory LF/CRLF pattern comparison confirmed S-03's conditional failure. Parsed old/current steps and old/supersedes locks were compared.
- Used the already cached Context7 CLI with --no-install: one library resolution and two documentation queries. Consulted official GitHub/Microsoft/Playwright sources for platform/security claims. No dependency installation occurred.
- A content-hash baseline of 39 tracked/untracked repository files matched after verification. Only this report is saved; STATE, LOG, CODEMAP, implementation, tests, lock and workflow are deliberately not edited under the report-only instruction.
- No R1 execution, real NVDA/Guidepup startup, foreground-probe process, desktop keys, workflow trigger, dependency install, commit, push or Meta API call occurred. No extra behavioral harness importing real automation was run.

Stopping on focus loss/interference and rejecting damaged evidence are justified choices; removing Alt+Escape and raising is correct. They do not offset the input, lifecycle and evidence defects. **BLOCK remains the verdict pending corrections and independent re-review. Later isolated runtime verification still requires the user's existing approval gate.**
