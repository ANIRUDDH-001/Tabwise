# R2 production bridge — independent review handoff
Recorded UTC: 2026-11-02T18:27:11Z; run_id Bridge-20261102T182711Z.

## Candidate and boundary
Baseline/HEAD: 11b070c7279a3a7e14b0273d87a8f07efa8d6d80.
Worktree: D:/Projects/Meta AI/app-r2-production-bridge.
Branch: feat/tabwise-r2-production-bridge. Uncommitted, unstaged; other worktrees preserved.
R2 SHA256: 722fc80cc55d8420dbe088946b56b7ee70060781310621064ab9d8803569807e (53 reviewed paths).
Qualification SHA256: 6972c311a6e9302856ff9bb9195aa73cf106a15da8caf91ac32b781f8909f328 (unchanged).
Frozen R1 and baseline integrity PASS. All committed runtime status and transport files unchanged and disabled/BLOCK; new policies disabled/null. No installation, credentials, hosted DB, model call, workflow dispatch, native operation, R3/R7 or commit.

## Implemented production seams
- Next.js POST /api/r2/admission uses the same service boundary exercised offline. Disabled configuration returns 503 before keys, network, body processing or database access. There is no issuance endpoint or Edge Functions dependency.
- Trusted server policy requires explicit immutable repository/owner/actor IDs and OIDC subject; exact deployment SHA, repository, workflow, event, run/attempt, purpose, approval, plan and both source digests must match. Caller body identity is independently checked against a signed RS256 GitHub OIDC token. Fixed issuer/JWKS, audience, timing, strict duplicate-free JSON, bounded input, no Origin/Cookie, no arbitrary key URL. Signing key and service client factories run only after verification. Ed25519 receipt key must match reviewed public key. Uncertain permanent consumption returns refusal; no retry creates a new permission.
- Existing PostgreSQL authority/atomic SQL, Ed25519 receipts, one-use coordinator grants and finalization are unchanged. Concurrent/same-run replay and uncertain outcomes are tested with an isolated transactional-authority mock. No new real PostgreSQL claim is made.
- Product request helper derives ownership/spec/run/workflow identity from an already authorized stored run and checked gate. It does not issue permission or dispatch. Existing user session authorization and compensated artifact storage remain in place.
- Separate tabwise-r2-product-artifact/1 preserves the actual tabwise-r2 worker, run/attempt, revision/digests, page/session, plan, product UUID, journey/spec/app identities. Original product artifact schema and thresholds are unchanged.
- Export references raw source lines and full original events (timestamps, clock/sequence, evidence references, artifact bytes). Sealed manifests, exact file coverage/hashes, fixture/plan, task/action/step/key maps, complete telemetry and unmapped-row checks must all pass. No speech, screenshots, focus, citations or missing telemetry is generated.
- Inspection always returns source_verified=false and synthetic-test/incomplete preview. Independent signature assessment also remains source_verified=false. Only internal committed native policy plus qualification PASS and source/custody signature can mint an in-memory native handle. W5 receipts and caller flags cannot mint it. New explicit ZIP ingestion refuses synthetic/incomplete material; original generic ingestion is unchanged. Stored R2 reads repeat full native verification and recompute manifest. PNG bytes may be returned only for R2 evidence; legacy WebP behavior stays intact.
- Node server uses an allowlisted native loader for exact CLI digest/parser implementations. Deployment must contain the exact reviewed source tree at the expected working directory; absence is refusal, not a bundled fallback. Existing CLI policy import guard stays unchanged; strict JSON parser was extracted unchanged and re-exported.

## MEASURED verification
- Root: node scripts/offline-tests.mjs --profile ordinary --seed 1 --out cache/bridge-review/root-ordinary; 54/54 files, 1082/1082 tests PASS, exit0, 180000ms budget. Exact elapsed in results-ordinary.json. Every child exit and stdio closure confirmed; nine pre-existing classified exclusions. No full native suite or stress claim.
- Contracts: node --test --test-timeout=10000 test/*.test.mjs in packages/contracts; 21/21 PASS.
- Web/API: same command in web; 127/127 PASS, including generated cryptographic fixtures, negative identity/binding/replay/uncertainty, structural export positives, synthetic/native-policy refusals and storage guards.
- Browser: node --test --test-timeout=60000 test/recorder.browser.mjs test/web-smoke.browser.mjs test/product-integration.browser.mjs; 15/15 PASS against credential-disabled loopback production server. POST admission503, GET405; server stopped. Browser tests are synthetic local regression, not Chromium/NVDA qualification.
- TypeScript --noEmit and Next production build exit0. Dependencies already available; no install. Build and root boundary failures retained alongside corrected GREEN outputs; no failed assertion removed.
- Only two existing tests changed as explicitly approved: exact source membership and admission absent404 to disabled503. All other old tests/thresholds preserved. Protected W5 SQL/core, qualification, workflow, budgets, vendor and status paths unchanged. git diff --check PASS; historical ledger prefixes retained.

## Working offline path and remaining gates
MEASURED: authorized product run fixture → real Next service handler → signature/binding verification → existing W5 authority adapter with isolated atomic database mock → coordinator one-use grant and finalization → raw export contract inspection → product refusal with zero writes. A passing structural fixture or signature check is not a real observation qualification.

Still blocked: actual current R2 producer records synthetic evidence and does not write the reference-bearing export/native observation format required here. A separately qualified real producer must emit exact raw observation records/export, preserve source custody and identity, and supply independently signed native attestation from a real qualification authority. No qualified attester/exporter is fabricated by this candidate. Existing physical late-NVDA containment, Chromium/NVDA evidence and W2a qualification remain unresolved.

No active product dispatch or automatic worker selection is wired to this explicit ingestion seam. Existing worker review remains BLOCK. Before selection, require independently qualified source/exporter, trusted product-stored run metadata and schema agreement, then call ingestR2BridgeArchive with trusted expected identity. Existing legacy acceptance must stay separate.

Live server remains unconfigured: owner-controlled origin, immutable IDs/subject, reviewed deployment/source revision, server-only keys, durable authority provisioning and credentials all require separate approval/review. R2 workflow id-token permission is unchanged; an approved controller/job custody design must obtain execution authentication without exposing OIDC/service/signing credentials to page/browser/NVDA children. No deployment or working authenticated endpoint is assumed. Production receipt permission and experimental W2a approval remain distinct; product evidence acceptance remains independent of both.

Recommended order: independently review this candidate → preserve only if authorized → qualify W2a/native custody and source exporter/attester → approve server/controller identity and durable authority provisioning → reproduce exact digest-bound service and real evidence acceptance → separately approve product worker selection and any execution activation. None of those approvals is supplied here.

## Exact engineering inventory
- packages/contracts/r2-product.mjs
- scripts/tabwise/r2-admission-server-policy.json
- scripts/tabwise/r2-policy.mjs
- scripts/tabwise/r2-product-policy.json
- scripts/tabwise/r2-run.mjs
- src/r2/approval-constants.mjs
- src/r2/node-review.mjs
- src/r2/product-bridge.mjs
- src/r2/strict-json.mjs
- test/r2-review.test.mjs
- web/app/api/r2/admission/route.ts
- web/app/api/runs/[id]/evidence/route.ts
- web/lib/server/artifact-ingest.mjs
- web/lib/server/r2-admission-live.ts
- web/lib/server/r2-admission.mjs
- web/lib/server/r2-caller.mjs
- web/lib/server/r2-evidence-bridge.mjs
- web/lib/server/r2-product-context.mjs
- web/lib/server/stored-evidence.mjs
- web/test/helpers/r2-bridge-fixture.mjs
- web/test/product-integration.browser.mjs
- web/test/r2-admission-api.test.mjs
- web/test/r2-offline-pipeline.test.mjs
- web/test/r2-product-bridge.test.mjs
- web/test/r2-storage-bridge.test.mjs

Evidence: cache/bridge-review/verification-summary.json, integrity.json, scope-audit.json; red/green suite logs and production-server shutdown record. External review ZIP includes source copies, complete tracked/untracked diff and SHA256 inventory. Stop before committing.
