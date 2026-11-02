# R3 implementation: PARTIAL, acceptance not demonstrated

Base d75f04335dc0ba6c9e64fb92fcedc408c5867cfc; isolated branch feat/tabwise-r3-complete. Zero incremental budget, no paid calls, installs, remote DB changes or deployment.

## Implemented
- Diagnosis uses the existing stored-evidence reader to recompute artifact identity, native R2 provenance and hashes before building input. No observations/signals fabricated. The earlier suspected timeline mismatch was not reproduced: event schemas already match. The demonstrated defect was bypassing stored provenance/hash validation.
- Spark rejects unbacked input origins before reservation. Findings must cite observations at their claimed step and give nonempty explanations. Persistence binds numbered source lines to exact source bytes. Existing structured schema, abstention, budget broker and constrained exact patch validation reused.
- Owner/digest-bound rejection works for stale/invalid proposals. Approval remains strict and now locks the app revision while recording the decision.
- POST /api/patches/[id]/apply authenticates ownership and same origin, revalidates approved source/patch, then atomically persists a private immutable candidate with audit. It never overwrites the shared app or dispatches execution. Lost responses recover through an owned candidate lookup before old source revalidation; concurrent requests serialize and replay one result.
- Patch GET/UI display stored candidate outcomes, actual diff digest for rejection, and explicit predictions/awaiting-rerun status. Finalized reviews, proposals, findings, diagnoses, candidates and audit records are immutable.
- src/repair/verify-application.mjs independently replays exact patches for R7 inspection. Schema tabwise-repair-inspection/1: ok/errors/source_sha256/evidence_class:MACHINE/independence:L3/verdict:null. Integrity inspection never claims a fix.
- Application response schema tabwise-repair-application/1: application_id, status:materialized, patch_sha256, source_sha256, replayed, dispatch:false, verdict:null. Source remains private.

## MEASURED r3-offline-20261103
- 21/21 targeted: node --test test/tabwise-r3-input.test.mjs test/tabwise-r3-application.test.mjs test/tabwise-diagnosis.test.mjs test/tabwise-diagnosis-persistence.test.mjs test/tabwise-patch-review.test.mjs test/tabwise-patch-validation.test.mjs.
- 148/148: node --test packages/contracts/test/*.test.mjs web/test/*.test.mjs.
- 809/809: node --test --test-timeout=20000 test/r2*.test.mjs.
- npm run typecheck --prefix web and npm run build --prefix web -- --webpack: exit 0.
- Installed PostgreSQL 18 isolated loopback cluster: all migrations applied; supabase/tests/repair-application.sql, patch-review.sql and persist-diagnosis.sql PASS. Includes rollback of candidate/audit, recovery, ownership, stale source, immutable audit/candidate and privilege refusal.
- test/tabwise-r3-database.test.mjs: actual concurrent independent psql sessions create one candidate and one audit; finalized approval cannot change. Opt-in requires a fresh local r3final DB, r3test role, port 55439, TABWISE_R3_LOCAL_DB=r3final and TABWISE_R3_PSQL pointing to installed psql. No deployed credentials are read. Cluster stopped after testing. Auth/storage stand-ins do not establish hosted Supabase qualification.
- Reused installed dependencies through ignored local directory junctions. No existing tests changed or weakened.

## Remaining work and genuine blockers
R3 passes stays false. Full requested lifecycle is NOT complete.
1. Candidate consumption in qualified patched-source worker and rerun admission still needs implementation. runs API refuses patch_id; worker liveGate explicitly refuses real binding. R2/W2a gates were not changed to conceal this dependency.
2. No withheld-task rescue or deliberately wrong-patch observed negative control was demonstrated. Existing verdict helpers are not evidence of rerun success.
3. Live Muse schema acceptance, source-backed localization, healthy abstention/false-positive behavior and prompt-injection robustness remain unvalidated. These require separately approved model allocation. Syntactic citation checks cannot establish semantic truth/causal certainty; findings remain model hypotheses.
4. Migration is local and unapplied remotely. Hosted authorization/RLS and authenticated browser end-to-end checks of the new action remain unqualified.
5. Claude cross-tool review remains outstanding. Separate Codex review found recovery/rejection/digest/approval-race defects; those corrections are applied. Codex review does not satisfy the Claude requirement. No independent R7 acceptance claimed.

Official function guidance consulted: https://supabase.com/docs/guides/database/functions . Context7 was unavailable without installing the CLI; no install made. Changelog Markdown fetch unavailable.

## Continuation from 5de07e6 (supersedes earlier implementation gaps)
- Fixed application-layer stale-source validation: it now uses currentBaseSha256 from its caller and refuses stale NEW materialization before RPC. Existing saved-candidate recovery remains an owner/digest-bound lookup before reapplication, so historical saved candidates can still be recovered safely.
- New migration 20261103010000_repair_rerun.sql persists exact base bytes with new candidates, checks the base digest and creates immutable repair_reruns. admit_repair requires owned human approval, complete baseline, exact same saved journey steps, matching current base revision, and an immutable candidate. It reuses admit_version/admit_run admission capacity, review, owner and dispatch checks. Concurrent requests serialize; idempotency binds version/patch and never repurposes a cached baseline admission.
- Run POST now supports patch_id with a separate TABWISE_REPAIR_EXECUTION_APPROVAL_REF readiness gate, in addition to the existing TABWISE_EXECUTION_APPROVAL_REF. Both remain unset/unactivated by this work. Patch UI can request that rerun using a stable candidate-specific idempotency key.
- Worker source consumption independently checks baseline/run/user/journey/patch/candidate identity, exact source hashes and patch replay. It never promotes qualification. Source staging creates a private temporary index.html only AFTER existing liveGate. Input comes from an untrusted staged bundle or a read-only dedicated-project DB loader (strict origin, no redirects, bounded JSON, exact record cardinality). The owned repair-input API returns the same bound bundle; it does not dispatch or attest native capture.
- Protected workflow, R2/W2a guards, R1 frozen baseline and qualification status files unchanged. No execution flag or source credential was enabled. No service key added to workflow. Generic baseline approval cannot enable repair dispatch.

### MEASURED r3-continuation-20261103
- Red regression reproduced stale materialization reaching RPC; corrected implementation passes before-RPC refusal test. Existing tests were not edited. New negative journey test corrected its test-only shared-object alias to make the mutation independent; no acceptance threshold reduced.
- Targeted diagnosis/repair/worker source suite 28/28; web/contracts 148/148; R2 809/809; worker/review 15/15; frozen R1 check ok:true/errors:[]. Typecheck and production webpack build exit 0.
- New authored synthetic browser fixture reserves a task-success oracle separately from the source proposal. The baseline fails, correct source passes, and structurally valid wrong patch fails. Checks include preserved unrelated Help control. These are DOM/accessibility-role browser assertions, not generated NVDA observations, real withheld evaluation data or proof of screen-reader rescue.
- Fresh isolated PostgreSQL 18 database: all migrations apply. Concurrent independent connections produce one rerun, one immutable source binding and one replay; stale source, foreign owner, idempotency conflict and binding rewrite refuse. Default worker-review gate refuses admission. Existing rollback SQL suites repair-application, patch-review and persist-diagnosis PASS. Cluster stopped after checks.
- Opt-in database test: TABWISE_R3_RERUN_DB=r3continue3 (fresh migrated local name matching r3continue[digits]), TABWISE_R3_PSQL=installed psql; node --test test/tabwise-r3-rerun-database.test.mjs. Uses only 127.0.0.1:55439, local r3test role and synthetic seeded data.
- Separate Codex reviewer found no remaining continuation blocker after the source-readiness gate was added. This does not replace Claude cross-tool review.

### Precise runtime blockers still outstanding
1. Existing scripts/tabwise/worker.mjs liveGate still unconditionally refuses real provider binding/physical quiescence qualification. The patched-source stage is wired after that gate and cannot run on this developer host. No native capture executor was invented or substituted.
2. Isolated runtime source delivery must be configured and reviewed: either TABWISE_REPAIR_INPUT_PATH stages the owner-authorized bound JSON, or the isolated worker receives its dedicated-project read credentials. Current protected workflow remains secret-free and unchanged; neither path was configured remotely. New repair readiness approval must remain absent until reviewed. Merely setting an approval variable does not configure delivery or qualify execution.
3. Native R2 attestation, patched fixture/source qualification and complete genuine baseline/rerun observations have not run. R3 FEATURES stays false: real withheld-task rescue and genuine wrong-patch negative control remain unmeasured.
4. Legacy candidates created before this migration have no saved base_source. Recovery of their saved output remains possible; rerun admission refuses them rather than reconstructing untrusted historical base bytes. No remote candidate existed or was migrated in this session.
5. Migrations are unapplied remotely; hosted auth/RLS and authenticated browser workflow remain unqualified. Claude cross-tool review remains outstanding. No paid Muse call/live NVDA/deployment occurred. Live Muse diagnosis validation remains outstanding outside this zero-budget task.
