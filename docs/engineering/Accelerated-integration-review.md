# Accelerated engineering integration sprint — consolidated review handoff

MEASURED at 2026-11-03T18:47:25Z. Engineering MACHINE/L0; simulated observations/model replay are explicitly labelled and confer no native authority. Existing checkpoints 22b122c and5e28cf2 remain intact. The conditionally reviewed 19-file corrections were checkpointed as3fadc85085f12e22fbdb3d94bee623efe8206487. Exact subsequent commit/parent SHAs, cumulative diff against remote PR HEAD dab193656a7336cac5bea1101adfcf4ad56ce438 and canonical source snapshots are in the companion review packet. Local checkpoint review waiver remains local only.

## Readiness classification

| Class | Measured scope |
|---|---|
| CODE READY | Local, disabled candidate modules compile and pass focused/regression checks; new sprint source awaits independent review. This is not activation readiness. |
| LOCAL INTEGRATION VERIFIED | One actual saved-journey request continues through controlled dispatch, signed synthetic worker claim, exact artifact selection and an explicit repair replay seam in real disposable PostgreSQL. |
| HOSTED VERIFIED | Read-only repository/schema/flag facts below only. Hosted application runtime, sign-in and migrations are not verified. |
| NATIVE QUALIFIED | No new R2/R3 qualification. Historical accepted R1 remains frozen; no NVDA or physical input occurred. |
| INDEPENDENTLY ACCEPTED | Prior five G2 corrections have conditional review clearance only. This sprint, hosted G2, R2, R3 and R7 are not independently accepted. |

## Delivered integration and state model

- Explicit immutable run_producers records select native-r2 or verified legacy repair runs. Missing records, ownership mismatch, conflicting native/legacy state and either lookup error block legacy discovery in every tested run state. Existing ambiguous runs are not backfilled by inference. Only new admitted baseline/native and verify/legacy tuples may register; an existing registration is immutable and exact-replay only.
- Admission remains coupled to existing owner/execution review and quota gates. No unapproved preparation-only admission path was added. The current candidate state model is saved version -> existing admission -> producer registration -> PREPARED. Preparation alone is not execution. A future preparation-only user experience requires separate review of quota, ownership, version immutability and activation transitions; the current sprint does not bypass them.
- The production coordinator and owner POST endpoint are behind committed disabled integration/sender policy. Disabled admission policy or R2 status refuses before request reads. Independent reviewer, owner approval, source/qualification/plan digests, revision, actor and expiry must match before sending. It calls the existing native workflow using its exact four declared inputs; no workflow name substitution, CI edit or second producer was introduced.
- PREPARED -> persisted DISPATCH_INTENT -> one external POST -> validated HTTP200 workflow_run_id/URLs -> DISPATCH_ACCEPTED -> authenticated RUN_BOUND. Lost response/persistence becomes DISPATCH_UNKNOWN; a crash leaving INTENT or UNKNOWN never causes a second POST. SQL unique run correlation and locked transitions reject conflicting IDs. Intent records create an immutable random nonce with a10-minute claim window; expiry never re-arms dispatch.
- `/api/r2/product-binding` is mounted with the production configuration/JWKS/service-client adapter. JWT RS256 signature, issuer, audience, subject, repository/owner/actor numeric IDs, workflow/ref/revision, run ID, attempt1, token times and jti are checked before privileged client construction. GitHub does not provide a request-specific nonce claim: the custom signed audience binds request digest + stored nonce. No custom nonce claim is invented. A service-only RPC checks nonce/expiry/request/run again under lock and persists the worker claim. Binding is metadata; it does not issue W5 or physical-input authority.
- Claims before accepted-response persistence return425 association pending and grant nothing. A conflicting run, expired stored nonce, wrong JWT identity or signature refuses. A worker transport adapter requests the exact audience and makes one claim attempt; it has no native runtime/input capability and does not retry.
- `/api/runs/[id]/native-ingest` and the native artifact adapter remain disabled. They require owned RUN_BOUND association, exact persisted native workflow/run/attempt/revision/actor, separate run/attestation artifact IDs, bounded safe ZIPs, exact raw export/spec/source bindings, real existing R2 run verification, authentic pinned Sigstore verifier handle and the independent native-product attestation/qualification reader. Artifact names and workflow-origin provenance alone cannot qualify runtime evidence.
- Durable ingestion reservation serializes concurrent consumers. Completed identical receipts replay; conflicting archives refuse. Storage uses the existing exact-path compensation. Recovery of a process interrupted after all bytes/metadata were saved is read-only and byte-exact before completion; partial/corrupt/foreign-owner sets remain quarantined, with no overwrite or automatic deletion/reset. A genuinely partial STAGING operation still requires explicit operator custody/cleanup review.
- Essential UI now explains unavailable native execution and saved requests, adds human copy for new refusals, and moves the homepage A15/R1 technical provenance into evidence details. No unrelated redesign or video work.

## Actual product continuation

Source run: `4179e682-e257-4fb6-88d6-35d362302867`; immutable request SHA256 `205995b260268998b862de60cd27c6c4bb841627b7923d9e2139c0939e070465`. The real built Next saved-version/admission/preparation route created this same run against the synthetic Supabase provider boundary and real local PostgreSQL. The continuation uses production application modules with controlled external transport.

Exactly 1 controlled dispatch POST; synthetic GitHub run456 persisted, then signed synthetic OIDC claim persisted by the real service RPC. Exact artifacts7/8 were selected under distinct native run/attestation names. Native ingestion was REFUSED under the unchanged production qualification policy. No fake handle or observed-NVDA label was used to cross that reader.

An explicit test-only seam then supplies a labelled replay input. Production Spark client/broker contracts use controlled response transport and real disposable SQL budget reservation/settlement, with zero actual model calls. Production diagnosis/patch validation and persistence saved diagnosis `6e9500a1-feca-4f1f-9147-ef5e389d11b4`; owner review materialized private candidate `2ba98daa-99c0-4339-be0b-4856ed6c021c`; actual admit_repair/oracle contracts created distinct rerun `8d5129ce-239e-4bc4-ae18-bf7699f980c3`. The original source is pinned Fernway; the replay patch changes its known close-focus line only in the private candidate. This is self-authored development replay, not independent defect discovery or a native repair success.

Same diagnosis/application IDs recover on replay. Cross-owner review and deliberately wrong candidate refuse. The new rerun has no verdict and is not executed. There are two disclosed seams: synthetic provider/transport at external boundaries, and explicit test-only replay after native-verification refusal. Test-only disposable SQL marks fixture run state complete to exercise existing repair contracts; it is not authentic ingestion or permission to bypass production checks. This source is never imported by production routes.

## Measured tests and faults

Raw logs retained in cache/accelerated-sprint; review packet copies exact logs and source.

- `node --test web/test/native-integration.test.mjs web/test/native-claim-custody.test.mjs web/test/native-artifact-custody.test.mjs web/test/native-worker-adapter.test.mjs`:45 PASS,0 FAIL.
- One full root `npm test`:1211 total,1207 PASS,3 existing DB opt-in skips,1 cancelled browser test at unchanged10000ms limit,0 assertion failures. Isolated rerun `node --test --test-timeout=10000 test/tabwise-qualification-browser.test.mjs`:1 PASS in957ms process duration. Do not describe the original full invocation as all-green.
- Final `npm --prefix web test`:239 total,237 PASS,2 DB opt-in skips. Both database integration tests executed separately and PASS.
- `python cache/accelerated-sprint/postgres.py`:11 migrations,8 SQL suites, existing request integration, new custody/concurrency/RLS integration, repair replay,9 actual production-route scenarios and same-run product continuation PASS; cluster stopped exit0. Last full database continuation is postgres-final.log; it precedes the final read-only storage-recovery addition, which is covered by five focused recovery tests and final web suite/build.
- `node cache/accelerated-sprint/browser.mjs`:5 isolated Chromium production UI scenarios PASS with controlled API responses. Actual route/SQL continuation is measured separately; no claim of one hosted browser-to-native run.
- `node scripts/offline-tests.mjs --profile ordinary --out cache/accelerated-sprint/offline`:66/66 files PASS, non-partial result; no stress profiles rerun.
- `npm --prefix web run typecheck`, `npm --prefix web run build` (Turbopack), frozen R1 and preflight PASS. Final build rerun only for affected copy/coupling/storage recovery corrections, not a repeated root historical audit.
- Final deployment trace/package checks PASS:44 traces,13 raw-source routes,0 private paths; unrelated-working-directory imports, missing-source refusal and built admission503. Additional binding/dispatch/ingest production endpoints return503 while disabled.
- Failure history retained: missing user-facing reason copy was caught by the full web suite and corrected; isolated root browser timeout passed without raising limits; an old restored build initially made a focused route harness fail, corrected by testing the current built candidate; local replay's unregistered synthetic operator refused admission, corrected in its disposable fixture. New tests failed before producer/nonce/storage-recovery implementation. No existing tests or thresholds were weakened.

| Fault | Result |
|---|---|
| Native table or producer lookup missing/error, all10 tested states | Legacy path blocked |
| Sender/admission policy disabled | No store/transport access |
| Response lost, accepted response save fails, crash after intent | UNKNOWN/INTENT retained; no second POST |
| Early worker claim |425; no run association or input authority |
| Wrong owner/run/revision/workflow/attempt/audience/signature/expiry | Refused |
| Concurrent worker claims and ingestion reservations | One immutable claim; one fresh staging reservation |
| Missing/duplicate attestation, corrupt archive, wrong owner/incomplete evidence | Refused before native acceptance |
| Complete byte-identical storage after interruption | Read-only completion recovery available |
| Partial/corrupt bytes, missing metadata or foreign owner | Refused/quarantined; no overwrite |
| Repeated diagnosis/application; wrong candidate | Same IDs recovered; wrong candidate refused |

## G1 separate custody candidate

The original diagnostic worktree remains intact at C:/Users/ANIRUDDH/.codex/worktrees/tabwise-owner-query-trace/app. Original probe/script/inventory were not replaced. Nested candidate abort-correction-20261103 now has14 synthetic tests PASS: cancellation before/during synchronous spawn and asynchronous startup, elapsed original deadline, kill exception/no-close, bounded partial numeric diagnostics, surviving descendants, creation identity/PID reuse, unseen orphans and literal post-close evidence. Raw stderr remains omitted; its count is not raw-log custody. Candidate census is pure inspection, not a launched OS sampler or containment mechanism.

Physical quiescence is always false. Direct-child close does not prove descendant/process-tree quiet; missing close/identity/census, surviving descendants, PID reuse and unattributable orphans retain containment-required. Synchronous OS spawn cannot be preempted by a Node timer; an independent outer runner containment/watchdog is still needed. No retries, timeout inflation or fallback.

The packet includes separate candidate hashes and a NON-AUTHORIZING probe registration draft with exact fixed script and command hashes, actions=[],max_sends0 and future revision/run/attempt/actor unset. It records that the candidate is not integrated into the original entry/source inventory. Next G1 work requires independent review of that integration/custody plan, owner-controlled publication/registration and an exact fresh authorization packet on an isolated Windows runner. No workflow registration/dispatch, OS query probe or NVDA was executed.

## Hosted inspection and safe activation order

GitHub MCP: main48e83a2525114b51467dce35918bd2caaf46e32f is protected; required preflight applies to everyone. PR22 OPEN/unmerged, remote head dab193656a7336cac5bea1101adfcf4ad56ce438. Local checkpoints remain unpublished.

Vercel MCP: known tabwise project prj_UDiv7hsFzi7fpun4eMhCOT8DsW0R and deployment dpl_3K8yZR5FPLJezM8fxcJUq6Xrjxqr both return scoped404/not_found. Scoped project listing does not expose Tabwise. This does not establish deletion or a current deployed revision/runtime. Previous Node26.x/ERROR observation is historical, not a current runtime measurement. Local Node24.22.1/Turbopack cannot establish hosted parity. Owner must restore/confirm connector project access and inspect the exact deployment/build/runtime before preview authorization.

Supabase MCP: dedicated project has exactly first5 migrations,19 public tables with RLS; inspected service RPCs deny anon/authenticated execution, grant service_role, use empty search_path and are not SECURITY DEFINER. Owned journey/run/finding/patch policies inspected. Native mapping table absent. Worker review PENDING, approved workers0, owner-only dispatch, diagnosis off and actions policy false. One auth user/identity and private evidence bucket exist; OAuth provider configuration, site/redirect URLs, cookie/session operation and a second real user isolation test are not established by those counts. Connector exposes no auth-configuration read capability here; do not infer it.

Pending dedicated-project migration order (no hosted application):20261103000000 repair_application ->20261103010000 repair_rerun ->20261103020000 repair_verdict ->20261103030000 repair_oracle_admission ->20261103040000 native_product_requests ->20261103181501 native_integration_custody. All11 migrations together pass locally. Local roles/auth stubs are not hosted Supabase Auth. Existing rollback/backup/quiet-window requirements still apply. Do not claim a new six-file atomic hosted rollback test: existing four-file rollback evidence is historical and was not extended in this sprint.

Configuration names only: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, GH_PAT, GH_PAT_OWNER, VERCEL_GIT_COMMIT_SHA, TABWISE_NATIVE_CANDIDATE_REVISION (local), TABWISE_EXECUTION_APPROVAL_REF, TABWISE_REPAIR_EXECUTION_APPROVAL_REF, TABWISE_META_APPROVAL_REF, TABWISE_R2_RECEIPT_PRIVATE_KEY, MODEL_API_KEY. Also review the fixed admission/server/product/qualification/native-integration policy files, receipt public key, pinned gh/trusted-root provenance policy and exact repository/actor IDs. No values were printed or changed; adding an environment reference cannot enable the committed disabled policy.

Before owner authorizes preview/migration: independent source review; exact candidate/source manifest and lockfiles; confirmed target/access, backup/restore point and quiet write window; reviewed migration tool/history/transaction behavior and rollback plan; server-only secret configuration names; protected-branch CI; consistent Node/runtime/raw-source closure; hosted auth redirect and two-user test plan. Keep workers/diagnosis/qualification disabled for initial schema and preview checks. Do not combine infrastructure acceptance with native execution authorization.

## Remaining critical path / smallest owner-controlled operations

1. Independent ChatGPT review of this exact cumulative source and failure logs. No publication or execution is implied by local commits.
2. Complete/review the native workflow delivery contract: current tabwise-r2.yml does not carry the immutable product request/nonce, obtain this product-binding claim, deliver the product package/export or issue the separate native-product attestation. Its native job lacks OIDC permission; its attestation job's Sigstore bundle is only workflow-origin. The prepared worker adapter and strict reader expose these gaps; do not solve them by renaming workflow/artifact strings or enabling a flag. Owner must separately approve the exact workflow/source/permission change and source inventory before publication. No CI source was changed here.
3. UNKNOWN dispatch cannot be recovered from a title or an early claim alone. Retain it without resend until a separately reviewed trusted request-to-run correlation is available. Likewise partial native STAGING requires explicit custody review; only fully persisted byte-identical storage can recover automatically by reads.
4. Owner restores Vercel connector access; reviews/publishes the exact approved branch/PR; authorizes only the dedicated six-migration package and inactive preview after backup/configuration checks. Then test real auth/cross-owner isolation and deployed raw-source loading. No workers or paid inference needed for these checks.
5. Independent G1 candidate/inventory review, owner workflow registration/publication, then an exact source/run/attempt-bound read-only zero-key probe authorization. Actual owner-query timing, ownership and process-tree/outer containment remain unmeasured. No NVDA/input authority is included.
6. Only after custody and source-qualified R2 prerequisites, separately authorize genuine baseline/paired controls, then R3 approved candidate/distinct rerun with independent oracle. R7 requires an independent custodian/withheld commitment and frozen criteria, not development replay. See R7-independent-preregistration.md and the null/non-authorizing draft. No withheld labels were opened or tuned against.

No push, merge, tag, deployment, hosted mutation, review-flag promotion, workflow dispatch, NVDA execution, physical input, paid Meta call, third-party message or upload occurred. Existing unfinished worktrees and evidence remain intact. Local checkpoint commits exclude the older unstaged ledger/history edits.
