# Independent D-37 safety re-review

## Blockers and major findings

### D37-B01 — BLOCKER — Both hooks sit above asynchronous work that can dispatch after the guard stops

**Files:** src/speech/sendguard.mjs:50–63,97–103; installed node_modules/@guidepup/guidepup/lib/windows/runVbsScript.js:11–30; installed lib/windows/NVDA/NVDAClient.js:176–189,305–322.

**MEASURED P01–P03; CITED SRC:** Normal input routing reaches the hooks, but the hooks do not bracket actual dispatch closely enough. The VBS hook calls the original runner, which awaits realpath, mkdtemp and writeFile before starting cscript. The command hook calls sendKeyCode, whose private #send can await a reconnect before writing a key. Neither path rechecks foreground or the stopped state after those waits. bounded() times out observation of that work; it does not cancel it. The post-check can consequently happen **before** the eventual dispatch.

Independent probes executed the installed implementations with filesystem/process/TLS boundaries replaced by recorders. No real process or desktop input was used:

- P01: pre:away=false → mkdtemp pending → VBS writeFile → execFile cscript:away=true,stopped=false → post:away=true.
- P02: hold VBS preparation past the send bound, change foreground, await the guard's return, then release preparation: pre → pending → post:away=true → VBS writeFile → execFile cscript:away=true,stopped=true.
- P03: connect a real NVDAClient to a fake TLS socket, mark that socket destroyed, hold reconnection past the guard bound, then release it. The installed private #send writes serialized Tab-down and Tab-up messages to the fake socket with away=true,stopped=true. No new pre/post check accompanies these late writes.

**Impact (INFERENCE from measured dispatch traces):** An already-admitted operation can still launch a typing process or submit a key after timeout/shutdown and a failed post-check. The interval includes library I/O/reconnection, beyond the native observation-to-delivery race accepted in D-37. Counting an orphan does not prevent its eventual input. These probes establish unsafe dispatch control flow, not a measured wrong-window event on a real desktop.

**Required fix:** Move the safety boundary below asynchronous preparation/reconnection, with cancellation and positive quiescence of already-admitted work. Reconnection must not resume a stale input operation; a VBS child must not remain free to inject after its parent guard stops. Demonstrate checks/cancellation at the real transport/process boundary, including delayed preparation and reconnect. The current wrappers do not satisfy D-37's conditions. Present the reviewed vendored-patch alternative required by that decision if those conditions cannot be met with wrappers. Do not describe these waits as the accepted native gap.

### D37-B02 — BLOCKER — The executable kills the target left open for an unresolved send

**Files:** src/speech/capture.mjs:129–175; scripts/r1.mjs:95,117–122,193–209; test/speech.test.mjs:1110–1126.

**CITED SRC:** state.finish() detects a live/orphaned send and avoids closing the page. However, the executable subsequently calls unconditional killAll() and immediately exits. Crash completion/deadline paths also call it. These paths do not consult the orphan count, await positive input-worker termination, or wait for kill promises. Killing NVDA does not cancel an already-created or not-yet-created cscript process.

**MEASURED P06:** Evaluate the exact current executable epilogue and its actual browsers/killAll definitions in an isolated context containing a fake browser and a summary with send_guard.unsettled=1: one browser kill is invoked and exit code 1 is selected. The existing cleanup test passes because it stops at runR1; it never executes this epilogue. P02/P03 independently establish that dispatch can outlive the guard.

**Impact (INFERENCE):** Final executable cleanup defeats its own B-02 mitigation and can remove the intended target while pending input can still execute. A FAIL exit does not make that teardown safe.

**Required fix:** Enforce one lifecycle policy through completion, exceptions, signals and deadlines. Positively stop/quiesce the input worker and its children before removing the target. Until that is established, preserve the target as promised and use the disposable VM's supervised teardown. Await termination operations and retain their errors. Add executable-level tests with unresolved sends.

### D37-M01 — MAJOR — Installed-package tests bypass the lower boundaries where B01 occurs

**Files:** test/sendguard.test.mjs:1–30,229–330; test/speech.test.mjs:873–917,1110–1126.

**CITED SRC; MEASURED BASE/P01–P03/P06:** The tests execute installed NVDAClient queue/capture code and installed sendKeys. However, they do **not** use a connected fake socket: new NVDAClient() is left unconnected, so #send returns before .write. Key.prototype.toString is observed instead. The real VBS runner is replaced wholesale by an immediate recorder before hook installation. Preparation, child creation, reconnect and socket callbacks are therefore absent. The runner fake also treats its synthetic phys callback as the physical boundary. The brief's “fake socket” description is inaccurate for these tests.

All seven requested mutations are caught, yet unchanged code still exhibits P01–P03/P06. Those mutation successes do not establish the missing guarantees.

**Required fix:** Retain the useful tests and add safe tests of the actual installed private write path using a fake connected/reconnecting TLS socket, and the actual VBS runner using fake filesystem/execFile boundaries. Assert that delayed work cannot dispatch after stop and that post-checks cannot precede eventual dispatch. Cover executable shutdown/crash paths. Keep real GUI/cancellation trials separately gated to an approved disposable VM.

### D37-M02 — MAJOR — Summary results stay stale after write failure and misdelivery can be PARTIAL

**Files:** src/speech/capture.mjs:294–351; scripts/r1.mjs:200–209; test/speech.test.mjs:988–1031.

**MEASURED P05:** Inject EACCES only for summary.json into the real evidence writer, leaving its directory and other evidence intact. Three healthy fake attempts return result=PASS, evidence.write_errors=[], and state.persisted=false. The actual writer reports summary.json:EACCES; no summary exists. writeSummary() rebuilds only when the non-summary verification list changes; a write-status change alone does not trigger rebuilding. The existing test creates a directory named summary.json, introducing an extra-file finding that masks this case.

**Limit:** The executable's persisted condition correctly prevents exit 0 here. This is a stale PASS report/log and stale diagnostics, **not** a reproduced successful exit without a summary.

**MEASURED P09:** buildSummary with status=aborted and guard.misdelivered=true returns PARTIAL, with the reason “a key was possibly misdelivered” and rerun_allowed=false. D-37 requires detected focus change during a send to mark the run FAIL. Only PASS is downgraded by general safety reasons; aborted PARTIAL is not.

**Required fix:** Refresh write/integrity status and recompute the authoritative result after persistence attempts independently of filename-list changes. Do not emit PASS after failed final persistence. Give misdelivery/safety failure precedence over aborted PARTIAL while preserving the aborted lifecycle status. Test summary-only failure without an extra file and a signal overlapping a failed post-check.

### D37-M03 — MAJOR — Abort loses the current action record and has no summary-write fallback

**Files:** src/speech/capture.mjs:250–276,389–419; scripts/r1.mjs:108–122; test/speech.test.mjs:785–810,1033–1058.

**MEASURED P07:** Abort while typing the middle character of step 2, with only summary writes returning EACCES. The fake receives type calls for A and d, but attempt-1.jsonl contains only step 1. state.step is 2. Both summary writes fail, persisted=false, and the diagnostic sink contains only “r1 abort: SIGINT: cleanup running”; it receives no summary fallback or write-failure detail. The writer deliberately does not throw, so the handler's catches do not report these failures. It never inspects state.persisted.

**CITED SRC:** Completed characters/phrases are buffered locally until the whole step ends. The aborted branch returns before writing that record. Summary-before-cleanup preserves the reached step, not the pending action and its partial phrases. The evidence journal detects damage but is not exported as recovery evidence; deleted records can remain absent from the final artifact despite still being buffered in memory.

**CITED GH-CANCEL; INFERENCE:** Cleanup still serially waits for guard idle, acquisitions/raw logs and teardown. Installed quit uses a synchronous operation with a 30-second timeout, which an in-process timer cannot interrupt. GitHub documents escalation after 7.5 seconds and then 2.5 seconds before process-tree termination. Summary-before-cleanup improves survival but does not establish full pending-evidence retention or completed independent teardown within cancellation. No real cancellation chain was exercised here.

**Required fix:** Persist action intent and partial step data before slow cleanup, preserving the original failure/signal and completed character results. On every abort/crash write failure, inspect persistence status and emit the current scrubbed summary plus writer diagnostics to the independent CI log before exit. Export recoverable buffered/journal evidence when a file is known lost, retaining the damage flag. Supervise blocking input/teardown outside the evidence-writing process and define a cancellation-compatible total budget. Add behavioral tests for partial typing, abort summary-only failure, recovery and executable failure paths.

### D37-M04 — MAJOR — Hook loss after startup verification bypasses the running guard

**Files:** src/speech/sendguard.mjs:105–119; scripts/r1.mjs:138–142,175–182; src/speech/capture.mjs:184–203,250–256.

**MEASURED P08:** Install hooks and obtain hooks.verify()==[]. Then restore the original NVDAClient.prototype.sendKeyCode and send Tab through the installed connected client/fake TLS socket. Even with the guard disarmed and its configured check rejecting the window, both key messages reach the socket. Guard status remains stopped=false,sends=0. Manually calling verify() afterwards reports the missing hook, but production never calls it again. The dispatch properties are not protected against replacement.

**Scope:** This is injected hook loss, not evidence that this Guidepup package spontaneously replaces the method or that an attacker was present. It tests D-37's explicit missing-hook condition. The caught install-time mutation is distinct from loss after a successful startup check.

**Required fix:** Preserve the hook invariant throughout execution, including asynchronous actions. Protect production dispatch entries against replacement and fail closed on integrity loss at a trusted calling boundary. Wire verification into runtime lifecycle, not only a test that manually invokes verify(). Demonstrate that removal/replacement of either hook after successful initial verification cannot dispatch an unguarded command or character.

## Full assessment and verdict

**Verdict: BLOCK.** There are two blockers and four major findings above. Runtime wrappers do not meet D-37's immediate-dispatch, stop/cancellation and missing-hook conditions. D-36's safety blockers are not both closed. Keep R1 execution blocked; present the vendored-patch alternative under D-37 if complete safe interception cannot be demonstrated.

Reviewed by Codex against main 6cf0598 and the current uncommitted/untracked changes. Timestamp from date -u: **2026-10-27T10:13:45Z**. This is an independent source review and safe fault simulation, not a real NVDA safety result. I read the complete D-37 brief, D-36 review/brief, I-01, D-36/D-37/D-38 decisions, F-02 specification and current diff, including new files. SRC below denotes that reviewed source snapshot; original repository contents were checked for changes before writing this report.

### All eight review questions

| Question | Independent answer |
|---|---|
| 1. Complete interception/other input | **CITED SRC; MEASURED BASE/P01–P03:** Normal Windows keyboard routes lead through sendKeyCode or runVbsScript: Control cancellation, commands/chords and character typing. The only socket-write site is private #send; its two connect handshake messages are not key commands. Windows activate/quit scripts go through the VBS export and are rejected by the single-SendKeys allowlist; NVDA start/stop have their own process operations. No runner page.keyboard, click, Alt+Escape or raising call was found. Routing through an outer hook is insufficient: asynchronous preparation/reconnection defeats dispatch-time checks/cancellation (B01). |
| 2. Installed package; ESM/CJS | **CITED SRC; MEASURED BASE:** Installed client queue/stopReading and sendKeys execute. ESM importing the CJS package sees the same NVDAClient class/prototype and one cached copy in the supplied test. No ESM/CJS divergence was demonstrated in this configuration. But the tests have no connected socket and replace the whole VBS runner (M01). My additional probes reach the installed socket-write and VBS-process boundaries using fakes. |
| 3. Fail closed, stale checks, missing hooks | **MEASURED BASE/P10:** Failed/thrown/missing/no-verdict checks are rejected; unarmed sends are refused; queued sends serialize; stop is sticky; a late successful pre-check does not release its key. A helper reply delivered after timeout cannot satisfy the next check: both readings return pid:null,error:probe timed out. Initial verification detects missing hooks. **P02/P03/P08:** Already-admitted lower work can dispatch after stop, and post-verification hook loss bypasses the guard (B01/M04). |
| 4. Immediately before/after physical send | **CITED SRC; MEASURED BASE/P01–P03/P09:** Both PID and nonce are required; the helper only reads user32 Get functions. Normal post-mismatch sticky stop works in the tested guard. Checks bracket a library promise, not every eventual dispatch. A timed-out promise can be post-checked before it sends. There is no measurement establishing 50 ms as delivery/remote-processing acknowledgement. A 2,000 ms timeout bounds waiting, not admitted work's lifetime. Aborted misdelivery is incorrectly PARTIAL (M02). Accepted whole-chord/native-gap limits do not cover these library waits. |
| 5. Dependency pin | **MEASURED HASH; CITED SRC:** All seven raw-byte pins match: package metadata, NVDA, NVDAClient, keyCodeCommands, Key, sendKeys and runVbsScript. Runner source refuses mismatch/empty dependency lists before Guidepup import; the drift mutation fails the pin test. These are selected interception pins, not every transitive helper/runtime file: parseKey, KeyCodes, Modifiers, teardown and startup/quit helpers are outside the seven. Package-lock integrity fixes installation inputs; selected hashes/read-only attributes do not constitute a fully immutable runtime. Matching pins do not establish correct hook placement. |
| 6. Prior D-36 findings | Complete closure matrix below. B-01/B-02 and several major findings remain partly/not fixed. |
| 7. Workflow/security/isolation/artifacts | **CITED SRC/GH-PINS; MEASURED RO:** Dispatch-only, main-only job; one hosted Windows job; concurrency without cancelling an active run; contents:read; persisted checkout credentials disabled; no referenced user secrets/Meta credentials; package-lock install with scripts disabled. Three full SHAs resolve to official action metadata using node24. Read-only attributes are applied after installs/before tests, and equivalent scratch tests still pass. Evidence is outside checkout; diagnostics/upload are separate always-run steps. _runner/job.json makes the artifact nonempty even without run evidence, so if-no-files-found:error does not enforce a summary/manifest. Early refusal already fails R1; diagnostic upload success does not reverse that. See notes below. |
| 8. Seven negatives/mutations | **MEASURED MUT01–MUT07:** All seven independently exercised outside the repository and caught, with every failing test location below. Unchanged code nevertheless exhibits P01–P09's additional defects. Mutation success is not proof of desktop safety. |

### Closure of every prior D-36 finding

“Fixed” is limited to the specified source/offline behavior; it does not certify a hosted run.

| Prior ID | Status | Evidence / remaining work |
|---|---|---|
| B-01 actual sends unguarded | **PARTLY FIXED** | Hooks cover normal Control/command/character routes. Asynchronous dispatch still escapes immediate checking/stopping: D37-B01. |
| B-02 live input while target closes | **NOT CLOSED** | Sticky stop/orphan accounting and core page retention improve it; lower dispatch stays live and executable cleanup kills the retained target: D37-B01/B02. |
| M-01 abort/crash/late resources | **PARTLY FIXED** | Aborted state is rechecked after the outer probe; crashes stop the guard; delayed start/open promises are awaited or given stop/kill callbacks. Those callbacks are not positively completed before executable exit, and admitted input remains live. BASE; capture:129–153; B01/B02/M03. |
| M-02 cleanup/raw failure can PASS | **FIXED for the reviewed acceptance path** | Summary rejects cleanup errors/missing raw for a started attempt; run stops on cleanup errors. Existing summary/cleanup tests pass. Separate B02/M02 defects remain. |
| M-03 individual damage invisible | **PARTLY FIXED** | Journal catches individual deletion/truncation/change/extra files. P04 stops at one attempt and FAILs on mid-run tampering. Recovery/current-step retention remain incomplete: M03. |
| M-04 final-write decision stale | **PARTLY FIXED** | Persisted status prevents exit 0 without a summary; summary-only EACCES still returns/logs stale PASS. P05/M02. |
| M-05 cancellation/evidence order | **PARTLY FIXED** | Aborted/crashed summary is attempted before cleanup. Pending-action evidence and nonthrowing write failures are not independently retained/reported; blocking quit and shell/npm/node cancellation are not supervised/verified. M03/GH-CANCEL. |
| M-06 first-error diagnostics | **PARTLY FIXED** | fail()/cleanup diagnostics report ordinary failures, preserving the first stored action error; baseline preservation test passes. Failed-step evidence.record still precedes fail logging; abort write failure has no fallback. capture:276–280,415–419; P07/M03. |
| M-07 interference prevention | **PARTLY FIXED** | External evidence, pre-step/post-attempt dirty-tree and dependency/test/locked-hash checks, and read-only attributes improve detection. They do not prevent edit-and-restore, ignored unpinned-file changes, or in-memory hook loss. S8 accurately calls attributes a speed bump and discloses the polling limit; do not claim an immutable/exclusive runtime. |
| M-08 evidence test wrong folder | **FIXED** | fileURLToPath, root/content hashes, spaces/non-ASCII/sentinel tests. BASE/ISOLATION. |
| S-01 mutable action tags | **FIXED** | Full SHA pins and independent retrieval of official pinned metadata. GH-PINS. |
| S-02 workflow/ref binding | **FIXED as accidental-use guard** | Exact event/repository/workflow/main ref and nonempty 40-hex SHA equality checks plus job condition. Caller-controlled environment values are correctly not machine attestation. |
| S-03 CRLF tests | **FIXED** | Workflow assertions normalize and run LF/CRLF; BASE/RO pass. |
| S-04 artifacts | **PARTLY FIXED** | Current-job RUNNER_TEMP tree, unique name and explicit diagnostics improve scope. _runner masks absent summaries from empty-path detection; nvda.log stays raw; download-through-R7 remains an operational requirement. |
| S-05 coverage overclaims | **PARTLY FIXED** | Meaningful guard/lifecycle/integrity cases and seven caught mutations added. Actual dispatch boundaries/executable shutdown and real cancellation remain uncovered. M01/P01–P09. |
| N-02 host/scored-run wording | **NOT FIXED** | Frozen PLAN/FEATURES still name the personal host; later decisions prohibit it. No durable scored-run approval register added. Append an authoritative cross-reference/register rather than rewrite frozen gates. Concurrency alone does not prevent another scored run. |

**CITED SRC; INFERENCE:** N-01 remains a runtime uncertainty: browser-server PID is used for exact HWND ownership equality, but that mapping has not been measured on the eventual hosted image. Keep failure closed; do not broaden the allowed process set to make a run proceed. Hosted desktop/audio/VBScript availability and actual cancellation delivery remain unmeasured. No blanket claim that hosted Windows cannot run NVDA is made.

### Independent verification and required mutations

**MEASURED BASE/HASH/RO/ISOLATION:** Scratch root: C:\Users\<redacted>\AppData\Local\Temp\d37-codex-review-Sn6ZJB, outside D:\Projects\Meta AI\app. It contains copies of current project files and installed dependencies, not an installation/worktree. Ignored secrets/cache/evidence and .git were not copied. Node: v24.22.1.

- npm test in scratch: **116 pass, 0 fail**. Recorded full-suite baseline rerun: 116 pass, 0 fail, no skips/cancellations; 00-baseline.tap.
- node --test test/speech.test.mjs test/sendguard.test.mjs: **100 pass, 0 fail**; 100-tests.tap.
- Equivalent workflow read-only attributes on copied project files and Guidepup lib, then full suite: **116 pass, 0 fail**; readonly-tests.tap. This checks offline tests under attributes, not real R1.
- node scripts/r1.mjs --hashes, separately compared with the lock: **10 file/spec hashes, 7 dependency hashes, zero mismatches**; hash-output.json and hash-results.json. The command prints hashes; comparison was independent.
- Frozen normalized PLAN gates SHA-256: ca0c9feb568e7c9c4ea41832607f510af0cbf5548242adcd77f729e039af3362.
- Before report creation: **43 original repository files unchanged by content hash**; git status --porcelain --untracked-files=all --ignored identical to the pre-review snapshot; actual docs/evidence absent. repo-isolation-results.json. Only this report is intentionally written in the repository.

Each mutation started from restored scratch source and source was restored at the end. Runs used node --test --test-reporter=tap test/*.test.mjs, matching npm's test set. The table lists **all failing tests**, identified by current repository file/test-declaration line. SG = test/sendguard.test.mjs; SP = test/speech.test.mjs. Full names/errors remain in the corresponding numbered TAP files and mutation-results.json/mutation-locations.json.

| Run / required fault | Exact mutation | Pass / fail | All failing test locations |
|---|---|---|---|
| MUT01 hook removed after install | Restore runVbsScript=origVbs immediately after assigning wrapper | 110 / **6** | SG:191,203,217,304,317,332 — install/verify/ESM, sendKeys, combined typing, foreign-script rejection |
| MUT02 unguarded sendKeyCode | Restore proto.sendKeyCode=origKey immediately after assigning wrapper | 107 / **9** | SG:191,203,217,229,246,260,273,295,317 — install/verify/ESM, Control/commands, pre/post failures, delayed/outside-action input, typing |
| MUT03 pre-check always passes | Replace pre verdict with [] | 102 / **14** | SG:65,77,93,111,125,166,229,246,304,317; SP:899,937,952,1091 |
| MUT04 post-check always passes | Replace post verdict with [] | 107 / **9** | SG:65,142,166,229,260,304,317; SP:899,920 |
| MUT05 dependency hash changed | Append harmless comment to installed scratch Key.js; retain old pin | 115 / **1** | SG:388 — raw-byte/version pin test |
| MUT06 tampering check ignored | Return [] from writer verify(); existing tests actually tamper individual files mid-run | 114 / **2** | SP:1006,1024 — individual damage and summary-persistence cases |
| MUT07 import order regressed | Move dynamic Guidepup import before installSendGuard() | 115 / **1** | SP:1211 — install/import ordering |

**MEASURED P04:** Independently of MUT06's disabled-check regression, the unchanged writer was subjected to actual mid-run attempt-1.jsonl replacement: result FAIL, evidence_check names “attempt-1.jsonl: changed”, and the run stops at one attempt. Thus both the required tampering negative and detection of protection removal were demonstrated.

**Limits:** MUT05 tests hash drift detection without an executable R1 invocation, even with simulated CI variables. Refusal ordering/empty-list behavior were reviewed in source. MUT07 is caught by a source-order test, not executable end-to-end coverage. No required mutation survived; P probes expose additional defects in unchanged code.

### Additional reproduction artifacts

All artifacts below remain outside the repository. They are safe harnesses, not instructions to execute real R1.

| Command, from scratch probe-app | Recorded cases/output |
|---|---|
| node lowlevel.mjs | P01 VBS preparation gap, P02 VBS dispatch after stop, P03 reconnect/key writes after stop, P08 post-verification hook loss. Scratch root lowlevel-results.json. Installed Guidepup code with synthetic filesystem, cscript recorder and fake TLS only. |
| node runner-probes.mjs | P04 tampering, P05 summary-only EACCES, P06 exact executable-epilogue evaluation with fake browser/exit, P07 aborted typing/persistence failure. Scratch root runner-probe-results.json. |
| node extra-probes.mjs | P09 aborted-misdelivery verdict precedence, P10 late helper reply. Scratch root extra-probe-results.json. |
| node mutations.mjs, from scratch root | Baseline/seven mutations and per-case TAP logs. Copied app now has read-only attributes from later verification; remove attributes only in that scratch copy before replaying mutations. |

The low-level probes shorten deterministic bounds to force delayed-completion orderings. The admitted promise also remains uncancelled at the production 2,000 ms bound; that is a control-flow inference, not a measured GUI timeout.

### Changed tests and workflow notes

**CITED SRC; MEASURED BASE/RO:** No lowering of original speech expectations, ten-step structure, 3/3 gate or frozen gates hash was found. The two Alt+Escape tests and retry assertion changed to follow D-36's removal of focus cycling. The D-37 upload-path assertion follows evidence relocation. LF/CRLF extraction retains the workflow assertions and adds newline coverage. The evidence-path change strengthens coverage by using the decoded real path and contents. These replacements are not themselves weakening. Material coverage gaps are M01 and the summary-failure/cleanup tests identified above.

**SHOULD-FIX — artifact contract, .github/workflows/r1.yml:53–73:** if-no-files-found:error applies to any matched files; _runner/job.json satisfies it even without run directories/summary. The diagnostic records that absence and refused R1 still fails the job. Do not claim that this option establishes complete current-run evidence. Add explicit expected-file/summary validation distinguishing diagnostic-only preflight failure from missing started-run evidence. Keep failures/partials uploadable. nvda.log is not sanitized/page-only: classify it as diagnostic data outside the speech payload, review paths/titles before any approved sharing, and maintain download/retention through R7. No disclosure/upload occurred here.

**SHOULD-FIX — first-error ordering, src/speech/capture.mjs:276–280:** Step records are written before fail() emits the first error. The nonthrowing writer reduces masking, but specified first-error-before-error-evidence ordering is still absent. Log/store the original action failure before persistence, and test diagnostic order against writer calls as well as cleanup. M03 covers abort's separate missing fallback.

**CITED SRC; INFERENCE:** The 2,000 ms/50 ms choices have no real delivery validation. Preserving a target for unresolved input is reasonable, but the executable violates that policy (B02). Crashes being FAIL, guard stops forbidding PASS, and attributes being described as a speed bump are appropriate conservative choices. Thirty-day expiry is compatible only with the stated download-through-R7 obligation; it does not establish durable retention.

### Sources and execution boundaries

- **SRC:** Current uncommitted source/tests/workflow/spec/decision/incident snapshot at main 6cf0598; scratch content baseline/lock output retained above. I-01 stays open with competing explanations. Its setup-failure/rerun classification remains INFERENCE with incomplete evidence. Missing evidence was not treated as proof that no step executed.
- **GH-CANCEL (CITED):** [GitHub workflow cancellation reference](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-cancellation), retrieved in this review. It documents entry-process signalling/escalation, not guaranteed completion of this harness's cleanup.
- **GH-PINS (CITED):** Official metadata at exact configured [checkout SHA](https://raw.githubusercontent.com/actions/checkout/3d3c42e5aac5ba805825da76410c181273ba90b1/action.yml), [setup-node SHA](https://raw.githubusercontent.com/actions/setup-node/949feb2413d6458794dcd2491c4babbbce0c15c1/action.yml), and [upload-artifact SHA](https://raw.githubusercontent.com/actions/upload-artifact/cf430e030ddbb5b0abf93d22962f4752f3646cd9/action.yml). These support action identities/node24 metadata and upload-input behavior. No Actions run was triggered.
- Platform references were fetched through the already cached Context7 CLI: one library resolution, two documentation queries. Pinned metadata was checked independently. No CLI/dependency installation occurred.
- No real NVDA startup, R1 invocation, foreground-probe PowerShell process, real browser launch, desktop keys, workflow trigger, Meta API call, dependency installation, implementation edit, commit or push occurred. Mutation/probe files and outputs were created outside the repository. STATE/LOG/CODEMAP/decisions were deliberately not edited under the report-only instruction.

**Final verdict: BLOCK.**

