# Final focused D-42 safety re-review

**Verdict: BLOCK. A material safety blocker remains: D42-B01. Recommend stopping the custom R1 harness under D-42. Do not initiate another implementation cycle.**

Codex independently reviewed the current uncommitted implementation at HEAD `6cf05987e9fec71bdb65088c6f5e16aabe21012a`, the complete D-42 brief/patch, D-39 report, D-42 decision and F-02 amendments. Review timestamp: **2026-10-27T16:23:05Z**, obtained with `date -u`. The previous D-39 BLOCK report is unchanged. Evidence below is source inspection and safe offline simulation, not a real Windows/NVDA delivery result. Run prefix: **D42-CODEX**.

## Findings

### D42-B01 — BLOCKER — The new parallel log read can make a stale foreground verdict look fresh

**Material safety/send-boundary blocker: YES. This finding independently triggers D-42's stop condition.**

**Files:** `src/speech/sendguard.mjs:189–204,220–221`; `src/speech/capture.mjs:225–237,279–283`; `docs/ledger/PLAN.md:161` (A8).

**CITED SRC:** Admission now waits for both the foreground verdict and `ack.before` through `Promise.all`. It sets `token.at = now()` only after both finish. If the foreground check finishes first and the browser log read is slow, the token receives a new timestamp after that additional wait. Commit's 100 ms check therefore measures time since the combined admission finished, not time since the foreground verdict was obtained. The comment that both checks are fresh when token.at is set is incorrect for this ordering.

**MEASURED FRESHNESS:** Independent probe used the unchanged real `sendGate`, real `pageAck.before`, and actual vendored `NVDAClient.sendKeyCode/#sendChord`, with TLS/socket operations replaced by recorders:

1. The foreground pre-check passes for the intended window.
2. The page-log read remains pending. It is held for 250 ms, within its normal bound; the simulated foreground changes before that read completes.
3. The read returns an empty log. Admission stamps the token at this later time, commit accepts it, and the actual vendored method writes Control-down and Control-up to the fake socket.
4. Measured time from the completed foreground check to the first key write: **257.2983 ms**, with `maxAgeMs:100`. The post-check then detects the changed foreground. Status is `sends:1, refused:0, misdelivered:true`.

No real key, socket or NVDA process was used. The probe establishes dispatch after a stale verdict, not a measured real wrong-window event. The post-check correctly fails afterwards; it does not satisfy the requirement to refuse a stale send before dispatch.

**INFERENCE:** A slow `page.evaluate` log reply can create this ordering in the ordinary runner without changing product code or losing a hook. The outer action check is earlier still and does not close the gap. This is an added asynchronous wait inside the harness before hand-off, not merely the accepted race after the last check when Windows/NVDA delivers input. A8 still requires refusal when the check is older than 100 ms. The new tests stall after admit returns; they do not cover one admission branch aging while the other remains pending.

### D42-M01 — MAJOR — A missing optional `before` hook still allows a false PASS under a missing-hook fault

**Conditional false-PASS finding. Normal runner wiring is present; this is not a claim that the hook disappears spontaneously.**

**Files:** `src/speech/sendguard.mjs:184–195`; `src/speech/capture.mjs:281–283`.

**CITED SRC; MEASURED OPTIONAL / OPTIONAL-RUNNER:** An acknowledgement function without a callable `.before` is accepted: the gate substitutes `[]` rather than refusing the missing pre-send check. With an A already in the log before a type-A action and no new A delivery, the gate commits and confirms that old A. This is outside the accepted identical-key-after-the-pre-read residual: here there was **no pre-read**.

An independent fault simulation through actual `runR1` and the standard fake adapters demonstrated the consequence. At the existing setAck interface, the supplied reader was wrapped in a plain forwarding function, preserving its acknowledgement behavior but dropping its `.before` member. After a successful Tab, a stray A was inserted between sends; the subsequent A delivery was dropped. Results:

| Reader configuration | Result | Page confirmations | Summary persisted |
|---|---|---|---|
| Normal runner reader with before | FAIL before the next send | 1 | true |
| Same reader forwarding calls but missing before | **PASS** | 81, missing 0 | true |

These are fake-run software-contract results, not measured desktop outcomes. The production runner unconditionally assigns reader.before, and mutation14b has behavioral regression coverage. There is no demonstrated ordinary execution branch that omits it. Nevertheless, the gate itself is fail-open for this required safety capability, so a missing-hook fault can restore false confirmation without stopping the run. Plain-ack unit tests explain the implementation choice; they do not establish safe missing-hook behavior. D42-B01 blocks approval even without assuming this fault.

### D42-S01 — SHOULD FIX — The supplied final patch omits four added tests

**Review/provenance finding; not a material safety blocker by itself.**

**Files:** `docs/reviews/R1-D42-diff.patch:260–276`; `test/sendguard.test.mjs:312,320,339,362`.

**MEASURED AUDIT:** Independently reversing the patch against current files reproduces all four source files at their superseded locked hashes and at the saved independent D-39 copy's hashes. The reconstructed speech test also matches that D-39 copy. But the reconstructed old sendguard test still contains all four new D-42 tests: the patch records its changed final() test but omits the appended P04, gate, pre-send and residual tests. Thus the patch is not the complete six-file D-42 diff claimed in the brief. I inspected the actual current tests, so this omission did not exclude them from this review.

## Independent assessment of the five fixes

| D-39 finding | Focused result | Evidence / limitations |
|---|---|---|
| B01 — false acknowledgement | **Original reproductions fixed with normal wiring; overall safety repair not cleared** | Original P04 `[Tab, Control, A]` now fails the Tab acknowledgement rather than preserving A for a later send. An unexplained key already present at the successful pre-read refuses the next send. BASE, P04, runner regression tests, mutations13/14/14b/14c. The new parallel admission creates D42-B01; missing-hook behavior has D42-M01. |
| M01 — crash during teardown | **FIXED for the reviewed crash-entry paths** | Independently exercised both uncaughtException and unhandledRejection during signal teardown and constructed completion teardown. All four permutations synchronously persist FAIL before cleanup ends; original lifecycle status is retained; one exit occurs, 130 for signal and 1 for completion with a crash. Mutation15 and corrected15b detect both recording and immediate rewriting. |
| S01 — stale summary write errors | **FIXED** | Permanent and transient summary-only EACCES now produce returned FAIL with the summary.json error in evidence.write_errors and stderr. A later successful persistence retains the earlier error and FAIL. P06/S01 and mutation16. Existing three-round unstable-summary and evidence-recovery tests still pass. |
| S02 — incomplete pins | **FIXED** | UPSTREAM_PINS independently enumerates seven paths; depHashes hashes that list; runtime uses pinErrors. Each individual missing pin, empty/undefined map, extra pin, invalid hash and mismatch is rejected. Original X04's package.json deletion is rejected by the exact extracted runtime comparison, without executing R1. Mutations17/17b/17c cover regression; 17 remains source-text-only in repository tests. |
| S03 — run register | **FIXED** | RUNS.md exists with run id, workflow run id, commit, approving decision and result columns; append-only/correction rules and CODEMAP entry are present. It is correctly empty because no new scored workflow run has occurred. I-01 remains separately recorded and open. |

The original P05 crash and X04 missing-pin cases are closed. S01's original D-39 P06 case is also closed. This does not override the new safety blocker.

## Acknowledgement attribution, optional path and accepted residuals

**CITED SRC; MEASURED BASE/P04/OPTIONAL:** Removing Control-delimited windows closes the specific old suffix-substitution bug. With a wired before hook, a non-modifier key visible in the pre-send read cannot be carried forward as the next action's confirmation. A same-window extra non-modifier key fails the current acknowledgement; modifiers alone cannot satisfy it. NVDA-consumed sends remain null/unconfirmable, not confirmed.

The identical-key residual is accurate and explicitly approved by D-42: after the pre-send log snapshot, a stray event indistinguishable from the expected key can substitute for a lost actual key. The log cannot establish causal origin. A pre-read that finishes early can age while the foreground check is pending; this widens that disclosed window. None of that makes the missing-before case equivalent to a successful pre-read, and it does not authorize a stale foreground verdict when the opposite branch finishes first.

Final() remains a snapshot of unexplained suffix events, not continuous observation through cleanup. Previously accepted limitations also remain: already launched operations cannot necessarily be recalled; bounded cleanup and external cancellation are best effort; deliberate post-bound process exit invokes Playwright's browser-kill handler. Those accepted limits are not newly classified as blockers here. Real hosted desktop behavior, control-key delivery, cancellation and browser-PID/foreground mapping remain unmeasured.

## The two modified existing tests

**CITED SRC; MEASURED RED/BASE:** Both changes are legitimate strengthening, not threshold reduction.

- `test/sendguard.test.mjs:300`: moving q to after a successful Tab acknowledgement preserves the final() suffix check. The old `[Tab, Control, q]` input now fails the acknowledgement itself; added P04 tests require that earlier rejection. The old unsafe acceptance expectation was removed, with its stronger replacement present in actual source.
- `test/speech.test.mjs:1019–1030`: expecting only stopSpeech and NVDA-T in the leaky case requires refusal before the next stopSpeech/Tab. FAIL, ack classification and misdelivered remain asserted. It strengthens how early input stops.

The fake adapter's list-valued extra and after hook enable the new scenarios; they do not lower speech/fixture acceptance. Existing ten steps, 3/3 and frozen gates remain unchanged.

As a negative control, running the **current** two test files against the four independently reconstructed pre-D-42 sources gives **124 tests, 114 pass, 10 fail**: the nine new regression expectations fail, plus the strengthened existing T26 leaky case. The disclosed residual test passes. This supports the regression tests' relevance. It is not a historical reconstruction of the exact order in which Claude edited the two existing assertions; the brief's earlier 115/9 result used a different test-edit point.

## Safe execution and independent checks

### Isolation established before npm test

Package.json runs only test/*.test.mjs. The vendor test imports the T0 sandbox first; that module blocks child_process spawn/exec/fork variants and net/tls connections before vendored CommonJS loads, and redirects both NVDA cache environment paths to an empty temporary folder. Vendor tests use fake sockets/children and never call vendored NVDA.start(). Speech tests inject fake NVDA/browser/probe implementations; every foregroundProbe test supplies its fake spawn. Client tests inject fetch. The inspected budget concurrency test launches only its generated local Node worker. Fixture HTTP traffic is loopback only.

After inspection, code and tests were copied to `%TEMP%/d42-codex-808252e1/`, excluding .git, .env, cache and real evidence. @guidepup was copied physically; other installed packages were reused through directory junctions without installation. Mutation runs had an independent preload denying non-Node process creation and TLS calls, including when the sandbox TLS stub was removed. The actual-transport probe imported the sandbox before vendored modules and recorded fake writes only.

**MEASURED BASE / RESTORED / AUDIT:**

- Initial npm test: **166 pass, 0 fail**, no cancelled/skipped tests.
- Final restored full suite: **166 pass, 0 fail**, no cancelled/skipped tests.
- Independent diagnostic expectations: **6 tests, 4 pass, 2 fail**. The two failures expose stale-foreground dispatch and false PASS under the missing-before fault. These are additional checks, not failures in the existing 166-test suite.
- Safe `node scripts/r1.mjs --hashes` generated; independent hashing/comparison found **zero mismatches** across 11 file/spec hashes, seven upstream pins and vendor_tree.
- Vendor tree unchanged: 40 files; SHA-256 `06930f07da16d9af0c1ac55320c6d0b92eb2289395d34def08e4add94f41427a`.
- Frozen normalized PLAN gates SHA-256 unchanged: `ca0c9feb568e7c9c4ea41832607f510af0cbf5548242adcd77f729e039af3362`.
- All four reconstructed source hashes match lock.supersedes and the independent D-39 copy. Patch omission is separately identified above.
- Before report creation: **93 original files unchanged by SHA-256**; docs/evidence absent before and after. The previous D-39 review is unchanged. Only this report is intentionally added to the original repository; no product/test/governance file was edited there.

### All 23 reported mutation cases

Each mutation was independently applied only in scratch and restored afterwards. Commands use node --test --test-reporter=tap test/*.test.mjs, with the timeout qualification below. Counts are independent results, not copied from Claude. Full failed-test names and errors are retained in TAP artifacts.

| Case | Mutation | Pass / fail | Detection |
|---|---|---|---|
| 1 | Drop NVDA commit check | 162 / 4 | Actual transport freshness/send accounting plus T16 hashes |
| 1b | Drop VBS commit check | 162 / 4 | Actual VBS freshness/send accounting plus T16 |
| 2 | Admit before file preparation | 163 / 3 | T1 order plus T16 |
| 3 | Restore post-success reconnect | 163 / 3 | T2 extra connection plus T16 |
| 4 | Un-await stopSpeech | 163 / 3 | T8 plus T16 |
| 5 | Remove prototype freeze | 163 / 3 | T10 plus T16 |
| 6 | Remove allow-list | 163 / 3 | T23 plus T16 |
| 7 | Restore executable killAll call | 165 / 1 | Source-text-only repository assertion; external behavioral epilogue probe independently observes kill before teardown |
| 8 | Remove Playwright signal options | 165 / 1 | Source-text-only repository assertion; external exact browser/lifecycle probe observes SIGTERM closing only the mutated browser |
| 9 | Restore vendor signal listeners | 163 / 3 | T18 plus T16 |
| 10 | Skip page ack | **144 / 16, 6 cancelled** | Completed with 3,000 ms test timeout; see qualification |
| 11 | Skip stable-summary loop | 164 / 2 | Summary instability and recreated evidence |
| 12 | Remove sandbox TLS stub | 154 / 12 | Vendor paths fail behind independent TLS denial; external guard masks T0's own throw expectation |
| 13 | Restore Control-delimited window | 163 / 3 | P04 unit, gate and runner cases |
| 14 | Gate skips before | 163 / 3 | Pre-send unit, T26 leakage, between-send stray |
| 14b | Runner omits reader.before | 164 / 2 | T26 leakage and between-send stray |
| 14c | before ignores strays | 163 / 3 | Pre-send unit and two runner cases |
| 15 | Ignore later crash | 164 / 2 | Signal-then-crash and completion-then-crash |
| 15b | Record crash but omit immediate rewrite | 165 / 1 | Mid-cleanup persisted P05 result |
| 16 | Remove summary-error rebuild | 165 / 1 | Returned EACCES diagnostics |
| 17 | Runtime pin check reverts to lockMismatches | 165 / 1 | Source-text-only repository assertion; independent execution of exact comparison expressions confirms incomplete-map acceptance only in the mutation |
| 17b | Accept missing pin | 165 / 1 | X04 schema negative |
| 17c | Accept extra pin | 165 / 1 | X04 schema negative |

**Timeout qualification:** With the reported `--test-timeout=15000`, my mutation10 run produced failing assertions but exceeded a 90-second process bound before final totals. This incomplete run is not counted as a completed 166-test result. Independently, an unchanged baseline with `--test-timeout=3000` passed 166/166; the same bound on mutation10 completed with 144 pass, 16 fail and six cancelled. Thus skipped ack is detected, but bounded execution is necessary. npm test itself still supplies no timeout flag; the original timeout-dependent caveat remains real.

**Probe correction:** My first15b mutation inserted a line comment that swallowed a closing brace and failed parsing; that invalid mutant is excluded from the meaningful result. The corrected omission uses a valid no-op and gives the 165/1 P05 result above. Mutations7/9 restore equivalent call/listener faults rather than copying every byte of the old implementation.

All 23 intended fault classes therefore have independent detection evidence, with the stated timeout/source-text limits. Mutation success does not establish untested safety invariants: D42-B01 was found on unchanged code.

## Artifacts and execution boundaries

Scratch artifacts: `%TEMP%/d42-codex-808252e1/` contains baseline.txt, hashes.json, audit-results.json, reconstructed pre42 sources, pre42-current-tests.tap, mutation-results.json, mutation-*.tap, mutation-10-bounded.tap, timeout-baseline.tap, mutation-15b-corrected.tap, restored.tap, probe-results.json, independent.tap and lifecycle-results.json. app is the restored mutation copy; probe-app is the separately restored probe copy. The harness scripts remain there for reproduction.

P04 uses the unchanged pageAck. P05, S01 and X04 use unchanged current functions; the runtime pin-check expression is evaluated without importing/executing R1. FRESHNESS exercises the actual vendored client and real gate over fake TLS. OPTIONAL-RUNNER uses actual runR1 with injected fake adapters and the explicitly described missing-member fault. Lifecycle probes evaluate the actual runner browser block/epilogue and installed Playwright lifecycle using in-memory process/spawn/kill recorders. No real browser or input process is started.

No R1 execution, NVDA startup, desktop keystroke, foreground-probe process, GitHub Actions trigger, Meta API call, external upload/message, dependency installation, product-code change, commit or push occurred. Tests made only loopback fixture requests. Report-only scope was preserved; prior verdicts, incident history, ledgers and frozen gates were not rewritten.

## Final disposition

**BLOCK. Stop the custom R1 harness under D-42 because D42-B01 is a material safety blocker.** The five targeted repairs substantially address their original reproductions, but the new admission wait permits stale-foreground dispatch. The optional-hook fault also needs to remain visible as a conditional false-PASS limitation.

No further patch cycle is initiated or recommended. Reduced-scope choices for the user are to pause automated speech capture; analyze separately obtained human-controlled recordings/transcripts with provenance and new acceptance criteria; or limit the demo to fixture/static checks and assisted review, removing automatic real-NVDA and speech-based causal/repair claims. None inherits an R1/R2/R3 PASS. Any such change requires the user's scope decision; this report authorizes no run, commit or push.
