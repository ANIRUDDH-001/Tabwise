# Tabwise: execution plan from native transport to independently assessed repair

Owner intent: a functioning saved-journey → genuine screen-reader evidence → diagnosis → reviewed patch → distinct native rerun → independent acceptance product. Test counts support this outcome; they do not replace it. Source for scope: current owner correction assignment and follow-up requesting detailed planning, UI/CI/AI integration and explicit permissions. No subagents.

Revision after external reviewer assessment: the G0–G5 dependency schedule and dispatch-state appendix below govern execution order. The numbered phases retained below describe work packages, not a mandatory serial schedule. R1 A15 is already accepted; Phase3 now checks reuse gaps and does not schedule an R1 rerun. This revision authorizes no new implementation, commit, hosted operation, native run or spending.

## Current engineering handoff — MEASURED, p0-followup, MACHINE/L0

- Conditional review finding1 is corrected in the instrumented fixture. `logical_target` preserves symbolic `seat-dialog`; target/target_identity still say unknown/unavailable because there is no such DOM ID. Symbolic lookup refuses ambiguous duplicate IDs; actual duplicate-ID nodes and ID-less controls retain distinct keys. Manifest updated for this derivative only. Original Fernway remains pinned at `5ad4631558cdcc557770ae864957ffc167546cd0af58bd11258808e1c0e523be`.
- Conditional finding2: narrow tracing config unchanged. Fresh Next16.4.3 Turbopack build, raw-source imports/digests, unrelated cwd, missing-source refusal and built admission HTTP503 pass. Forty route traces, nine containing raw policy source, zero private paths. The original localhost3100 output was restored and HTTP200 confirmed.
- Tests this assignment: root1211 total/1208 PASS/0 FAIL/3 database opt-in SKIP; web165 PASS; focused browser/identity/oracle/export34 PASS; preserved probe50 PASS; new cancellation/custody3 PASS. Typecheck, frozen R1 and preflight pass. Database opt-in tests were not rerun this assignment; prior evidence stays separately identified.
- New inactive `src/r2/product-dispatch.mjs`: exact owned admitted run/version, stored spec bytes, normalized and raw plan hashes, fixture source, ordered actions, page/query, revision/actor and reviewed-source digests. Immutable request identity; exclusive persistent create/read seam; conflict/crash recovery; exact native execution identity and separate run/attestation artifact selection. Fourteen tests include actual filesystem persistence/concurrent reservation and restart/recovery, not only mocked success. No live route imports this module, and it grants no dispatch/native authority.
- Actual workflow mismatch remains explicit: product dispatch/discovery assumes tabwise-run and `tabwise <UUID>`/tabwise-evidence; native workflow is tabwise-r2 with `tabwise-r2 <GitHub ID>` and separate tabwise-r2-run / tabwise-r2-attestation archives. New bridge never swaps those strings or guesses a request/run association. Missing association refuses.
- Preserved diagnostic worktree inspected and unchanged. Its source digest and97-file inventory are in the previous packet; current offline tests pass. Direct-child kill/close is not process-tree or physical quiet. New controlled tests cover absent close, synchronous close and termination exceptions: one launcher, one kill, no retry, bounded cleanup refusal, production/native flags false. No PowerShell probe, NVDA, browser foreground input or hosted execution was launched.
- Hosted read-only checks: Supabase still has only five applied migrations, four repair tables absent; saved versions/runs have RLS with auth.uid ownership. auth schema/uid exist; that does not test redirect configuration or cookie login. Flags remain owner_only/off/PENDING, zero approved worker SHAs, no qualification. Vercel project metadata reports ERROR and Node26.x; exact deployment retrieval still404 under the reported team. Connector access to actual deployment evidence must be corrected before hosted-runtime acceptance. No settings/secret values were fetched.
- Context7 CLI requests failed with network `fetch failed`; no configuration change or documentation claim relies on those failed requests. Installed Next tracing implementation and actual build/package behavior supplied the local evidence.
- Patch/source hashes, counts, logs and an incremental correction patch are under `cache/p0-followup/`. Original P0 patch and failed test logs remain retained. No independent review PASS is authored here; the owner's reported CONDITIONAL PASS is recorded as supplied evidence.

## End-to-end architecture decision

Keep tabwise-r2 as the sole native execution authority. Keep the legacy worker a refusal path until deliberately retired through review. Integrate the product by creating an immutable product-request → native execution association, not by renaming workflows or weakening their identity rules. Reuse existing source/capture exporters, budget broker, strict Spark input, immutable repair lifecycle and evidence readers.

The inactive bridge is an implementation starting point, not the complete dispatcher. Its create/read callbacks require atomic immutable storage visibility; a partial/ambiguous write refuses. The filesystem exercise does not establish production Postgres transaction semantics or power-loss durability. Before production use, add it and its adapters to reviewed source scope, deploy an immutable ownership-enforced database mapping and integrate exact native artifact verification. No bridge metadata can manufacture a qualified evidence handle.

## Phase 0 — Land the correction candidate cleanly

Outcome: one reviewable baseline, unchanged historical sources and independently accepted local corrections.

1. Review the incremental logical-target patch, updated fixture manifest and browser controls. Keep the inactive bridge as a separately reviewable change.
2. Check staged blobs against source manifest, patch application and exact tested tree. Preserve separate historical/session ledger changes rather than sweeping them into a commit.
3. Proposed commits after explicit permission: `fix(fernway): preserve logical targets beside DOM identity`; `feat(r2): prepare bound native product requests` (inactive seam plus tests); scoped ledger/plan handoff as needed. Do not blindly commit the entire inherited index.
4. Owner publishes the approved branch/PR updates. Required Windows offline CI must run on that exact published SHA and complete successfully. Local success does not count as hosted CI.
5. Independent reviewer records final disposition against that SHA. No native/hosted flags are enabled by this phase.

Permission: exact local commit selection if Codex is to commit; owner-only push/merge. CI policy edits require a separate explicit scope. Cost: zero Meta calls.

## Phase 1 — Transactional product/native bridge and honest UI

Outcome: a saved version produces a durable, inspectable native execution request and can reconcile the correct native artifacts, with live execution still disabled.

Files: inactive bridge; new reviewed migration proposal and local SQL tests; product run API/jobs/reconciliation adapters; native product-context/ingestion; run detail and journey-run UI. No workflow activation in this phase.

1. Add immutable mapping keyed by product_run_id with user/version/spec hash, raw/normalized plan hashes, fixture/page/query binding, revision, reviewed-source and qualification hashes, and request digest. Enforce ownership and immutable fields in SQL, not only browser/server checks.
2. Reserve request plus run transition in a transaction. Concurrent identical calls recover the same request; conflicts reject. Test crash before/after persistence, before/after dispatch claim, unknown HTTP outcome and resumed reconciliation using a fresh isolated PostgreSQL cluster.
3. Persist a dispatch intent before the external POST. GitHub API2026-03-10, already requested in `web/lib/server/github.ts`, returns HTTP200 with workflow_run_id/run_url/html_url; the current product callback discards this response. Record the returned ID as provisional correlation on the normal path, then require authenticated source-bound worker admission before native execution. A timeout/lost response or crash after POST enters DISPATCH_UNKNOWN; the request-bound authenticated handshake can reconcile it without a second POST. Do not build title-based discovery or a bespoke happy-path callback on the obsolete premise that dispatch always returns204. Review identity/expiry and one-run uniqueness before CI implementation. Sources: [workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event), [version change](https://docs.github.com/en/rest/about-the-rest-api/breaking-changes).
4. Use product request identity to deliver exact spec/plan bytes; the native gate independently validates them. Pair every selected page with its own source/task/query. Typed-value journeys remain refused until a reviewed native transport supports them. Patched variants require the distinct R3 application tuple; the current preparation seam intentionally refuses them.
5. Reconcile only the persisted association's workflow/revision/actor/attempt. Download exact native run and attestation artifacts separately. Verify archive contents, signed attestation, sealed source/page/run manifests and spec mapping before existing storage ingestion. Artifact names identify candidates, not authenticity.
6. Paginate bounded discovery explicitly; absence or ambiguity is a recovery state, not permission to pick latest. Test foreign owner/run, wrong workflow/SHA/attempt/plan/source, duplicate/missing/expired artifacts, tampered signatures, interrupted upload and cleanup failure.
7. UI displays saved version, request identity, actual queued/executing/evidence state and actionable recovery. Acknowledge admission only after persistence; never display completed/verified before evidence ingestion. Test reload, duplicate click, expired sign-in, interrupted reconciliation and cross-user access in isolated Chromium.

Acceptance: real API → disposable database → controlled workflow boundary → exact archive ingestion/storage → report flow, plus wrong-identity and crash controls. The controlled workflow boundary is labelled engineering; genuine native evidence is reserved for Phase4. No simulated approval appears as an owner action.

Permission requested next: approve this local implementation slice, including draft SQL and UI integration. Hosted migrations, workflow edits/publication and execution remain separate. Production migration order from prior plan remains application → rerun → verdict → oracle/admission; new mapping migration follows dependency review. Never append an unreviewed table to a hosted batch.

## Phase 2 — Measure and repair owner-query/process custody

Outcome: identify which startup/owner-query boundary fails and retain sufficient evidence to make the smallest causal fix.

1. Preserve the existing diagnostic candidate. Review exact PowerShell source/command digest, bounded process and pipe capture, environment allowlist, no input capability, cancellation and cleanup paths. Add a bounded private diagnostic log design if raw stdout/stderr is required; do not print raw stderr or substitute counts for retained bytes. Seal partial failure artifacts before final status where possible.
2. Put probe process containment under the existing reviewed custody pattern or a separately reviewed isolated job boundary. A direct-child close may satisfy pipe completion; it never proves descendants/NVDA/browser/relay quiet. Require independent pre/post census, process creation/ownership identity and stale-process rejection. Missing census/close means containment failure, and the isolated runner must be disposed rather than reused.
3. Owner registers the new diagnostic workflow on the default branch after review. Freeze exact published SHA, script/command/source hashes, actor and output bounds. Bootstrap offline only to obtain a fresh run ID and the exact future attempt packet. No dirty-worktree/future SHA placeholder is executable authorization.
4. Request approval for one read-only hosted timing probe, zero keys and zero NVDA/browser startup. Preserve entry/query-call/query-return/selection/error/exit/close timing; do not subtract independent clock origins. Original limits are27s process plus1s cleanup and outer job5minutes; do not increase them to hide the cause.
5. Use observed phase evidence to fix the actual failure. If the owner query is slow, separately compare a reviewed read-only owner-query alternative against the original owner/PID contract. If child/pipes/cancellation fail, fix custody/lifecycle. If no listener exists, diagnose startup separately. No hidden retries, warm-up or stale-process reuse.
6. Review the corrected source, then separately authorize a zero-key startup-only probe. Physical input remains unarmed. Verify controlled teardown and quiescence before requesting keyboard execution.

Permission: diagnostic code/custody improvement scope, workflow registration/publication, and then an exact one-run read-only authorization; startup is a later separate decision. Current first probe gate is independent clearance plus committed/published source/run binding. A local50-test PASS cannot substitute for the hosted observation.

## Phase 3 — Reuse accepted R1 A15 evidence; qualify only R2 differences

Outcome: retain accepted R1 `r1-20261028T153344Z` and establish which guarantees the changed R2 worker still needs. PLAN F-02 records A15 PASS; decision D-55 explicitly closes R1 and says no further R1 development. No automatic R1 re-execution belongs in this plan.

1. Validate the anchored accepted snapshot, its exact source/profile/artifact bindings and preserved historical records offline. The registered result covers the R1 sign-up fixture under D-53/A15, not Fernway or default browse-mode behavior. Six existing anchored-snapshot tests passed during this plan review; no NVDA was re-executed.
2. Make a reuse matrix for source-identical vendor/send guard/profile behavior versus new R2 process custody, relay owner queries, page recorder, source/plan mapping, per-action acknowledgment and native attestation. Require new evidence only for changed/uncovered contracts, through the R2 qualification path.
3. Preserve acknowledgment limitations: the anchored R1 snapshot reports171 sends,81 confirmed acknowledgments,90 unconfirmable and0 missing. Its PASS must not be inflated into an all-sends acknowledgment guarantee for R2.
4. Reopen R1 only on a concrete integrity discrepancy or demonstrated defect, with an explicit owner decision. FEATURES.json still contains a stale R1 passes:false alongside the accepted PLAN/D-55/snapshot; record that reconciliation issue separately and do not erase acceptance or automatically promote a frozen entry during this planning task.

Permission: this reuse/gap review is read-only/local; any new native execution or frozen-runner correction needs a separate owner authorization. Exit: accepted R1 evidence accounted for, and a finite R2 delta qualification checklist. Cost: no Meta calls.

## Phase 4 — R2 native product run, hosted environment and Spark

Outcome: a signed-in owner saves a journey, starts one admitted run, and sees stored source-bound native evidence and a persisted diagnosis.

1. Approve the reviewed bridge/workflow handshake and include every live execution adapter in reviewed digest scope; re-run hosted CI. Never enable two independent producer identities for one request.
2. Apply owner-approved migrations only after backup/restore confirmation, lock/statement bounds, rollback rehearsal and RLS checks. Preserve immutable evidence. Configure auth redirect/site/cookies and verify two-user isolation. Keep worker/diagnosis off until independently qualified source is deployed.
3. Correct Vercel connector/project-deployment access and inspect exact build logs. Reconcile configured Node26 with tested runtime deliberately. Authorize preview deployment of the reviewed SHA; test packaged raw sources/digests, missing-source refusal, disabled admission, login and owned saved-version operations in that actual deployment. Local package tests remain separate evidence.
4. Authorize only the exact native R2 paired-control plan after accepted R1 reuse and R2 delta/custody qualification. Capture healthy/broken source-bound cases and genuine physical-input/speech provenance. Require sealed complete run/page/source hashes, independent native attester and source-to-product step mapping. Failed or incomplete captures are retained and excluded from model eligibility.
5. The completed product request must traverse actual workflow association → artifacts → native attestation → storage/database → evidence viewer. Verify refresh/recovery and idempotency with that real run, without remanufacturing its evidence.
6. Replay the existing recorded Spark responses through strict native-input construction/validation/persistence first. Then request a separately bounded live Meta evaluation with exact model/prompt/input hashes, token/output ceiling, worst-case broker reservation, aggregate budget and billing reconciliation. No direct provider call, unbounded retry or model-written verification claim.
7. Check healthy false positives, broken localization, cited observation validity, rejected findings and stored usage/cost. A schema-valid answer alone is insufficient. Surface abstentions and retained evidence in the UI.

Permissions: hosted migration/auth/config changes; preview deploy by owner; review/qualification/one native paired run; and a separate paid model packet. These are distinct decisions with explicit exact sources and limits.

## Phase 5 — R3 real repair and distinct qualified rerun

Outcome: the owner reviews a persisted finding's exact patch and can inspect a distinct native rerun that independently establishes whether the task was rescued.

1. Reuse immutable patch review/application/oracle/rerun tables and candidate worker delivery. Bind baseline run/finding/source/patch/application/spec, not the current editable app head. Owner freezes explicit review and symptom oracle before admission.
2. Deliver candidate bytes to the sole native runner under a new exact source-bound authorization. Verify baseline and candidate digests, distinct rerun ID, qualified input custody and complete evidence ingestion.
3. Compare correct and deliberately wrong patches plus healthy/broken controls. Test stale source, mismatched digest, duplicate owner requests, foreign ownership, tampered/missing evidence, crash/concurrent recovery and incomplete rerun. Preserve unaffected-step regression assessment. Ambiguous legacy focus never certifies FIXED.
4. UI exposes exact diff, immutable owner decision, candidate hash, baseline/rerun identities and independent verdict basis. It must not conflate patch materialization, browser improvement and native acceptance.

Permission: real immutable owner review/oracle registration and separately authorized native candidate rerun(s). Local tests do not preapprove the production patch. No live model is needed merely to verify a frozen patch.

## Phase 6 — Independent R7 and the complete demonstration

Outcome: an independent reviewer evaluates frozen evidence and withheld tasks without tuning the implementation/model against them.

1. Start evaluation preparation immediately alongside G1/G2: an independent custodian freezes withheld task identities, labels, expected outcomes, criteria and access rules before developers or the model inspect task-specific results. Register a hash/seal without exposing task contents in development logs. Before execution freeze source/model/prompt; afterward seal genuine baseline/rerun evidence and results. Include failures/abstentions. A compromised holdout is replaced and preregistered before evaluation, never silently relabelled.
2. Reviewer who did not develop/run/tune the tests assesses withheld tasks, correct/wrong patches and healthy/broken cases, provenance, completeness and unaffected-step preservation. The implementation agent assembles/checks integrity only; it does not author independent PASS.
3. Run one owner-observed final journey through the actual deployed UI and real stored artifacts: save → admit → native execution → evidence → diagnosis → review → candidate → distinct native rerun → independently assessed report. Verify the evidence links survive refresh/sign-in recovery. Record actual durations/costs from this run if shown.
4. Only then prepare the demo narrative/video and final submission artifacts. Show the product outcome and evidence basis; label any replay segment explicitly. No broad redesign displaces native reliability work before this point.

Permission: independent reviewer access/share and assessment scope, exact remaining native/model operations, then separate demo/submission work. No external upload or share is inferred from this plan.

## Commit, CI and progress discipline

Each coherent phase/slice ends with a scoped diff, exact acceptance commands/results and evidence manifest. Request explicit commit permission for the exact files/description, then leave push/merge/release/deploy to the owner. CI must verify the published commit, including source-integrity and offline refusal tests. Native CI is separately approved and cannot run from ordinary PR tests. Paid runs always use the broker and their own bounded authorization.

Progress updates distinguish: implemented locally; transaction/API/storage tested; hosted build tested; native execution observed; independently accepted. At every stage report the user-visible path established, next implementation step and exact permission needed. Do not mark FEATURES true before its registered verification passes in the relevant session. No guarantee of judging outcomes replaces this engineering sequence.

Recommended next approval: the local G2 transactional bridge/API/UI slice and a separately tracked local G1 diagnostic-custody refinement, executed in alternating bounded slices by the sole implementation agent. G0 review/publishing and early independent R7 preparation advance alongside them. No publication, hosted SQL/config, native startup/input or paid request permission is bundled into this proposal.

## Governing G0–G5 schedule and convergence gates

| Gate | Work and actual exit | Dependency |
|---|---|---|
| G0 | Independently inspect full staged source, tests and source manifest; owner approves scoped commits/publication; hosted CI verifies exact SHA. Track preview runtime as a separate exit: DEPLOYED_VERIFIED or DEPLOYMENT_BLOCKED with specific corrective action. | Local G1/G2 work need not wait; hosted experiments require their own reviewed published revisions. |
| G1 | Review/refine the read-only probe, cancellation, bounded evidence export and containment; obtain authorized isolated Windows timing observation; make only the causal correction supported by that observation. | Runs alongside local G2. Native startup/input and workflow registration remain separate gates. |
| G2 | Transactional mapping, API/producer coordination, ownership, durable recovery, exact artifact/attestation validation and truthful UI; integrated API+disposable PostgreSQL+controlled workflow+storage tests. | Runs alongside G1. No live workflow replacement or activation. |
| G3 | Reviewed source/plan frozen; accepted R1 guarantees reused; R2 deltas, custody and qualified native paired controls independently checked; exact product mapping/evidence persisted. | G1 native readiness plus approved execution path. Engineering captures may precede full product deployment, but do not count as integrated product acceptance until G2 ingestion is exercised. |
| G4 | Real admitted evidence reaches strict Spark input and persisted diagnosis; source-bound owner-reviewed repair reaches a distinct qualified native rerun with correct/wrong controls. | G3 qualified evidence, G2 persistence; live model/native candidate runs separately authorized. Offline replay/R3 persistence preparation may proceed earlier. |
| G5 | Apply independently preregistered withheld criteria to frozen evidence; independent verdict; owner-observed deployed saved-journey-to-report path. | Evaluation preparation starts now; assessment waits for actual qualifying evidence. |

The lanes are logically concurrent, not authorization for subagents: one implementer alternates small G1/G2/UI slices so database work does not delay preparing the first useful native experiment. Keep native source changes frozen during any hosted run. Finish small completed slices for review rather than waiting to publish a single large integration.

UI comprehension begins in G2 and can progress during native qualification: explain what Tabwise tests, show a concrete journey, and label genuine historical speech versus current-run evidence. Keep A15/nonce/attestation vocabulary in detailed evidence views. Do not imply default browse-mode coverage or hide incomplete states. Verify UI with owned fixtures and isolated Chromium; avoid unrelated redesign.

## Explicit dispatch and recovery state machine — proposed G2 contract

| State | Durable fact and allowed next action |
|---|---|
| PREPARED | Immutable owned request/spec/plan/source mapping exists. No external action recorded. |
| DISPATCH_INTENT | A transactional compare-and-set grants one dispatcher the send intent; audit appended before POST. A worker crash here is ambiguous because no database transaction can prove whether the following network operation occurred. |
| DISPATCH_ACCEPTED | Validated GitHub200 response and exact run ID persisted; provisional association only. Resolve ID to actual workflow/revision/actor; no native authority inferred from a response alone. |
| DISPATCH_UNKNOWN | Timeout, malformed/truncated response, or crash between send and persistence. Preserve intent and error metadata; never automatically resend because an execution may exist. Reconcile authenticated worker handshake or owner-reviewed evidence. |
| RUN_BOUND | Authenticated request-bound worker claim matches exact workflow/revision/actor/run/attempt/spec/plan/source; SQL atomically enforces one run per request and one request per run. Duplicate identical claims recover; conflicts reject before physical input. |
| RUNNING / INGESTING | Existing independently approved native admission permits execution; complete sealed artifacts and attestations are validated and stored idempotently. |
| COMPLETE / INCOMPLETE / FAILED / CANCELLED | Record outcome separately from evidence qualification. A failed job can still leave partial evidence. Cancellation without confirmed cleanup remains containment uncertainty. A replacement execution requires a fresh owner-approved authorization, not reuse of the old send intent. |

Database transaction boundaries contain only local state changes. The external POST occurs between them. Do not hold a SQL transaction open across GitHub dispatch or promise exactly-once VM creation. The achievable safety property is one admitted native execution per immutable request under database-enforced admission, with ambiguous external outcomes failing closed. Unclaimed/duplicate jobs must receive no input capability and be accounted for during cleanup.

Required fault-injection cases before G2 acceptance: crash before/after send-intent commit; POST never reaches GitHub; accepted POST loses response;200 received then process crashes before persistence; response and worker handshake arrive in either order; dispatcher lease expires while original POST remains in flight; duplicate worker claims and cross-request run-ID collisions; signature/plan/source mismatch; out-of-order or repeated terminal/artifact events. No automatic resubmission is justified by lease expiry or an empty discovery page.

## Independent evidence and evaluation boundaries

Three distinct checks are required: (1) authenticated worker caller/admission establishes who may claim the request; (2) GitHub workflow-origin/SLSA attestation binds published workflow execution and subjects; (3) the qualified native verifier checks capture completeness, input/custody/source identity and signs the native evidence binding. Two matching artifact names or one valid GitHub signature do not establish physical input custody. Existing product-bridge policy/native-attestation verification remains authoritative; metadata selectors are not authentication.

Source review and R7 assessment are different roles. The proposed external reviewer can inspect development source and known controls; that alone does not establish blind withheld-task independence. Record assessor/custodian identities, prior exposure, criteria registration and package seal. Source-review CONDITIONAL PASS neither authorizes execution nor certifies native/R7 acceptance.

The reviewer's proposed November4 16:00 IST checkpoint is retained as an OWNER-UNAPPROVED planning proposal, not an amended technical threshold or automatic cancellation. If adopted, decide against actual evidence then: primary objective remains genuine R2→Spark→R3→R7; contingency demonstrates the strongest actually working scope with exact limitations. Prepare story and asset requirements now; final recording needs a stable, truthful path and owner decision. Internal submission November4 22:00 and hard deadline November5 07:30 IST remain the project-recorded dates; no new external contest-rule verification is claimed here.

Do not rerun full regressions for prose-only review. Use focused checks for demonstrated changes, then one full acceptance run on the final code candidate; map it to the exact committed tree and required hosted CI. Re-run when code, dependency, environment or a failure creates a concrete reason. This plan refinement changes no runtime source and does not start G2 implementation.
