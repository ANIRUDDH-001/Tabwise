# D-51 correction review status

Prior Claude cross-tool verdict: BLOCK (B1/B2), as provided in the user's continuation request. The original review below is historical and does not approve this correction.

Fresh separate-agent review (MODEL/L1, same model/vendor, different context) reported no open code/evidence blocker after reviewing B1/B2/S1–S3, final20x206 qualification,13 assertion catches,71 source hashes and all56 publication-case invariants. It independently found the hidden-index edge, now closed with rejection of assume-unchanged/skip-worktree flags without modifying them.

**Fresh final verdict issued: APPROVE the corrected code and local evidence. No open blocking findings. GO for another Claude cross-tool review; publication remains NO-GO.**

The reviewer independently checked the exact publisher against final56-case evidence;56 raw publication log digests;71 final-source hashes;20 qualification logs and30 additional publication-suite logs (all206/206,0fail/0cancel);13 intended assertion catches; original22 machine fields preserved; preflight/frozen paths and real index unchanged. Independence remains MODEL/L1. A temporary usage-limit interruption did not issue a verdict; this explicit verdict was issued after review resumed. Final17-file seal verification is a separate read-only check after all ledger edits, recorded outside these17 files to avoid an approval/hash update cycle. A new Claude cross-tool review is still required.

---

# Original review — historical

# D-51 separate read-only review

MODEL / L1: separate agent context, same model and vendor. This is not cross-tool or cross-vendor review; correlated errors remain possible. No source, verifier or budget-broker production file was edited by D-51. The broader cross-tool review requirement is not represented as satisfied by this review.

Verdict: **APPROVE for the local test changes, conditional on the final stress/mutation results. No blocking findings in the reviewed diff.**

Reviewed: all 205 baseline tests (speech 115, vendor 26, sendguard 26, engineering 19, broker 8, client 8, browser 3), helpers and preflight infrastructure; then the final changed test/helper code. Reviewer made no edits.

Findings accepted and corrected:

- Major: positive fake transport deadlines could expire before delayed successful callbacks.
- Major: owned-process test accepted any rejection without first establishing the launch path.
- Major: cleanup ordering relied on millisecond timestamps and competing fixed sleeps.
- Major: late startup/open tests raced arbitrary operation delays against cleanup timeouts.
- Should fix: late dispatch was unjoined; foreground/concurrent-send errors lacked specific reasons; malformed owner replies accepted any rejection.
- Should fix: broker worker hid unrelated errors and ignored exit status.
- Minor: sandbox temporary installations accumulated; teardown-entry resolver depended on a 5 ms sleep.

Final reasoning:

- Positive execution allowances are confined to tests; negative cases explicitly choose their intended deadlines. Frozen paths and dependencies have no diff.
- Owned-process reset checks the exact Error wrapper/cause, actual launch and exited-owner counterpart.
- Successful simulated runner still requires the full send sequence, acknowledgements and three complete attempts. The diagnostic PASS helper does not replace those assertions.
- Held cleanup checks that later signals cannot exit early. Deadline unit test has a live token and held finish; it joins late cleanup and forbids a second exit. Integrated browser-retention tests remain.
- Late startup/open release at known lifecycle boundaries and await stop/kill. Concurrent sends and budget workers now distinguish unrelated failures.
- Helper functions are small; sandbox cleanup stays inside directories it created.

Reviewer measurements: 5/5 selected affected/lifecycle tests passed, zero cancellations; delayed fake completion 120 ms canonical transport test passed 1/1 (same deterministic baseline reproduction failed). Frozen-path diff empty.

Nonblocking notes: PASS diagnostics receive full attempt details when state is provided (including the originally failing runner test); short negative timing tests still need precise cause assertions; local stress cannot establish hosted Windows reliability. Two independent successful hosted preflights remain necessary before integration.

Final follow-up verdict: **APPROVE all changed test/helper code and publication-script logic, no open code blockers.** The publication finding (configured automatic tag pushes) was corrected with `--no-follow-tags`; the script also verifies the literal committed message before pushing. Scratch validation with `push.followTags=true` kept the annotated tag absent remotely, pushed exactly 17 approved paths, preserved main, and stopped eight failed prerequisites without commits/ref changes.

The reviewer independently checked all 71 final-source normalized hashes and all 100 raw stress-log digests, with all 100 results 205/205, no failures/cancellations, late activity or source changes. These are narrow deterministic L3 checks; the model review remains L1. The project's cross-tool gate is still open. Final measurements are in `D51-results.json` and `D51-report.md`.
