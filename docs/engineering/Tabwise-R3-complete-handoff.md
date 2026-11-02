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
