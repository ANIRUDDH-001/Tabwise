# Local product integration — independent review handoff

Recorded UTC 2026-11-02T14:35:27Z (date -u). Run ID Integration-20261102T143527Z.
Worktree D:/Projects/Meta AI/app-product-integration; branch feat/tabwise-product-integration.
HEAD/base d2d18540766466de11dc9aa699a2470fc8f17582.
Frontend/MERGE_HEAD d79c066228a16e3c69c0c38f696d5525fe9dd6ab.
Merge-base063e789f2b0429105b73dc624bb96c77a660ba70; pre-integration divergence34 baseline-only /3 frontend-only commits.
Local merge --no-commit --no-ff remains pending. No commit or main modification.

## Integration (MEASURED / SOURCE)

85 paths integrated,81 under web/. No conflicts: CODEMAP web entry auto-merged and R2/W5 entries retained. Full path list/revisions: cache/integration-review/verification-summary.json. All frontend web source bytes equal d79c066, plus the new acceptance test. R2/W5 source/status bytes equal d2d1854. Root/web/contracts manifests, lockfiles and shared schemas match between source revisions. Available dependencies copied without installation; local contracts link targets this worktree only; no .env or credential files copied.

No integration source defect was confirmed. No speculative product-source change made. Added web/test/product-integration.browser.mjs with four API checks; original assertions/tests/thresholds unchanged.

## Actual flows and limits

| Flow | Observed state |
|---|---|
| Journey picker, real fixture iframe recording, reload/restore, local versions/checkpoints | Browser PASS; isolated local storage only. |
| Historical R1 trace/report, trace tabs, mobile menu, editor375/768 widths | Browser PASS; historical fixture scope explicit, no new R2 evidence. |
| Missing OAuth setup/callback code and unavailable account/run/patch/verification UI | Actual local responses/UI PASS. Signed-out and account-save success smoke cases are mocked, not authenticated backend acceptance. |
| Workspace diagnostics, owner filtering, citations and ingest | Web unit PASS, including foreign-row refusal. No live RLS/database qualification. |
| Run APIs | Gated; cross-origin writes403, forged identity/approval same-origin writes503, owned reads503 sign_in_configuration_pending. No DB/GitHub call occurs before missing-auth refusal. |
| Diagnosis / patch verification | Off/gated. Qualification/allocation/execution guards preserved. Stored patch approval never dispatches; verification view remains pending with no verdict. |
| W5 admission route | Not implemented/deployed; GET/POST /api/r2/admission and /api/r2 return404/405. Origin/key/authorization remain null and disabled. |

Credential-free tests cannot establish real GitHub OAuth/PKCE/session cookies, authenticated two-user isolation or hosted database RLS. Existing pure ownership tests are not a substitute.

## Verification (MEASURED)

| Command/scope | Result |
|---|---|
| node scripts/offline-tests.mjs --profile ordinary --seed 1 --out cache/integration-review/root-ordinary |54/54 files,1082/1082 tests PASS, exit0;126823.11129999999ms against unchanged180000ms budget. All process exits/stdio closures confirmed; no watchdog failure. |
| node --test --test-timeout=10000 test/*.test.mjs in packages/contracts |21/21 PASS, exit0. |
| Same unit command in web |107/107 PASS, exit0. |
| node node_modules/next/dist/bin/next build in web |Production build PASS, exit0; credentials absent. |
| node node_modules/typescript/bin/tsc --noEmit in web |PASS, exit0. |
| node --test --test-timeout=60000 test/recorder.browser.mjs test/web-smoke.browser.mjs test/product-integration.browser.mjs in web |15/15 PASS, exit0:5 recorder,6 existing smoke,4 new API checks. Local production server stopped afterward. |

Root ordinary remains partial:9 classified browser/process files excluded; selection.json records every file/reason. No full npm test, stress or native qualification claimed. Browser checks use isolated headless Chromium, synthetic input and external browser-request blocking; no NVDA or physical input. Commands removed/emptied OAuth/Supabase/model/GitHub/execution credentials and disabled telemetry.

Frozen R1 PASS. R2 digest971f21a1d37136c496b365cae14cbb999aefe1ce06c693b85a6507bec266789f (27 files); qualification6972c311a6e9302856ff9bb9195aa73cf106a15da8caf91ac32b781f8909f328 unchanged. R2/qualification/review statuses, budgets, security thresholds and FEATURES flags unchanged.

## Remaining genuine product bridge (SOURCE)

1. Identity: experimental tabwise-r2.yml uses numeric hosted run/attempt, plan/page/session IDs. Product tabwise-run.yml requires UUID run_id, stored journey/app/patch identity, spec_sha256, approved worker SHA and actor.
2. Format: experimental page/run manifests and events/intents/page-read/page/ack/receipt/speech/axe/capture/visual artifacts are not product artifact-manifest/evidence-bundle0.1.0. A reviewed projection must preserve exact step mapping, sequence, separate clocks, source hashes and evidence_refs; never fabricate observations.
3. Authority: W5 consumes experimental execution permission, not product worker release. A real Next.js admission handler, independently authenticated caller, approved receipt keys and actual Postgres/transport deployment require separate authorization and review.
4. Native qualification: qualified production containment from W2a plus real Chromium/NVDA capture, independent OS custody and cleanup. W2a worktree not inspected or modified.
5. Authenticity: experimental verifier does not promote native authenticity; O-11 model inputs remain refusal-only. Product ingest independently requires complete observed-nvda evidence and qualified product worker identity. Signed admission/workflow origin is not native qualification.
6. Worker: scripts/tabwise-run.mjs reaches worker.liveGate, which explicitly refuses real provider binding/physical quiescence. UI integration enables neither that worker nor product dispatch.
7. R3/R7 and activation remain out of scope. No synthetic conversion or prediction-to-verified-repair promotion.

## Preservation

Original frontend tracked files clean at d79c066 and all7 untracked files byte-identical. Existing worktrees/branches untouched. No hosted DB/workflow/model call, credential use, deployment or commit. Independent review next; merge intentionally in progress with85 merge paths staged and verification/handoff changes unstaged/untracked.
