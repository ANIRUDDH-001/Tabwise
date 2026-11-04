# F-03 Preview execution safety correction

Base: edb89f9f344314cbaf0d09dfda75f1fba4877e4a. Scope: server execution denial only; no migrations, dependencies, workflows, native policy or qualification approvals changed. No continuation source merged.

## Boundary and audited paths

`src/deployment-execution.mjs` reads the server system variable VERCEL_ENV at each entry. Exact `preview` throws HTTP403/reason `preview_execution_disabled`; there is no credential/approval override. Production, development and unset environments retain their previous execution behavior and existing approvals. This is a Preview prohibition, not an allowlist for arbitrary unknown deployment environments. CITED current Vercel docs identify VERCEL_ENV as build/runtime production/preview/development: https://vercel.com/docs/environment-variables/system-environment-variables (Context7 /websites/vercel).

- Paid HTTP entry: `/api/runs/[id]/diagnose` denies before auth/evidence/cache/provider work. Hosted broker `createHostedBroker.reserve`, local broker `reserve` and the sole Meta `respond` client independently deny before reservation or model request, including alternate callers/retries.
- Legacy HTTP admission: `/api/runs` with patch_id denies before reading/admitting a repair; `dispatchAdmitted` denies before claim/spec/save/POST. Baseline owned preparation remains on its original approval/integrity path and cannot select a native sender.
- GitHub transport denies ALL non-GET/HEAD methods before token use/fetch, covering workflow_dispatch, rerun, cancel and artifact mutation. OAuth uses the separate Supabase auth client and is untouched.
- `reconcileLive` returns persisted state before service-client/lease/remote work in Preview. `reconcileRun` independently returns input state, including expired/unknown-outcome/active rows, preventing claims, cancellation, ingestion and retries from GET polling. Preview can display stale active state intentionally; production reconciliation is unchanged.
- Native producer dispatch/binding/ingestion/recovery and R2 physical-input authority remain behind their existing stronger committed false policies/signature/source checks. No gate was weakened. The pinned core source change invalidates the previous R2 digest; no pin/status was updated to requalify it. Raw-source deployment tracing still passes with the new transitive guard import.
- OAuth login/callback, account/workspace/save/version reads, evidence/reports, patch review/materialization/oracle registration and existing safe request preparation do not gain execution authority. Existing preparation approval constraints remain: this change does not create an admitted hosted run or solve the prior preparation-only admission blocker.

## MEASURED local evidence (no external provider traffic)

Run: `cache/preview-safety/`. RED before implementation: four security cases failed, two production controls passed. GREEN: six boundary tests passed. Final focused suite:77 passed,0 failures/skips. TypeScript, default Turbopack production build and deployment-only native source/digest check passed.

Built HTTP test runs the actual Next production server twice with VERCEL_ENV=preview/production and a preload that fakes Supabase/auth, supplies enabled shared approval flags, eligible completed/admitted/active runs and inherited fixture-only production credentials, and refuses every nonfixture provider. Preview diagnosis/repair admission return403; no model reservations, execution claims or provider attempts occur. OAuth login still redirects; save/two-version/hash readback, workspace/read-only report page, active run GET and existing baseline PREPARED persistence succeed. Native endpoints still return503. Production diagnosis reaches its original evidence gate and repair admission reaches the controlled RPC; lower-level production fakes demonstrate one reserve/model/settle and one legacy dispatch.

Synthetic auth does not prove genuine OAuth or real Supabase RLS. Existing report integrity tests are included in the focused77. Paid/dispatch fakes never contact Meta/GitHub. No unrelated large suites repeated.

Commands (repository root):
```powershell
node --test web/test/preview-execution.test.mjs web/test/server.test.mjs web/test/jobs.test.mjs web/test/reconcile.test.mjs web/test/reconcile-completion.test.mjs web/test/native-integration.test.mjs web/test/native-binding.test.mjs web/test/native-request-api.test.mjs web/test/r2-admission-api.test.mjs web/test/stored-evidence.test.mjs web/test/diagnostic-report.test.mjs test/broker.test.mjs test/client.test.mjs
npm run typecheck --prefix web
npm run build --prefix web
node web/test/preview-execution.production.mjs
```

Independent same-model read-only reviewer found no blocking findings and independently reran6/6 boundary tests. This does not replace the external complete-source review. Original STATE/LOG session records remain uncommitted and excluded from the correction.

## Revised owner publication

After external review, use the exact new correction commit supplied with PREVIEW-SAFETY-INVENTORY.json, not edb89f9. Run the existing create-only script in the owner Git checkout with branch `preview/F-03-hosted-release-safety`. Any existing branch fails; do not overwrite it. No merge/promotion or production mutation is authorized by this handoff.

Check Vercel root web, Node24, repository/team/project and source SHA. Ensure automatically exposed system variables yield server VERCEL_ENV=preview; do not spoof it with a custom production value. Remove unnecessary inherited Meta/GitHub/private-signing credentials and approvals from Preview as defense in depth, even though they no longer override this boundary. Keep service role server-only. Runtime verification must use the new Preview commit; do not rely on the old ZIP as evidence of this correction. Database migration plan/hashes remain unchanged and owner-only.

Complete real GitHub OAuth with two browser profiles and saved-version readback. Verify diagnosis and repair execution return403 with reason preview_execution_disabled; native endpoints retain503. An eligible existing run may be safely prepared under original gates; do not fabricate hosted evidence or enable native approvals. Retain actual hosted evidence and reconcile no-dispatch/no-paid observations. Do not call a real paid provider or dispatch an executable workflow to test safety.
