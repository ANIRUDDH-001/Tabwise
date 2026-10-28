# DECISIONS — append-only (format: docs/governance/PROTOCOLS.md §3)

Research decisions D1–D10 (with rejections X1–X9 and unknowns U1–U7) are in `../research/meta-hackathon-2026/07_DECISION_AND_RISK_LEDGER.md` §1. D11–D26 are in `../research/meta-hackathon-2026/LEDGER.md`. D21–D26 are copied below because they govern this folder. New entries start at D-27.

## D21 2026-10-27 — Finalise verified drafts
User answer: "yes you may finalise all the drafts which were verified by codex and you / including but not limited to gitignore"
Consequence: drafts installed in `app/` with Codex's fixes (13 CX28–CX35) | Reversal: user asks to revert

## D22 2026-10-27 — Product direction to test
Options: Sharpened C3 only (rec) / Test C3 and C4 together / Commit to C3 now, no tests
User answer: "Sharpened C3 only (Recommended)"
Consequence: only C3 is tested today (R0–R3, R7). C4 is untested and inherits nothing | Reversal: R1, R2 or R3 fails (PLAN decision rule)

## D23 2026-10-27 — Freeze the test rulebook (completes D18)
Options: Adopt Codex §8 as frozen (rec) / Adopt, but keep Oct 28 a hard decision
User answer: "Adopt Codex §8 as frozen (Recommended)"
Consequence: PLAN.md Day-1 tests, decision rule and kill checks are frozen. Hash of the PLAN.md text from "## Pre-registered Day-1 tests" up to "## Day plan" (UTF-8): `ca0c9feb568e7c9c4ea41832607f510af0cbf5548242adcd77f729e039af3362` (MEASURED 2026-10-27T05:07:41Z) | Reversal: new MCQ

## D24 2026-10-27 — Where governance is installed
Options: New build folder in this project (rec) / Root of the current repo / Wait until the product is picked
User answer: "New build folder in this project (Recommended)"
Consequence: `D:\Projects\Meta AI\app\`. The user runs `git init` there; it becomes the public submission. The research repo ignores `app/` | Reversal: user MCQ

## D25 2026-10-27 — Credits and spend
User answer (MCQ): "Yes, on one account". Follow-up: "dont worry about meta" … "do track meta spending dude / just saying we have got the api and 150$ credits / it's a strict cap!"
Consequence: API access and $150 of credit are available. $150 is a strict ceiling; the broker hard-stops at $100 total and every call is logged in `COSTS.jsonl` | Reversal: user changes the cap

## D26 2026-10-27 — One team, no developer split
User answer: "consider us being the only one working today / i will divide the task with my teammate myself / for you everything is being worked by us only"
Consequence: plans and STATE track work for "us", with no Dev A/B owners. Independent checks (R7) are assigned by the user | Reversal: user asks for a split

## D-27 2026-10-27 — Repository initialization and modular initial commits
User answer: "make meaningful modular and multiple commits as per the need https://github.com/ANIRUDDH-001/Tabwise-.git new repo" … "just commit!!!!"
Consequence: `app/` initialized as standalone git repo on `main` branch with remote `https://github.com/ANIRUDDH-001/Tabwise-.git`. Initial codebase committed in modular conventional commits. | Reversal: git reset


## D-28 2026-10-27 — F-01 budget broker + R0 prerequisites spec
Options: Approve as written (rec) / Approve, but TypeScript / Revise first
User answer: "Approve as written (Recommended)"
Consequence: spec copied verbatim into `PLAN.md` § F-01; installs approved: @guidepup/guidepup, @guidepup/setup, @playwright/test + Chromium, @axe-core/playwright (exact pins). The user runs `npx @guidepup/setup` | Reversal: rollback in the spec
Installed 2026-10-27 (project scope, `npm install --save-exact --ignore-scripts`, 0 vulnerabilities reported): @guidepup/guidepup 0.36.4, @guidepup/setup 0.29.3, @playwright/test 1.64.1, @axe-core/playwright 4.14.0; Chromium build 1248 via `npx playwright install chromium`. Versions chosen by Claude: newest at least ~7 days old

## D-29 2026-10-27 — Spark mode on our fixtures
Options: Contributor on our fixtures (rec) / Standard only
User answer: "Contributor on our fixtures (Recommended)"
Consequence: `muse-spark-1.3-contributor` only for our own synthetic fixture pages; never personal, sensitive or confidential input (Terms §6.2). Everything else uses Standard | Reversal: user MCQ

## D-30 2026-10-27 — Branch for F-01
Options: Current branch, you commit (rec) / You create feat/F-01-broker
User answer: "Current branch, you commit (Recommended)"
Consequence: Claude edits the working tree on the checked-out branch (`main`); the user commits at their own pace ("i will commit at my own pace and requirements") | Reversal: user creates a branch

## D-31 2026-10-27 — Modular commits for F-01 build
User answer: "again"
Consequence: F-01 committed modularly in 5 conventional commits (deps, budget broker, meta client, scripts, ledgers & codemap). | Reversal: git reset

## D-32 2026-10-27 — Remote URL update to Tabwise
User answer: "repo name update https://github.com/ANIRUDDH-001/Tabwise"
Consequence: origin remote URL updated from `https://github.com/ANIRUDDH-001/Tabwise-.git` to `https://github.com/ANIRUDDH-001/Tabwise.git`. Verified with `git ls-remote origin`. | Reversal: git remote set-url


## D-33 2026-10-27 — F-02 R1 real-speech spec
Options: Approve / Revise further (rec, with three corrections) / Approve as is
User answer: "Approve F-02 with the three corrections exactly as specified. Proceed with test-first implementation, lock the specification and fixture hashes, and run the offline validator tests. Do not start the real NVDA run automatically. I will execute `npm run r1` manually after implementation and review. Keep all failed and partial evidence. No threshold changes or fixture tuning after the first scored run. F-03 remains scheduled after R1 and must pass independent Codex review before any R2 Meta API calls."
The three corrections (user's review): set and record NVDA's typed-character echo before the scored run, keeping steps 2 and 4; "unchecked" cannot satisfy "checked", with negative validator tests; SIGINT cleanup and partial evidence, "Do not claim cleanup is guaranteed after forced termination"
Consequence: spec in `PLAN.md` § F-02; Claude builds and runs only offline tests; the user runs `npm run r1`; evidence goes in `docs/evidence/r1/` (synthetic speech only, relative paths, run IDs, hashes, versions, failures kept). F-03 (broker: per-experiment cap; on overrun record the actual charge, flag it and block calls until reconciled) runs after R1 and before any R2 call, with Codex review | Reversal: user MCQ

## D-34 2026-10-27 — F-02 amendments after reading Guidepup 0.36.4
Options per item: recommended / alternative (own 1.5 s NVDA listener; title and load speech both; exact a/d/a phrases)
User answer: "Approve the three recommended options for F-02: 1. Guidepup's native 1.0-second silence window, with an 8-second timeout per individual key action. 2. NVDA-reported window-title focus verification using the unique attempt nonce, retaining the other freshness conditions. 3. Punctuation-and-whitespace normalization for typing assertions, while preserving the original speech and recording individual character actions. Record these as explicit amendments to the approved F-02 specification. Update and lock the specification, fixture and validator hashes before the first scored run. Preserve the original 10 steps, 3/3 requirement, $0 cost, 1.5-hour ceiling, failed-attempt evidence and one-scored-run rule."
Sources: NVDAClient.js `SPEAK_DEBOUNCE_TIMEOUT = 1000` (module constant); guidepup-playwright `navigateNVDAtoWebContent.ts` (reportTitle + Alt+Escape, up to 10); NVDAClient joins parts with ", " and phrases with ". "
Consequence: amendments A1-A3 in `PLAN.md` § F-02; `fixtures/r1/lock.json` hashes the spec, fixture, steps and validator | Reversal: user MCQ

## D-35 2026-10-27 — Modular commits for F-02 build
User answer: "again commits"
Consequence: F-02 committed modularly in 4 conventional commits (fixtures, speech harness, scripts, and ledgers/codemap). | Reversal: git reset

## D-36 2026-10-27 — R1 safety fixes after incident I-01
Options: run place (GitHub Actions runner (rec) / VirtualBox VM / separate account); focus guard (read-only title check (rec) / plus raising our window / NVDA+T per key); this run (setup failed, rerun OK (rec) / void / scored FAIL); run guard (rule + runner check (rec) / runner only / rule only)
User answer: "My decisions: 1. GitHub Actions runner (Recommended). 2. Read-only foreground-window verification (Recommended). 3. Setup failed, rerun OK (Recommended), but classify that conclusion as INFERENCE with incomplete evidence. 4. Rule + runner check (Recommended). Additional requirements: * Record the original incident before implementing fixes. Preserve the competing explanations and do not assert unverified conclusions. * No real NVDA/Guidepup runs on my personal desktop again. * Use a disposable GitHub-hosted Windows VM, a manually triggered workflow, one R1 job at a time, and no Meta API calls or secrets. * Remove Alt+Escape entirely. Before every keyboard action, verify the foreground window belongs to the intended Chromium process and contains the attempt nonce. Abort on mismatch. Do not attempt to recover focus by cycling windows. * Make cleanup independent for NVDA and Chromium, preserve the original error, and retain partial evidence. * Upload evidence artifacts even when the workflow fails, crashes or is interrupted where technically possible. * Prevent concurrent repository modification during a run. Record the checkout SHA, test hashes and any detected interference. * Fix the unit-test artifact isolation so test cleanup cannot affect real R1 evidence. * Have Codex independently review the runner, foreground checks, cleanup and CI workflow before execution. Do not start GitHub Actions R1 yet. First present the exact proposed changes, verification results and independent review findings for my approval. Keep the original incident in the ledger. Do not mark it PASS, silently void it or treat the missing evidence as proof that no steps executed."
Sources: Microsoft Learn, Windows Sandbox overview: "not supported on Windows Home edition"; guidepup/guidepup `.github/workflows/playwright-nvda.yml` runs NVDA on `windows-2022`/`windows-2025` with `@guidepup/setup setup --ci`
Consequence: incident I-01 in `docs/ledger/INCIDENTS.md`; F-02 amendment A4 replaces A2; a GitHub Actions workflow for R1 (manual trigger, one job); AGENTS.md rule; re-lock before any run; Codex review, then the user approves before the workflow is triggered | Reversal: user MCQ

## D-37 2026-10-27 — Guarding Guidepup's real key sends after Codex BLOCK (B-01)
Options: send guard (wrap send points at runtime (rec) / vendored patched copy); residual check-to-send gap (accept + recheck (rec) / accept as documented / do not accept)
User answer: "Decisions: 1. Wrap send points (Recommended), conditionally. 2. Accept + recheck (Recommended), strictly within the disposable GitHub-hosted Windows VM. Requirements before approval: * Prove the wrappers intercept the actual Guidepup 0.36.4 internal send paths, including stopSpeech Control sends, individual character sends and NVDA commands. * Test this against the installed pinned package, not only mocked adapter methods. * On guard failure, timeout, stale response or missing hook, send zero keys and abort. * Verify foreground PID and attempt nonce immediately before and after each physical send. * Treat any detected focus change during a send as possibly misdelivered. Stop and mark the run FAIL. * Keep local-desktop execution prohibited. * Pin the exact dependency files being intercepted and fail closed on hash mismatch. * Have Codex independently review the implementation and demonstrate negative tests before approval. If complete interception cannot be established, do not proceed with runtime wrappers. Present the vendored-patch alternative instead. Do not trigger R1, start NVDA, commit or push as part of these decisions."
Sources: Codex review `docs/reviews/R1-D36-review-codex.md` (BLOCK); installed Guidepup 0.36.4 `lib/windows/NVDA/NVDAClient.js`, `NVDA.js`, `sendKeys.js`, `runVbsScript.js`
Consequence: runtime wrappers on Guidepup's send points, conditional on demonstrated complete interception; pre- and post-send foreground checks; dependency files pinned in `fixtures/r1/lock.json`; Codex re-review before approval | Reversal: user MCQ (fallback: vendored patch)

## D-38 2026-10-27 — Verify the D-37 changes, then Codex re-review
Options: none offered (the user's instruction after commands were blocked)
User answer: "Yes, proceed with verification of the D-37 changes. If command approval is functioning normally, run the full test suite, verify repository/evidence isolation, re-lock the changed files, and check the frozen gates hash. Record actual results in the ledgers. If command approval remains broken, stop and report the blocker. Do not bypass permissions or switch execution methods to evade the check. Once verification passes, prepare the complete D-37 diff and request a targeted independent Codex re-review, including the changed tests and GitHub Actions workflow. Do not run NVDA, trigger GitHub Actions, make Meta API calls, commit, or push yet. After Codex clears the changes, report the final test counts, hashes, review verdict, git status and proposed commits. I will make the commit decision at that checkpoint."
Consequence: verified and re-locked 2026-10-27T09:53:57Z; brief `docs/reviews/R1-D37-review-brief.md`; commit decision waits for the Codex verdict | Reversal: user

## D-39 2026-10-27 — Vendored Guidepup patch after Codex D-37 BLOCK (D37-B01)
Options: send boundary (vendored patch (rec) / lower-level runtime hooks on child_process and net.Socket / pause R1)
User answer: "Decision: Vendored patch, with a strict stop condition. Runtime wrappers are rejected under D-37. Prepare a narrowly scoped vendored Guidepup patch, preserving upstream MIT attribution and documenting every changed file. Address D37-B01 and B02 and all four major findings. Verify delayed sends, cancellation, cleanup, evidence failures and focus loss with negative tests. Do not claim a foreground check eliminates the OS delivery race. The isolated GitHub-hosted Windows VM remains mandatory. Present the patch specification for approval before editing. After implementation, obtain one independent Codex re-review. If material send-boundary blockers remain, stop this R1 implementation and present the reduced-scope alternatives. A records-only commit containing the reviewed incident and review reports is approved after a secrets/privacy check. No product-code commit or workflow push until I explicitly approve after Codex's verdict. Do not start NVDA, GitHub Actions or Meta API calls."
Sources: Codex review `docs/reviews/R1-D37-review-codex.md` (BLOCK: D37-B01, D37-B02, D37-M01..M04); installed `@guidepup/guidepup@0.36.4` `lib/windows/runVbsScript.js`, `NVDA/NVDAClient.js`
Consequence: runtime wrappers dropped; patch spec presented before any code edit; one Codex re-review after implementation; stop condition on remaining send-boundary blockers; records-only commit (review and incident reports) approved after a secrets/privacy check | Reversal: user MCQ

## D-40 2026-10-27 — D-39 patch spec rev 2 approved, with qualifications
Options: spec (approve rev 2 (rec) / red-team again / reduced scope); ack (page keydown ack (rec) / settle-only); click (sequential (rec) / upstream concurrent); typing (cscript per char + ack (rec) / persistent SendKeys helper)
User answer: "Approve D-39 patch specification rev 2 for test-first implementation. My decisions: 1. Page keydown acknowledgement. 2. Sequential NVDA.click chords. 3. cscript per character with acknowledgement. Before locking the implementation spec, explicitly qualify that cancellation prevents new sends but cannot guarantee recall of already launched OS operations. Also test whether NVDA control keystrokes can appear in the page keydown counter, and ensure they do not invalidate unrelated action acknowledgements. Preserve T0–T25, dependency provenance, the frozen R1 thresholds, the disposable CI-only restriction and the one-final-review stop condition. The 60-second cleanup is best effort; GitHub Actions can forcibly terminate a cancelled step earlier. Implement and verify offline. Then obtain the independent Codex D-39 review. Do not run NVDA, trigger GitHub Actions, make Meta calls, commit product code or push until I review that verdict."
Sources: `docs/reviews/R1-D39-patch-spec.md` rev 2 (red-team round 1 table)
Consequence: spec rev 3 adds the cancellation qualification, the best-effort cleanup wording and T26 (NVDA control keys vs the page counter); rules go into `PLAN.md` § F-02 as A7–A11, S10–S13; Claude implements and verifies offline; then the Codex D-39 review; nothing run, committed or pushed until the user reviews the verdict | Reversal: user MCQ

## D-41 2026-10-27 — Partner inference credits as backup
Options: Baseten only (rec) / all three (Baseten, Modal, Fireworks) / none
User answer: "maybe let's apply all 3 ? because if infuture needed than it would take time so better to at least request with a genuiine idea to backup the request?" then "sure"
Consequence: the user submits the three request forms themself (Claude drafted answers; Claude submits no forms). Use case stated as a backup inference provider for the same model. No code, key or provider change until a separate approval; any provider goes through the budget broker with its own cap, keys only in `.env`, one provider per whole test (R2 same-version rule) | Reversal: user
Correction: Originally recorded as a duplicate D-40; renumbered D-41 for uniqueness. No substantive decision changed. (User instruction, 2026-10-27: "Change only the second `D-40` heading (partner credits) to `D-41`." Original log line: LOG.jsonl 2026-10-27T13:47:46Z.)

## D-42 2026-10-27 — One narrow D-39 exception after the Codex D-39 BLOCK
Options: narrow fix of the five D-39 findings, test first, then a focused Codex re-review (rec) / stop custom R1 now and choose a reduced scope
User answer: "Approve one narrowly scoped amendment to D-39. The exception covers only D39-B01 (false-positive page acknowledgement), M01 (crash classification), S01 (summary write errors), S02 (dependency lock completeness), and S03 (RUNS.md). Requirements: 1. Write regression tests from Codex's P04, P05 and X04 reproductions before changing the implementation. 2. Ensure an earlier stray key cannot acknowledge a later send. Validate the event log immediately before each send, then confirm the expected new event within that send's acknowledgement window. 3. Preserve and disclose the residual indistinguishable-identical-key risk. 4. Run the full test suite, hash checks and relevant negative tests. 5. Obtain a focused independent Codex re-review of the actual final diff, including all five fixes—not merely a rerun of three tests. 6. Record the D-39 exception explicitly in DECISIONS.md. Preserve the previous BLOCK verdict and incident history. This is the final permitted correction cycle. If Codex identifies another material safety or false-PASS blocker, stop custom R1 development and present reduced-scope alternatives. No NVDA execution, GitHub Actions run, Meta API calls, product-code commits or pushes until I approve after the review."
Sources: `docs/reviews/R1-D39-review-codex.md` (verdict BLOCK: B01, M01, S01–S03; kept unchanged); Claude's B01 reproduction (LOG 2026-10-27T15:33:24Z); `docs/ledger/INCIDENTS.md` I-01 (unchanged, open)
Consequence: an exception to the D-39 one-final-review stop rule, for these five findings only. The D-39 BLOCK verdict stands as the record of that review. Tests written first; pageAck checks the page log before each send (refused, possibly misdelivered, on any non-modifier key) and confirms exactly one expected key in the send's window; a crash during teardown is FAIL; a summary that did not reach disk is rebuilt with its write error; lock.dependencies must be exactly the 7 upstream pins; `docs/ledger/RUNS.md` created. Residual, disclosed: an identical stray key that lands after the pre-send check while our own key is lost cannot be told apart. Final correction cycle: another material safety or false-PASS blocker from Codex stops custom R1 development and Claude presents reduced-scope alternatives. Nothing run, committed or pushed until the user approves after the review | Reversal: user MCQ

## D-43 2026-10-27 — Codex engineering ownership and safe Git delegation
Options: none requested; direct user delegation supersedes the correction-cycle limit and Codex push restriction for verified safe work.
User answer: "Take full engineering ownership of Tabwise R1 (F-02), including investigation, implementation, testing, and Git management." "I am overriding the previous correction-cycle limit. You may independently investigate, redesign, debug, experiment and iterate until R1 is reliable and defensible." "I explicitly authorize Codex to create commits and push independently verified, safe changes to GitHub."
User boundaries: "Safety-critical runner code and `.github/workflows/r1.yml` must remain unpublished until the corresponding safety requirements are satisfied. Do not enable or trigger the R1 workflow without separate approval." "For safety-critical R1 changes, require an independent technical review appropriate to their risk before publishing or executing them." "A simulated PASS is not an R1 PASS."
Consequence: Codex is primary F-02 engineer; first audit and explicitly stage the five approved D-36/D-37/incident records, review staged content and all outgoing commits, then commit/push only safe completed components. Preserve other work, histories, incidents, evidence and frozen gates. No reset/clean/stash/discard of others' work; no force-push. Investigate and implement routine choices without another correction-cycle gate. Isolated worktree and independent technical review precede publication of safety-critical work.
Unchanged restrictions: no personal-desktop NVDA/keyboard automation, no Actions R1 trigger without separate approval, no metered Meta calls without approval, no secrets/private data publication, no safety/permission bypass, no weakened frozen thresholds. Historical BLOCK verdicts remain unchanged. | Reversal: user instruction

## D-44 2026-10-27 — Publish only to main
User answer: "everything to be pushed to main only" "why a separate branch?"
Consequence: every remote publication by Codex targets main only. The reviewed records commit e09a068 was fast-forwarded to main after rechecking the complete outgoing diff; the temporary remote records branch was removed. Local isolated worktrees remain an engineering safety measure and are not published as remote branches. No force-push or unreviewed runner/workflow publication. | Reversal: user instruction

## D-45 2026-10-28 — Resume after checkpoint request

User answer: "summarise progress till here mark the nearest checkpoint and stop until i say continue"; later: "continue working only now no need to stop but first summarise the progress till now and also keep me in the loop throughout".

Consequence: briefly interrupted independent review, then resumed engineering and provided a self-contained progress summary. Continue D-43 scope and main-only publication with meaningful updates; execution restrictions remain. | Reversal: explicit user instruction

## D-46 2026-10-28 — Publish reviewed R1 bundle, no execution

Question: publish the reviewed R1 bundle to main including the manual workflow, or keep it local; enabling manual dispatch needs separate approval under D-43.
User answer: "Publish the reviewed bundle to main; do not run it (Recommended)".
Consequence: Codex may commit and push the exact independently approved bundle and supporting records to main. The workflow becomes manually available; no trigger, NVDA execution or Meta call is authorized. | Reversal: explicit user instruction

## D-47 2026-10-28 — Approve T16 read-only test-harness fix (B-01)

Question: the independent readiness review (docs/reviews/R1-readiness-claude.md) reproduced B-01. In r1.yml, the read-only step comes before `npm test`, so the T16 drift test's temp copy of vendor/ inherits read-only and its writes fail with EPERM (190/191). R1 would be skipped on every dispatch. Choices: clear the attribute in T16's temp copy (one test file), or move the tests before the read-only step (edits locked r1.yml, lock.json, PLAN S8, speech.test:1541).
User answer: "Approve T16 fix".
Consequence: the one change to test/vendor.test.mjs (`fresh()` now also clears read-only on its temp copy; every drift assertion is unchanged) may be committed by Codex on top of 918c8f5. No locked file, gate, fixture, predicate, ownership check or threshold changes. This authorizes no dispatch. Running r1.yml still needs a separate approval naming the new main SHA. | Reversal: explicit user instruction

Publication authorization: "Approve Codex to commit and push the verified D-47 T16 correction to main." User-supplied commit subject: "test(r1): T16 clears read-only on its temp vendor copy (B-01, D-47)". Destination: "Push: to main only (D-44)." Only the six listed files may be staged.
Execution boundary: "Do NOT trigger GitHub Actions, execute R1, start NVDA or make Meta API calls. Execution requires my separate approval."

## D-48 2026-10-28 — Offline analysis of real R1 #1 and proposed spoken-title correction

User request: "Analyze the real R1 #1 failure using workflow run 40629513668 and its complete evidence artifact." "Investigate the narrowest defensible correction to spoken nonce recognition without weakening identity checks, changing fixture content, suppressing errors, or altering unrelated frozen thresholds."
Boundary: "Do not trigger another R1 run, use local NVDA or modify historical evidence. Report the proposed patch and review verdict before requesting another scored execution."
Consequence: retrieve/read evidence, replay actual source and test a proposal in an isolated scratch copy. The frozen A4 rule is not amended by this investigation. Activation needs explicit approval of the prospective interpretation, spec/source re-lock and final review; any execution needs separate approval. This decision does not retroactively authorize the historical dispatch. | Reversal: explicit user instruction

## D-49 2026-10-28 — Approve the A14 spoken-title amendment (R1 #1 nonce correction)

User answer: "The user approves this narrow spoken-title rule amendment in principle. Record the exact amended wording in the decision ledger, identify the frozen-spec impact and re-lock any affected hashes through the established procedure." Scope: "Recognize the correct nonce when NVDA inserts spoken spaces. Apply consistent matching to the initial title check and final freshness validator. Detect and reject incorrect, incomplete, ambiguous or foreign nonces. Keep raw speech unchanged. Preserve native foreground PID and window-title checks. Preserve the original R1 evidence and failure classification."
Amended wording (PLAN F-02 A14, verbatim): the A4 initial check after NVDA+T and the freshness rule "the load speech contains this attempt's nonce" use one shared recognizer (`spokenTitleHasNonce` in `src/speech/validate.mjs`). Case-insensitive, the whole spoken title must be `R1` or `R 1`, then ` sign-up `, then exactly eight hexadecimal characters with zero or more ASCII spaces (U+0020), and nothing else, between them, then nothing, ` - Chromium` or ` - Google Chrome for Testing`. The eight characters, spaces removed, must equal this attempt's nonce. Nothing else matches: no other whitespace, punctuation, spoken number or letter words, substitutions, extra text, or characters joined across separate utterances. "No speech contains another attempt's nonce" also rejects that nonce with ASCII spaces between its characters inside any one utterance (title, raw log or step phrase); this is rejection only and never accepts a window. Raw speech, titles and errors are recorded unchanged. The native foreground check (A4, A8: this attempt's Chromium PID and the contiguous nonce in the window title) and every other rule are unchanged. Steps, expected speech, 3/3, $0, 1.5 h and the one-scored-run rule are unchanged.
Frozen-spec impact: A2/A4's "the spoken title must contain the nonce" (a contiguous substring) is replaced by A14, so a title spoken with ASCII spaces inside the nonce is now accepted. It also tightens: a title with the contiguous nonce but any other wording (another browser suffix, extra text) passed the old substring check and is now a setup failure; on attempt 2 or 3 that makes the run FAIL with no rerun. All other A2/A4 text stands. Changed locked entries: `docs/ledger/PLAN.md#F-02`, `src/speech/validate.mjs`, `src/speech/capture.mjs`. Re-locked in `fixtures/r1/lock.json` with D-49 added; the previous lock is kept under `supersedes`. The Day-1 gates hash `ca0c9feb…3362`, fixture, steps, dependency pins and vendor tree are unchanged.
Boundaries: "YOU MUST NOT COMMIT OR PUSH. I will perform all Git commits and pushes myself." "The first-run evidence remains a recorded setup failure. A second run requires my separate approval." Claude implements, verifies and prepares commit commands only; no NVDA, Actions, R1 retry or Meta calls. | Reversal: explicit user instruction

## D-50 2026-10-28 — Harden async offline tests and add a test-only Windows preflight (R1 #2 offline-test failure)

User brief (verbatim scope): "Stop the recurring local-PASS / GitHub-FAIL cycle." "Replace this timing assumption with an explicit synchronization event. Ensure pending promises are settled or safely handled on every success, failure, timeout and cleanup path. Do not weaken assertions or extend timers merely to hide the failure." Permission: test code, documentation and a separate test-only CI workflow; "You do NOT have permission to commit, push, or execute R1."
R1 #2 record (not a scored attempt): workflow run 40637055592 at 9151992a7bb10da39d988e88defaa8c5cb736914 failed in the "Offline tests" step, 204/205: `test/vendor.test.mjs` "T1 VBS preparation held, the gate stopped, the hold released …" threw `TypeError: release is not a function` plus a late `R1_REFUSED` unhandled rejection. The R1 step was skipped, so no NVDA speech was captured; artifact `r1-evidence-40637055592-1` (292 bytes, sha256:895d9ade364413073d2e6c0a0af97b2570c0262761ba7ca3b9d671ce977608eb). No RUNS.md row: RUNS lists scored runs only. R1 #1 and its evidence stay as recorded.
Root cause: the test waited a fixed `sleep(20)` for the vendored `runSendKeys` to reach its (faked) `writeFile`; on a slower runner the real `mkdtemp` took longer, `release` was still undefined, and the promise under test rejected with nobody listening. Reproduced locally with injected fs delay (30 ms) and event-loop stalls.
Change (test code only): T1 and three other vendor tests (T20 socket hold, T22 retries, gate stop kills the child) wait on an explicit event instead of a sleep, handle the promise under test from creation, and fail at once if it settles before the event; nine detached `runR1(...)` calls in speech tests must resolve before their test ends; the T12 deadline is timed from the signal (it was timed from rig creation); pageAck tests land the key on a given page read; the A4 wait test and the D43 startup test get a longer window for their positive path (they count polls or check ownership; the never-ours test keeps 50 ms and the refusal case keeps 20 ms). No assertion was removed or weakened. Added: the ack waited for the key; the gate stop kills the child at once (the old final count also passed when the send timeout killed it); no T20 post-check while callbacks are held, checked again after the write timeout; each detached run resolved. A same-vendor read-only review found the first T20 rewrite nearly vacuous and the A4 test flaky under stalls; the stress matrix also hit the D43 startup window; all three fixed, the first re-checked by mutation. New: `test/helpers/faults.mjs` (opt-in fs delay and event-loop stall, no effect unless its env vars are set), `scripts/preflight.mjs` (lock, Day-1 gates, dependency tree and clean-checkout checks; read-only), `.github/workflows/preflight.yml` (pull_request + manual; windows-2025, Node 24.22.1, `npm ci --ignore-scripts`, read-only checkout as in r1.yml, `npm test`, then repeated, serial, randomized and fault-injected runs; no secrets, `contents: read`, no Guidepup setup, NVDA, browser install, input or R1).
Unchanged: `src/`, `scripts/r1.mjs`, `.github/workflows/r1.yml`, fixtures, `vendor/`, `fixtures/r1/lock.json` (no re-lock), Day-1 gates hash, A14, foreground checks, the ten steps, expected speech, 3/3, thresholds, budget. A second R1 run still needs the user's separate approval, and only after the preflight passes on GitHub. Claude did not commit, push, dispatch a workflow, run NVDA or call Meta. Publication: the brief asks for a push to a review branch, not main, so the `pull_request` preflight runs before anything reaches main; this overrides D-44 ("main only") for this change only. | Reversal: explicit user instruction

## D-51 2026-10-28 — Comprehensive offline reliability checkpoint
User answer: "You are responsible for the next Tabwise reliability checkpoint: D-51." "Work through the investigation and implementation without requesting routine approvals. Only stop for genuine safety-boundary decisions."
Restrictions (verbatim): "DO NOT COMMIT OR PUSH. I will do both myself." "No real NVDA on my laptop." "No desktop keyboard automation." "No GitHub R1 dispatch." "No Meta API calls." "No spending." "No production rule relaxation." "No modifying historical evidence." "No fabricated PASS results."
Scope: F-02 / D-51 in PLAN; test-only correction, complete audit, final-code stress and mutations, separate read-only review, scratch-tested publication script. The user's explicit test-edit authorization supersedes the general test-edit prohibition only within this checkpoint's confirmed harness weaknesses.
Publication: "Final local verification → user commits and pushes review branch → PR → hosted Windows preflight → at least two independent successful hosted preflight runs → user-approved fast-forward integration to main → separate R1 authorization."
Consequence: work only in the C: safety worktree on test/d51-reliability; preserve the D: checkout and unrelated untracked files. Review independence and unavailable historical diagnostics must be disclosed. Reversal: explicit user instruction.

### D-51 continuation 2026-10-28 — cross-tool BLOCK corrections
User answer: "Cross-tool verdict: BLOCK." "Review these findings and make the smallest justified corrections." "The next milestone is a publication mechanism that cannot push unapproved content, not simply another green test report."
Scope: B1 sealed staged/committed tree and exact contents across normal hooks; B2 Windows PowerShell5.1/7 native handling; S1 external non-self-referential17-file seal; S2 diagnostic-only mutation attribution and bounded assertions; S3 post-quit polling success coverage. Original records retained; fresh206-test qualification and scratch validation only.
Restrictions: "DO NOT: Commit or push to the real remote. Trigger any GitHub workflow. Run local NVDA, screen-reader automation or desktop keyboard actions. Call Meta APIs or incur charges. Modify frozen R1 production logic or safety deadlines. Delete unrelated files from either worktree. Change the governance protocol to bypass cross-tool review. Claim approval before the next independent reviewer issues it."
Consequence: prior Claude BLOCK stays in force pending another cross-tool verdict; no real index.lock deletion, no hook disabling, no retry of an ambiguous push. Commit subject unchanged; exact execution requires the separately supplied external seal/hash. Reversal: explicit user instruction.


## D-52 2026-10-28 — Consolidation and safeguarded worktree retirement
User answer: "You are authorized to perform reversible local workspace operations AFTER verified backups and reconciliation checks."
Finalization: "The user explicitly APPROVES safeguarded retirement of the redundant C: worktree." "Do not bypass the existing user-only remote-push restriction."
Consequence: permanent checkout retained; redundant worktree retired through the approved non-force procedure after backup/source checks; all four stray files archived and hash-checked.
Preservation: all68 old changed/untracked project originals, local configuration, budget data, Git recovery metadata and historical evidence remain in external local recovery. No old code integrated.
Publication: prepare only these four ledger files; local commit remains blocked pending cross-tool review (Claude CLI signed out); user alone pushes.
Reversal: use the verified external recovery copies; never overwrite active common Git metadata. Full original authorization and local paths retained privately.

## D-53 — A15 configuration-only NVDA candidate
User answer: "Decision: Select Claude's configuration-only design." "Reject the custom observer, authenticated receipt channel and NVDA+Space toggle."
Approved setting: "virtualBuffers.enableOnPageLoad === false" through existing per-attempt settings/C1; keyboard settings, all ten step objects/speech expectations and strict acknowledgements remain unchanged.
Approved A15 wording is recorded verbatim in PLAN.md inside F-02, outside the pre-registered Day-1 gates. No other frozen-source change is authorized.
Boundary: "Do not commit or push. Do not dispatch R1." No local real NVDA, desktop automation, vendor changes or dependencies.
Consequence: tests first; config-only candidate and final source/spec re-lock; independent Claude review of exact diff before separately authorized hosted qualification.
Preservation: original R1 #3 remains scored FAIL/no rerun; prior uncommitted STATE and LOG preserved in local review evidence; LOG remains append-only.
Approval recorded at: 2026-10-28T15:00:38Z (UTC, date -u); user selected the configuration-only design in this session.
