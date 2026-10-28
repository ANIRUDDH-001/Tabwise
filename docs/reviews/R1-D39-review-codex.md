# Final independent D-39 review of Tabwise

**Verdict: BLOCK.** **D39-B01 is a material send-boundary blocker.** The page acknowledgement can confirm a later missing delivery using an earlier stray key. This defeats the detection on which D-40 accepts the cscript startup and OS-delivery gaps. Under D-39, stop this custom R1 implementation. This report does not authorize or initiate another patch cycle.

Reviewed by Codex, 2026-10-27T15:25:35Z, against HEAD `6cf05987e9fec71bdb65088c6f5e16aabe21012a` plus the current uncommitted/untracked files. Timestamp obtained with `date -u`. Evidence class: independent source inspection and offline fault simulation, not a real NVDA/hosted-desktop result. Independence: reviewer did not implement the patch; tests and claims supplied by Claude were independently checked.

The complete D-39 brief, D-37 report, D-39/D-40 decisions, patch specification rev 3, F-02 amendments, source, tests, vendoring record and workflow were inspected. `SRC` below means this reviewed snapshot. Measured cases use run prefix **D39-CODEX**, with the suffixes below.

## Findings

### D39-B01 — BLOCKER — Control-delimited windows can acknowledge a key before its send

**Material send-boundary blocker: YES.**

**Locations:** `src/speech/sendguard.mjs:43,65–92,222–241`; `src/speech/capture.mjs:279–280,346–350`.

**MEASURED P04; CITED SRC:** `pageAck` ends a window at the first Control after its first non-ignored key. It preserves the suffix for the next acknowledgement, but never establishes that the suffix happened after that next send. A Control can therefore separate an unexpected key from the current window and let it satisfy a future send.

Independent reproduction with the unchanged acknowledgement implementation:

1. Before the first acknowledgement read, the page log already contains `Tab(seq=1), Control(seq=2), A(seq=3)`.
2. Acknowledge Tab: `ack:true`; only Tab is consumed. The extra A is excluded by the Control delimiter.
3. Commit a subsequent type-A send, but deliver **no new page event** for it.
4. Acknowledge A: `ack:true`, using seq=3, which predates this send. `final()` returns `[]`.

The same trace through the real `sendGate` produces `confirmed:2, missing:0, misdelivered:false, stopped:false`. Both foreground checks return the intended window; no actual keyboard input was generated. These measurements establish false attribution in the gate, not an observed real desktop misdelivery or a full scored R1 PASS.

**INFERENCE:** An extra key and a subsequent missing/wrong-window delivery can cancel each other in the acknowledgement accounting. T26's requirement to tolerate Control does not authorize discarding its temporal meaning or treating an earlier key as confirmation of a later send. The approved T19/T26 contract says the action's own key is required and other extra keys fail. The existing single-window extra/missing tests do not exercise this cross-window substitution.

`final()` cannot recover the error: the stale A has already advanced the cursor. It is also a one-time snapshot before cleanup, not continuous observation of later events. `{ack:null}` for NVDA-consumed sends is correctly counted as unconfirmable; that disclosure does not cover false positive confirmations of page-reaching sends.

### D39-M01 — MAJOR — A later crash during teardown does not update the persisted outcome

**Material send-boundary blocker: NO; failure-classification/error-preservation finding.**

**Locations:** `src/speech/capture.mjs:506,509,522–548,553–554`; `test/speech.test.mjs:1209`.

**MEASURED P05; CITED SRC:** After teardown has entered, every later entry only logs its reason and returns the original promise. This treats a new uncaught exception or unhandled rejection like a repeated signal. In a clean SIGINT teardown with cleanup held pending, emit an uncaught exception, then finish cleanup: the persisted result stays `status:aborted, result:PARTIAL`, with exit 130. The exception appears in the diagnostic log but not in the summary's error/result state. A crash should make this FAIL while preserving the original signal and one-exit policy.

The exported helper also permits `status:finished, result:PASS`, exit 0, when an exception arrives during a constructed pending completion cleanup. This latter case is a helper-level reproduction: the normal executable has already awaited attempt cleanup before entering its completion teardown, so it is **not** evidence of an independently reproduced production successful exit after a crash. The signal-then-crash case does not require that completion assumption.

Ignoring repeated signals as additional teardown requests is reasonable. Ignoring new failure information is not. The existing crash-first/later-rejection test already has FAIL from its first entry and therefore cannot expose this ordering defect.

### D39-S01 — SHOULD FIX — Summary-only write errors still leave returned diagnostics stale

**Material send-boundary blocker: NO.**

**Locations:** `src/speech/capture.mjs:422,431–446`.

**MEASURED P06:** With only `summary.json` returning EACCES, the returned result is correctly FAIL, `persisted:false`, and stderr contains the summary plus `writer.write_errors:["summary.json: EACCES"]`. However, the returned summary itself still has `evidence.write_errors:[]`. `sig()` explicitly excludes summary errors; a newly failed summary write does not rebuild those fields. The previous dangerous stale-PASS result is fixed, but the approved M02 instruction to re-read/rebuild on summary write-error changes is only partly implemented. The separate stderr writer status preserves the error; it is not lost entirely.

### D39-S02 — SHOULD FIX — A missing dependency-pin entry survives all tests and the lock comparison

**Material send-boundary blocker: NO; lock-schema/coverage finding.**

**Locations:** `scripts/r1.mjs:38,60–62`; `docs/ledger/PLAN.md:165` (A11).

**MEASURED MUT-X04; CITED SRC:** Delete only `lock.dependencies["node_modules/@guidepup/guidepup/package.json"]` in scratch, leaving six entries. The full suite still passes **156/156**. The runtime enumerates the entries still present and compares those same keys; it rejects an entirely empty dependency map, but does not require the expected entry set. This fails A11's explicit missing-entry refusal contract.

This is not a demonstrated way to load arbitrary executable bytes: the vendor-tree pin and file-by-file upstream comparison provide separate checks. Retaining `dependencies` is correct; validating its completeness remains unfinished.

### D39-S03 — SHOULD FIX — The promised scored-run register is absent

**Material send-boundary blocker: NO.**

**Locations:** `docs/reviews/R1-D39-patch-spec.md:90,135`; `docs/ledger/PLAN.md:168` (S13); absent `docs/ledger/RUNS.md`.

**MEASURED AUDIT; CITED SRC:** The specification lists a new append-only run register, and PLAN says scored runs go there, but `Test-Path docs/ledger/RUNS.md` returns false. The host-wording override is present. No new scored run occurred during this review, so this is an incomplete governance deliverable, not a missing record of a run performed here.

## All eight review questions

| # | Independent answer |
|---|---|
| 1. Complete interception | **CITED SRC; MEASURED BASE/AUDIT/MUT01–06:** The actual keyboard routes terminate at private `NVDAClient.#sendChord` (`:390–412`) and `runSendKeys` (`:35–50`). Both call admit then synchronous commit before writing/launching. The other socket-write site accepts only constant join/protocol handshake messages. Arbitrary VBS is disabled; sendKeys accepts one allow-listed character. Stop-speech is awaited; click chords are sequential. An independent broader source scan found no additional keyboard/mouse injection primitive. Ungated `spawn`/`spawnSync` in start/quit and `net.connect` in isRunning are lifecycle/probe operations, not overlooked keyboard-send routes. The runner's page evaluation reads the key log; it has no page.keyboard/click/focus-cycle input route. Complete routing does not establish correct acknowledgement: B01 remains. |
| 2. Commit, freshness, cancellation | **CITED SRC; MEASURED BASE/MUT01,01b,02,03b,04,X01:** VBS preparation precedes admission; neither dispatch path awaits between commit and dispatch. Commit checks token identity, committed state, current action object, epoch, stop and age; 101 ms is refused with the configured 100 ms maximum, exactly 100 ms is admitted in the clock test. An old action's token cannot commit after re-arm, even with the same label. A late pre-check cannot revive a stopped gate. Post-connect reconnect is removed. Stop kills registered cscript children best effort; a non-exiting child remains live until its exit event. Already queued socket bytes/already launched OS work remain within D-40's disclosed limitation. |
| 3. Page acknowledgement | **MEASURED P04; CITED SRC:** Unsound across Control-delimited windows: B01. Ignored keys alone do not satisfy an action and ordinary extra/missing/late/incorrect-Shift events fail the supplied tests. Those local properties do not prevent a suffix key being used by the next send. `final()` catches an unconsumed suffix, but not an incorrectly consumed one. NVDA-consumed sends correctly produce null/unconfirmable rather than confirmed. Actual NVDA delivery of Control/Insert into a page remains unmeasured; the offline tests synthesize these events. |
| 4. Teardown and browser lifetime | **CITED SRC; MEASURED BASE/P01–03/P05:** Explicit runner completion/errors use one teardown. Guidepup installs no competing signal handlers, Playwright's three signal options are false, and the former executable killAll path is gone. Core cleanup waits for quiescence, preserves a live target during the wait, and tries NVDA stop last. Repeated signals do not cause a second exit. New crashes can be swallowed into the first outcome (M01). **Important qualification:** after the approved bounded wait, deliberate exit DOES kill the browser through Playwright's exit listener while a cscript may still be live. The rev-3 B02 row and Known limits expressly disclose this; it is accepted bounded behavior, not a newly discovered blocker. Never describe it as preserving the browser after process exit or as positive termination of all input. |
| 5. Evidence and classification | **MEASURED BASE/P05/P06/MUT11; CITED SRC:** Misdelivery, missing acknowledgements, live children, interference and evidence damage take FAIL precedence over abort. Summary-only failure now returns FAIL and emits independent diagnostics. Three-write stabilization and unstable FAIL work in tests; recovered files retain the damage flag; abort typing has intent/action lines and a partial record before slow cleanup. Remaining issues are M01 and S01. Workflow diagnostics list summary_files; the after-upload contract rejects absent run summaries and zero r1-* folders after an attempted R1 step. The contract is stricter for preflight refusal but does not turn a refusal into a pass. It establishes summary presence, not full evidence validity. |
| 6. D-37 closure | See the complete six-finding matrix below, plus inherited findings. The old dispatch-preparation/reconnect defects are addressed. The new acknowledgement boundary is not sound. |
| 7. Vendor/provenance/isolation | **MEASURED AUDIT/BASE; CITED SRC:** 40 vendor files: 33 byte-identical to installed upstream, exactly the five documented changed files, plus VENDORED.md and r1Gate.js. The closure/file-set test and documented per-file hashes pass; no CR bytes. LICENSE is unchanged MIT, copyright 2023 Craig Morten; the modification headers and provenance rows preserve attribution. Package-lock integrity matches the vendoring record. Keeping upstream pins alongside vendor_tree is appropriate; S02 covers completeness. Workflow remains manual/main-only, one hosted Windows job, contents:read, no persisted checkout credential/user secrets/Meta credentials, pinned actions, and evidence outside checkout. Read-only attributes and environment identity checks are accidental-interference controls, not machine attestation. No workflow was invoked here. |
| 8. Mutations and independent negatives | **MEASURED MUT/P01–06:** Required mutations rerun, additional mutations added, and executable behavior for 7/8 independently exercised with fake process boundaries. The current repository catches 7/8 only by source assertions. Independent tests expose B01/M01 on unchanged code; X04 survives the entire repository suite. Details below. |

## Closure of every D-37 blocker and major finding

“Fixed” here is limited to source/offline behavior and the approved D-40 qualifications.

| Prior finding | Status | Evidence and qualification |
|---|---|---|
| D37-B01 — asynchronous work below hooks | **FIXED for those dispatch defects** | Vendored private boundaries; preparation before admit; same-turn commit; no post-connect reconnect; real fake-socket/process tests reach dispatch. BASE, MUT01/01b/02/03b/04. New B01 in this report concerns the required post-dispatch confirmation. |
| D37-B02 — unconditional executable browser kill | **FIXED within the revised bounded policy** | killAll removed; signal handlers disabled; core waits before close; P02/P03 exercise regressions. P01 confirms the expressly accepted post-bound process-exit kill. This is not unbounded browser preservation or positive quiescence after the bound. |
| D37-M01 — tests miss lower boundaries | **PARTLY FIXED** | Vendored tests now connect fake TLS sockets and exercise actual VBS preparation/execFile/exit. Executable regressions 7/8 still have only source-text assertions in repository tests. My external behavioral probes add independent evidence but do not change repository coverage. B01 was absent from the test set. |
| D37-M02 — stale PASS and aborted misdelivery | **PARTLY FIXED** | Both original verdict defects are corrected by BASE/T13/T7/M02 cases. Returned summary-write diagnostics still lag (S01), and new crash ordering has M01's separate classification gap. |
| D37-M03 — lost partial typing and no fallback | **FIXED for the previous reproductions, within best-effort cleanup limits** | T14 partial record before cleanup; send intents/actions; summary-only EACCES fallback; T15 recovered journal copy retaining failure. Blocking quit, external forced termination and post-bound browser death remain disclosed limitations, not guaranteed cleanup. |
| D37-M04 — hook replacement after startup | **FIXED for the specified replacement threats** | Private socket boundary, frozen dispatch prototypes/exports/key tables, canonical integer serialization, one-shot gate, integrity check every admit; T10 and mutation05. No claim of a generally immutable or adversary-proof JavaScript runtime. |

Inherited D-36 issues discussed in D-37 were also checked: original keyboard-routing and lifecycle issues are covered by the matrix above; cleanup/raw failures, individual evidence damage, evidence-path decoding, first-error-before-record ordering and LF/CRLF workflow tests remain covered and pass. The summary-persistence issue retains S01. Interference prevention remains detection plus read-only speed bumps, not exclusivity against edit-and-restore. Artifact S-04 is substantially improved by scrubbed logs, summary_files and the explicit contract; download/retention through R7 remains operational. The exact browser-server-PID/foreground-window relationship and hosted desktop/audio/VBScript behavior remain NOT MEASURED. N-02's host override is present, but its run register is missing (S03). No frozen threshold was lowered; generic Shift/Control expectations changing to upstream left-hand 160/162 is justified by the vendored canonical bytes and added assertions.

## Safe execution, measurements and mutations

### Safety established before npm test

**CITED SRC:** package.json's test command only runs `test/*.test.mjs`. Only vendor.test imports the vendor tree, and its first import initializes test/helpers/sandbox.mjs. That module replaces child_process spawn/exec/fork variants and net/tls connection functions before vendored CommonJS modules load; absent fakes throw. LOCALAPPDATA and GUIDEPUP_SCREEN_READERS_PATH point to a fresh temporary directory. Tests never call vendored NVDA.start(). NVDAClient connections use fake sockets, and cscript launches use fake children. Speech tests inject NVDA/browser/probe fakes, including every foregroundProbe spawn. Client tests inject fetch; the inspected budget concurrency test launches only a generated local Node worker. The fixture server uses loopback only.

Only after this inspection did npm test run, in an isolated copy. Tracked and nonignored untracked files were copied without .git, .env, cache or real evidence. @guidepup was copied physically; other node_modules entries were junctioned for read-only reuse. No dependency was installed. For mutations, a second preload independently blocked non-Node process creation and TLS connections, so deleting the sandbox TLS stub could not contact the real NVDA cache/service. Mutation12 consequently has a different failure count from Claude's run.

**MEASURED BASE/RESTORED/AUDIT:**

- Baseline `npm test`: **156 pass, 0 fail**, no skipped/cancelled tests.
- Final restored `npm test`: **156 pass, 0 fail**, no skipped/cancelled tests.
- Independently computed lock comparison: **11 file/spec hashes, 7 upstream pins, vendor_tree; zero mismatches**. The safe `--hashes` output was also generated in scratch.
- Vendor-tree SHA-256: `06930f07da16d9af0c1ac55320c6d0b92eb2289395d34def08e4add94f41427a`.
- Frozen normalized gates SHA-256: `ca0c9feb568e7c9c4ea41832607f510af0cbf5548242adcd77f729e039af3362`, unchanged.
- Before report creation: **89 original repository files unchanged by SHA-256**, git status --short --ignored identical, docs/evidence absent before and after. Only this review report is intentionally added in the repository.
- Independent behavioral test file: **5 tests, 3 pass, 2 fail**. Passing cases demonstrate approved post-bound exit and mutations7/8; failing safety expectations expose unchanged-code acknowledgement substitution and signal-then-crash classification. These are separate from the passing 156-test repository suite.

### Mutation outcomes

Each completed run below uses `node --test --test-reporter=tap test/*.test.mjs` in scratch and restores the changed file afterwards. “Hash tests” below means both T16 vendor-record/drift tests. The full failing test names and errors are retained in each TAP file.

| Case | Fault introduced | Pass / fail | Detection beyond hash checks |
|---|---|---|---|
| 1 | Remove NVDA commit check | 152 / 4 | Canonical-send accounting and T21 actual NVDA transport |
| 1b | Remove VBS commit check | 152 / 4 | Character-send accounting and T21 actual VBS path |
| 2 | Move admit before file preparation | 153 / 3 | T1 preparation/admission order |
| 3b | Reconnect after a successfully connected socket errors | 153 / 3 | T2 observes extra connect |
| 4 | Un-await stopSpeech | 153 / 3 | T8 stop-speech refusal/failure |
| 5 | Remove prototype freeze | 153 / 3 | T10 post-start replacement |
| 6 | Remove character allow-list | 153 / 3 | T23 refusal before work |
| 7 | Restore killAll call in executable completion | 155 / 1 | **Source-text assertion only in repository**; independent P03 executes the exact epilogue with fake run/teardown/kill functions and observes kill before teardown |
| 8 | Remove Playwright signal options | 155 / 1 | **Source-text assertion only in repository**; independent P02 executes the runner browser block and installed Playwright lifecycle with fake child processes; SIGTERM closes only the mutated browser |
| 9 | Restore vendor signal listeners | 153 / 3 | T18 listener inventory |
| 10 | Skip page ack | 148 / 8 | Gate order/missing/hung ack and runner tests |
| 11 | Skip stabilization loop | 154 / 2 | Unstable summary and recreated evidence directory |
| 12 | Remove sandbox TLS stub | 144 / 12 | Actual vendor connection tests fail safely behind independent TLS denial; external preload masks T0's own expected throw, so this is not claimed as a T0-only detection |
| X01 | Allow checks older than maxAgeMs | 153 / 3 | Gate and both actual dispatch-path T21 cases |
| X02 | Incorrectly ignore q in page acknowledgements | 154 / 2 | final() suffix and runner extra-key cases |
| X03 | Close page despite live send | 154 / 2 | T6 and signal/live-send cleanup cases |
| X04 | Remove one dependency-pin entry | **156 / 0** | **SURVIVES; finding S02** |

The first reconnect mutation attempted to reconnect on the missing/destroyed-socket branch and caused an unresolved fake handshake. The 90-second subprocess bound expired without a complete TAP result. It is recorded as **INCONCLUSIVE**, not counted as a successfully caught assertion. Case3b separately restores post-success reconnect and completes with the T2 failure above. No real socket was opened in either case. Mutations9/7 are equivalent listener/call restorations, not claims that the entire previous implementation was copied verbatim.

### Reproduction artifacts and limits

Artifacts remain outside the repository under `%TEMP%/d39-codex-bf7cae98/`: baseline.tap, final-restored.txt, hashes.json, audit-results.json, mutation-results.json, mutation-X04.json, mutation-*.tap, restored.tap, probes.mjs, probe-results.json, independent.test.mjs and independent.tap. app is the restored mutation copy; probe-app holds separate unchanged source for probes. No test file in the original repository was modified.

P01/P02 evaluate the **installed** Playwright process-launcher/lifecycle functions from coreBundle.js and the actual runner browser block, replacing process, spawn, process-tree kill, browser connection and filesystem deletion with in-memory recorders. No Chromium process is launched. P03 executes the runner's actual epilogue with injected fakes; it does not import the real R1 executable. P04 uses the unchanged pageAck and sendGate; P05 uses the unchanged teardown; P06 uses the unchanged writer/summary. These probes establish JavaScript control flow, not real Windows scheduling/delivery or full executable CI execution.

The already cached Context7 CLI was used without installation to resolve Playwright and retrieve its official signal-option documentation: [Playwright launch parameters](https://github.com/microsoft/playwright/blob/main/docs/src/api/params.md). That reference documents the signal flags; the exact installed coreBundle.js:9982–9985,10081–10089,10104–10129 establishes the additional exit handler behavior. No claim that disabling the three flags disables exit handling is supported.

No NVDA startup, real R1, real browser launch, real desktop input, foreground-probe process, GitHub Actions trigger, Meta API call, dependency installation, product-code edit, commit, push, upload or message to a third party occurred. Context7 documentation requests and the tests' loopback fixture requests were the only review network reads. STATE/LOG/CODEMAP and other governance records were left unchanged under the brief's report-only scope.

## Handoff and reduced-scope choices

**Stop this custom R1 implementation under D-39 because D39-B01 is material.** No product commit, workflow push or R1 dispatch is cleared. R1 remains unpassed; I-01 and the frozen gates retain their recorded status. A records-only commit remains the user's decision within the previously approved privacy conditions.

Choices for the user, without starting new work: pause the speech-capture scope; use separately obtained, human-controlled speech recordings/transcripts for explicitly assisted analysis with provenance and new acceptance criteria; or limit the demo to fixture/static checks and human review, dropping automatic real-NVDA and speech-based causal/repair claims. None inherits R1/R2/R3 PASS, and none is authorization for another custom send-boundary patch cycle.

**Final verdict: BLOCK. Material send-boundary blocker: YES — D39-B01.**
