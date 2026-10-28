# D-51 correction handoff — B1/B2 and S1–S3

**Current publication verdict: NO-GO.** The previous Claude cross-tool verdict is BLOCK. Local corrections and new checks are ready for final read-only review and another Claude cross-tool review; this is not publication approval. The original checkpoint report is retained below as historical evidence, not current-source qualification.

Evidence: MEASURED names machine runs under %TEMP%/tabwise-d51-correction; CITED names the user's continuation request (request.txt). Model review remains MODEL/L1; hash checks are narrow deterministic L3 checks. No real commit/push, workflow dispatch, NVDA, desktop input, Meta call or charge occurred. All mutation/hook commits and pushes were isolated scratch operations.

## A. B1 and B2 resolution

**B1, MEASURED before-reproduction-results:** the old complete publication script, with a real pre-commit hook staging hook-extra.txt, returned success and published 18 paths to a local scratch remote. The corrected script captures the exact staged Git tree before commit. After normal hooks/commit, it reads the stored commit headers with Git replacement objects disabled, requires exactly one parent equal to D-50 base, requires the approved tree, exactly17 changed paths, all17 sealed blobs/modes and raw reviewed bytes, a matching index, no tracked working-tree residue, unchanged message and unchanged origin/main/absent review branch. It rejects hidden assume-unchanged or skip-worktree flags without altering them. A raw snapshot of all tracked files catches hook changes masked from normal diff. The push uses the verified immutable commit ID, not HEAD, with --no-follow-tags. Afterwards it reads back both review SHA and main. Any push error/mismatch is reported with observed refs and **no automatic retry**.

**B2, MEASURED before-reproduction-results:** Windows PowerShell 5.1.26100.9711 failed on ordinary Git stderr during add and push; in the push case the remote had already accepted the commit. PowerShell 7.6.5 succeeded in the same controls. The replacement uses System.Diagnostics.Process with concurrent stdout/stderr reads, explicit native exit status, Windows argv quoting and disposal. Stderr is displayed separately from parsed stdout. No Git-wrapper temporary files are needed; the commit-message temporary file has finally cleanup. SHA256 uses .NET streaming, avoiding module-autoload assumptions in PowerShell5.1. Native probes passed both shells for spaced/quoted/Unicode/trailing-backslash arguments, stdout separation, warnings and exit23/error preservation. [Microsoft's native-command behavior notes](https://github.com/microsoftdocs/powershell-docs/blob/main/reference/docs-conceptual/whats-new/differences-from-windows-powershell.md) support the reproduced shell difference.

## B. S1–S3

- **S1 DONE:** all17 approved files are identified by an external reviewed-state manifest with raw SHA256, canonical Git blob ID and mode. Its own SHA256 is supplied separately in the execution command, outside the sealed files. The script hashes the exact seal bytes it parses, requires it outside the worktree, and compares reviewed bytes before staging and again after commit. Final documentation/ledger updates precede seal generation. The seal does not include itself, and no required final self-hash is embedded in one of the17. Any later edit requires a new seal and corresponding review.
- **S2 DONE:** original JSON/raw logs remain preserved, including the old erroneous reasonMatched value. correction.historicalMutationAttribution independently parses failure diagnostics, excludes titles, and classifies the old late-start-no-stop as cancellation with reasonMatched=false/originalReasonMatched=true. The historical counts remain ten assertion catches and two cancellations. Both formerly timeout-only cases now use precise bounded assertions; held cleanup is released/joined in finally. Final13/13 mutations fail through ERR_ASSERTION with their intended diagnostic messages, **zero cancellations**. The extra mutation skips post-quit polling.
- **S3 DONE:** new test records initial listener presence, one successful hidden --quit process, two still-present post-quit polls and eventual absence. It asserts four probes, exact event order, one launch, zero kills and successful reset. The skip-polling mutant fails its explicit4-probe assertion. No vendored code was changed.

## C. Final changed-file inventory

Exactly17 approved paths, all uncommitted in the C: safety worktree:

1. test/broker.test.mjs
2. test/engineering.test.mjs
3. test/sendguard.test.mjs
4. test/speech.test.mjs
5. test/vendor.test.mjs
6. test/helpers/faults.mjs
7. test/helpers/sandbox.mjs
8. test/helpers/reliability.mjs
9. docs/CODEMAP.md
10. docs/ledger/DECISIONS.md
11. docs/ledger/LOG.jsonl
12. docs/ledger/PLAN.md
13. docs/ledger/STATE.md
14. docs/reviews/D51-report.md
15. docs/reviews/D51-results.json
16. docs/reviews/D51-review.md
17. docs/reviews/D51-publish.ps1

The continuation changes only engineering/speech tests, publication logic and review/ledger records within that set; prior D-51 changes are preserved. The D: checkout and four unrelated C: untracked files are preserved and excluded from staging. The external seal, raw logs and test fixtures are not an eighteenth approved repository path.

## D–E. Integrity, tests and mutations

**MEASURED qualification-final:** 20/20 new final-source suites passed **206/206** (the original205 plus the new polling test), 4,120 executions. Ten read-only LF and ten read-only CRLF runs cover default, serial, fixed/varied random order, concurrency2/8, fs delays30/100ms, event-loop stalls40/120ms and mixed faults. Every suite has zero failures/cancellations/skips/late-activity warnings and unchanged source. The original100x205 is retained only as historical evidence. Source manifest71 matches current runtime/test bytes after LF normalization; frozen vendor bytes remain exact.

**MEASURED mutation-results:** final13/13 valid mutations are assertion catches with matched diagnostics and zero outer test cancellations. Original raw mutation logs and results were not overwritten. Targeted affected tests pass; the complete suite includes all original205 tests. Current worktree full-suite output is worktree-final-206.tap; publication checks additionally ran30 full206-test suites, recorded separately from the20-run qualification matrix.

**MEASURED integrity-current:** preflight passes source/spec locks, ten upstream pins, vendor tree, dependency tree, Node version and frozen Day-1 gates. Frozen source, workflows, fixtures, package files, lock and acceptance rules have no diff. R1 remains not PASS. Original machine-record fields are retained unchanged; all correction results are additive under correction. Before-edit copies and hashes of the17 files are retained in the correction evidence.

## F. PowerShell5.1 and7 publication validation

**MEASURED publication-final: 56/56 scenarios passed**, 28 per shell. The original eight safe stops were rerun. Real hook cases cover an extra eighteenth file, modified approved content, an unauthorized path substituted while keeping17 changed paths, wrong/root/merge parents, staged/tracked residue, hidden tracked changes, modified message and retargeted push URL. New seal/document tampering and pre-existing hidden-index cases stop safely. All48 pre-push failures made **zero push attempts** and preserved remote refs. Four post-push mismatch scenarios and two ambiguous push results each made exactly **one** attempt, reported observed refs and did not retry. Both successful cases published exactly17 approved paths with the expected SHA/main and kept a reachable annotated tag local despite push.followTags=true.

Failure attribution comes from a dedicated driver's actual Exception.Message, not strings printed in the staged diff. All56 raw log digests were checked independently against files; no digest correction was required. Development checks that exposed proxy forwarding and PS5.1 Get-FileHash module availability remain in separate folders and are excluded from final56 results. No real index.lock was deleted.

## G–I. Review, limitations and next gate

Fresh separate-context review found the pre-existing hidden-index edge; its correction is included in final56. The reviewer independently checked source hashes, qualification logs, mutation diagnostics and publication invariants and reported no open code/evidence blocker. The fresh final verdict in D51-review.md is **APPROVE corrected code/local evidence, no open blockers; GO for another Claude review only**. No cross-tool approval is inferred from a same-model review. **Another Claude review is required.** The installed Claude CLI currently reports loggedIn=false/authMethod=none; no login, paid request or protocol bypass was attempted.

Local tests do not establish hosted Windows reliability. The script verifies and constrains **its own** publication of the reviewed commit; arbitrary hook programs retain the ability to issue independent commands/network writes, and other remote writers can change refs after a read. Tests cover refusal/reconciliation of the injected cases, not a sandbox for hostile arbitrary code. Missing historical hosted error/action details remain unavailable and are not invented.

Local implementation/checks are ready for another cross-tool review; publication remains NO-GO until a new independent verdict and user authorization. Two independent successful hosted preflights still precede user-approved fast-forward integration. R1 requires separate authorization. No governance rule was changed.

## J. Corrected script and execution

Script: C:\Users\ANIRUDDH\.codex\worktrees\tabwise-r1-safety\app\docs\reviews\D51-publish.ps1

The exact executable command, including the external seal path and its independently supplied SHA256, is in D:/Projects/Meta AI/D51-review-package/PUBLISH-COMMAND.ps1 outside the17 files and in the chat handoff. It must be run only after cross-tool approval. Commit subject remains test(r1): eliminate residual CI timing races (D-51); the literal script body adds hook/tree verification and corrected206-test qualification. No attribution or co-author trailer is added; altered commit messages are refused.

---

# Original D-51 checkpoint record — historical, superseded where corrected above

# D-51 reliability checkpoint

Status: local qualification complete; publication **NO-GO pending cross-tool review**. No real commit, push, R1 dispatch, NVDA, desktop input or Meta call was performed. Commits/pushes used solely to test the publication script went to a scratch local Git remote.

Evidence convention: **MEASURED** means the named local run/log or downloaded machine evidence; **CITED** means the linked retained source; **INFERENCE** is explicitly conditional. The separate model review is **MODEL / L1**, not observed assistive-technology evidence. R1 remains not PASS.

## A. Facts and root-cause limits

**MEASURED — hosted-40654790143:** independently retrieved the complete preflight job log (job 122703097786) and artifact 12801216922. ZIP SHA-256 is `f35c2e65e304666603d14f421146bf8475231cf3ac38de348267f7eeef4109c8`, matching GitHub's digest. Base and remote main were `6eceb0e64075ba522866f344719a643f3744ca59`. The standard suite and six stress profiles passed 205/205; repeat-2 and random-790143 each passed 204/205. Before/after locks and checkout checks passed. This was the offline preflight, with no real NVDA or R1 execution. Host: Windows Server 2025, image win25-vs2026 20261021.278.1, four CPUs, Node 24.22.1, CRLF checkout except byte-preserved vendor files. [Run and retained logs](https://github.com/ANIRUDDH-001/Tabwise/actions/runs/40654790143).

**A — historical observation:** random-790143's owned-process test failed `0 !== 1`, duration 25.3115 ms. Its preceding `assert.rejects` discarded the actual error. Neither the complete job log nor artifact contains that error or a process timeline. The precise historical rejection is **INSUFFICIENT EVIDENCE**, not an established timeout diagnosis.

**MEASURED — before-quit-30:** a controlled first listener completion delayed 30 ms against the original 5 ms probe produces `Error("NVDA cannot be quit")`, cause `Error("NVDA listener probe timed out")`, zero launches. In the recorded trace: probe request at 0.924 ms, rejection at 19.601 ms, positive ECONNREFUSED delivery at 30.855 ms. The timer ran late under scheduling contention but still beat the reply. A no-delay control reached the quit process and then the intended still-live-owner reset error. The unchanged original test also reproduces `0 !== 1` with a 120 ms fake-completion delay.

Classification: **confirmed test-harness and assertion defect**—a listener timeout can satisfy the any-rejection check before the expected launch. The local probe timeout is legitimate fail-closed production behavior under that injection. Its identity with the historical rejection is an **INFERENCE**, not measured fact. No shared-state or production defect was established.

**B — historical observation:** repeat-2's successful-run test reported only `send guard stopped the run: timeout`, duration 1781.0056 ms. It did not print `send_guard.reason`, attempt or step. The exact historical action/deadline cannot be recovered from the retained evidence. It remains **INSUFFICIENT EVIDENCE** whether the action deadline, idle bound or teardown bound produced that historical stop; a precise action name must not be invented.

**MEASURED — reproduction-results:** blocking a selected physical-send callback for 240 ms under the old 200 ms action budget deterministically identifies `NVDA-T: action timed out after 200 ms`, `Tab: action timed out after 200 ms`, or `type d: action timed out after 200 ms`, at attempts/steps 1/0, 1/1 and 1/2 respectively. Each stops before a second attempt. The successful setup is invalidated by its artificial budget; fail-closed production is behaving as configured. With final positive test settings, all three same-injection cases PASS with 168 sends, 81 confirmed page keys and three completed attempts. These are local reproductions, not a reconstruction of the missing hosted action.

## B–C. Complete audit and corrections

**MEASURED / MODEL L1:** inspected all 205 tests and infrastructure: speech 115, vendor 26, sendguard 26, engineering 19, broker 8, client 8, browser 3. Findings below refer to baseline 6eceb0e and the final diff; no production BLOCKER was established.

| Severity | Confirmed weakness | Correction and retained assertion |
|---|---|---|
| Major | Owned-process reset accepts any rejection and assumes launch | Require exact Error class, wrapper and cause; assert one launch; an absent port plus exited owner succeeds without a second launch. Probe/process budget is generous; zero reset polling budget tests immediate rejection of an explicitly live owner. |
| Major | Positive simulated actions and fake socket/child completions can exceed unrelated tiny budgets | Give positive fixtures scheduling room. Explicit timeout-negative cases choose their own short bound. Final successful runner still checks every pre/send/post event, all sends, page confirmations, records, evidence and persistence. |
| Major | B02 cleanup uses timestamps/sleeps to infer ordering | Hold stop explicitly, observe entry, send later signals while held, assert no exit, release, then assert ordered completion and one exit. |
| Major | Teardown deadline uses a real elapsed upper bound under event-loop stalls | Hold cleanup with a live token, observe deadline exit while cleanup is unfinished, release/join it and forbid a second exit. Integrated browser-retention tests remain. |
| Major | Late start/open tests race 60/400/500 ms fake delays against cleanup | Hold operations until actual cleanup entry or return, then release and explicitly await stop/kill. |
| Should fix | Generic foreground/concurrent-send and malformed-owner assertions hide other failures | Assert distinct reason/class where available and relevant zero-send/launch/ack side effects. |
| Should fix | Late dispatch swallowed its rejection; delayed page events were unjoined | Attach handling before scheduling; assert the late protocol refusal; join delayed page events before evidence cleanup. |
| Should fix | Budget workers disguise every error as cap refusal and ignore exit/stderr | Only BudgetError with the cap reason counts as refusal; require clean exits, recognized output, exactly two reservations and three refusals. No real broker/client calls use the project's ledger. |
| Minor | Crash resolver assumes entry after a 5 ms sleep | Wait for actual finish entry. |
| Minor | Sandbox temporary installations accumulate | Remove only the recorded sandbox/fake-install roots it created, after the suite. |

Freshness tests use controllable monotonic time; the late acknowledgement test advances its clock explicitly and checks the precise deadline reason. The live-send lower-bound check uses monotonic time from actual signal emission and asserts the signal occurred. Existing negative waits that exercise a real timeout/retry remain bounded; a wait is not used as evidence that an unrelated positive action reached its setup point. The added completion-delay fault is opt-in and does nothing when unset. Both workflows remain intact.

## D. Before/after reproduction

**MEASURED:** original owned-process test with 120 ms fake completions: 0/1 PASS, `0 !== 1`; final test, same completion fault: 1/1 PASS with exact intended reset cause. Original canonical transport with the same 120 ms fault: 0/1 PASS, `R1_SEND_FAILED: write callback timed out`; final canonical test: 1/1 PASS. For each selected runner action (NVDA-T, Tab, d), a 240 ms stall with old budget fails by the named 200 ms action deadline; final positive budget passes. Explicit action-timeout and late-ack negative tests continue rejecting the intended condition.

## E. Final-code stress

**MEASURED — physical-matrix:** 100/100 complete final-code suites passed 205/205 each: **20,500 test executions, zero failed/cancelled/skipped tests, zero late-activity warnings, zero source-content changes**. Fifty executions used read-only LF snapshots and fifty read-only CRLF snapshots; vendor bytes were preserved. Each snapshot protected 116 files, with 1,527 dependency files read-only. Every command, seed, exit status and log digest is in D51-results.json. The normalized manifest covers 71 runtime/test/workflow/dependency files and was checked against the final worktree; no old development snapshot is included.

Ten executions each: default; serial; randomized seed 790143; varied random seeds with concurrency 2; filesystem delay 30 ms; filesystem delay 100 ms; event-loop stalls 40 ms every 50 ms; mixed fs 30/stall 60 every 80 ms; stalls 120 every 160 ms; varied random seeds with concurrency 8. The harness also varied explicit file order and ran four suites concurrently. A separate final worktree run and the final scratch-publication run each passed 205/205; neither inflates the 100-run matrix.

The supported qualification setup uses physical dependency copies. An initial scratch harness mistakenly used a node_modules junction: four complete executions of the final test code each failed T11's canonical upstream-module path expectation (204/205). Those are disclosed setup failures, not counted as supported physical-install qualification, and not represented as successful executions. Physical copies corrected the harness without changing tests. Other development runs before the final source digest are excluded.

## F. Mutation and assertion quality

**MEASURED — mutation-results:** 12/12 valid scratch mutations detected. Ten fail through the intended assertions: ignore owned process before/after quit; substitute unrelated reset cause; change wrapper to TypeError; remove pre- or post-foreground checking; return a no-op PASS without execution; lose acknowledgement count; run only two attempts; detach cleanup. Exact reason checks matched all ten. In particular, the no-op PASS fails the physical-send count, and the unrelated reset error fails the new exact-cause assertion.

Two additional missing-behavior mutations (remove teardown deadline; omit late-start stop) are detected only by the outer test timeout/pending-event cancellation. They are explicitly not counted as assertion-level catches. Mutation files were restored in the scratch copy; frozen worktree code was never mutated. Expected red reproductions and mutants are not stability successes.

## G. Review

**MODEL / L1 — D51-review.md:** a separate read-only agent inspected the baseline and final changes; APPROVE conditional on final verification, no blocking findings. It independently measured 5/5 affected/lifecycle tests and 1/1 delayed canonical transport test. This is the same model/vendor in a fresh context, not cross-tool review. PROTOCOLS §4's cross-tool gate remains open: the installed Claude CLI reports loggedIn=false/authMethod=none. No login or model request was attempted. The report does not substitute L1 for that gate.

Final follow-up: APPROVE all changed test/helper code and publication-script logic, no open code blockers. The reviewer independently checked all 71 source digests and all 100 raw stress-log digests (narrow deterministic L3 checks; the model verdict remains L1). It found a publication-script risk from configured automatic tag pushes; explicit `--no-follow-tags` and a scratch annotated-tag check resolve it.

## H. Integrity

**MEASURED — final-integrity:** `node scripts/preflight.mjs` passes the 12 source/spec hashes, ten upstream dependency pins, vendor tree, Node version, dependency tree and frozen Day-1 gates `ca0c9feb568e7c9c4ea41832607f510af0cbf5548242adcd77f729e039af3362`. Vendor tree: `d80eb577e272dd7c16135ebfeaa9e3dc9162308b0ea1323a9b158dcafb774e1d`.

`git diff --check` passes. Frozen-path diff is empty for src, vendor, fixtures, both workflows, r1/preflight scripts, package files and agent/governance configuration. A14, native PID/title checks, 3/3 and thresholds are unchanged. Only the D-51 task section was appended outside frozen PLAN markers. R1's FEATURES entry remains false. D: checkout work and the four unrelated C: untracked files were preserved.

## I–J. Risks and publication verdict

**NO-GO for publication until cross-tool review is supplied.** Local tests, mutations, integrity and publication-script checks are complete; the separate-agent approval alone does not satisfy the project's stricter cross-tool gate. Missing historical diagnostics also prevent definitive attribution of the original rejected operation/action; the new assertions and report distinguish that limit from reproduced defects.

Even after publication approval, integration and R1 remain NO-GO until the user opens the review PR and obtains at least two independent successful hosted Windows preflights, analyzes any failure, approves fast-forward integration and separately authorizes R1. Local Windows 11 10.0.26300 (16 logical processors) is not the hosted Windows Server image. Repeated bounded local success cannot establish arbitrary-scheduler determinism or hosted CI reliability. Native input delivery limitations and historical failure evidence remain unchanged.

## K–L. User publication script and commit

`D51-publish.ps1` is the complete PowerShell block, with the exact C: worktree, base and review branch, explicit 17-path staging list, source-digest and frozen-path checks, full staged diff, integrity/suite checks, safe stops, literal commit message and review-branch-only push. It disables the pager, preserves unrelated untracked files and never force-pushes. Do not execute it before the cross-tool gate and the user's review.

**MEASURED — publication-validation-tags:** the final script committed/pushed exactly the 17 explicit paths to a local scratch review branch, kept remote main at the base and retained the literal message without attribution. With `push.followTags=true`, a reachable annotated scratch tag remained absent from the remote. Eight failed prerequisites stopped with no commit/ref changes: wrong branch, wrong base, moved remote main, pre-existing staged work, frozen edit, post-stress source change, wrong push URL and a failed verification command. The full success path ran both integrity checks and the 205/205 suite. Test-only worktree/remote constants were substituted and checked before running the scratch copy; no real remote received a write.

Initial script validation exposed Git CRLF warnings contaminating parsed path lists. The final Git helper captures stderr separately and displays warnings outside returned data. The separate reviewer then found the tag-following configuration issue; both corrections were revalidated. Logs of these development checks remain in the scratch evidence and are not stability successes.

Commit subject: `test(r1): eliminate residual CI timing races (D-51)`

Commit body (also embedded literally in the script):

```text
F-02 / D-51: separate positive fake-operation budgets from timeout fault
cases, synchronize cleanup and late work, and assert exact failure causes.
Preserve production safety, source locks, fixtures, dependencies and workflows.

Verification: node scripts/preflight.mjs; node --test --test-timeout=10000
--test-reporter=tap "test/*.test.mjs"; final offline stress and mutations are
recorded in docs/reviews/D51-report.md and D51-results.json.
```

No attribution or co-author trailer is added.

## Reproduction files

Raw logs, hosted ZIP, mutation/reproduction harnesses, read-only snapshots and publication validation reside under `%TEMP%/tabwise-d51/`. `D51-results.json` records their SHA-256 digests. Retained hosted evidence was read, never modified. Current Node timer/mock behavior was checked through Context7 against the [Node 24 test documentation](https://nodejs.org/docs/latest-v24.x/api/test.html).
