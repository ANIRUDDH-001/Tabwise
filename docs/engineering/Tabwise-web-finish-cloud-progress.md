# Tabwise web finish — Cloud progress (CLOUD-TABWISE-WEB-01)

Updated: 2026-11-01T01:26:32Z (`date -u`). Branch `feat/tabwise-web-e2e-finish`. Starting HEAD `9e904b38aa5b7b30a6c94a303cb621473e38431d`.
Plan: `docs/engineering/Tabwise-web-finish-implementation-plan.md` (REV-01…REV-05).
No commits, pushes, branch changes, installs, deployments, credential use, service mutation or live execution were performed. All work is uncommitted in the working tree.

## Environment limits (MEASURED)
- `web/node_modules` is absent; nothing was installed. **Deferred (NOT RUN):** `npm --prefix web run typecheck`, `npm --prefix web run build`, all browser/E2E checks (V-03…V-19). Needs Codex / Claude Local after `npm ci`.
- Substitute checks that did run: TypeScript `transpileModule` syntax check of every app/component TSX (0 errors), and strict `tsc` against minimal scratch type stubs for react/next (only stub artefacts remain: implicit-any handler params and `key` props). This caught and fixed one real bug. Neither substitutes for the real typecheck.

## Completed (source + unit tests; browser acceptance deferred)
| Task | Status | Notes |
|---|---|---|
| T-P0-01 nav model | done | `lib/site-navigation.mjs` (primary/top nav, `isActive`, `activeHref`, `sectionFor`, `parentHref`, `currentInList`, `breadcrumbsFor`); owned sidebar uses real routes |
| T-P0-02 shell + mobile | done (browser unverified) | `TopNav` (groups, aria-current per region, Menu drawer ≤900px, Escape/close/backdrop, focus in + return, closes on route change); `Workspace` derives active state from pathname |
| T-P0-03 workspace routes | done | `/w/me`, `/w/me/journeys`, `/w/me/runs`, `/w/me/reports`; ops in owned shell; no `#` URLs |
| T-P0-04 config/auth states | done | `lib/reason-copy.mjs` (copy for every emitted reason code, test-enforced), `workspaceState()`; config 503 shows "not set up" with no sign-in button |
| T-P0-05 journey picker | done | `/journeys` with client local-draft/version badge |
| T-P0-06 drafts/versions | done (browser unverified) | `lib/local-drafts.mjs` + Recorder: 500 ms debounce, sync flush on recorded step, `visibilitychange`(hidden), `pagehide`, unmount; restore/discard banner; validated legacy `tabwise-version:*` (read-only, never deleted); versions panel; confirm before loading over unsaved work; storage-failure warning; mobile notice + versions list |
| T-P0-08 honest pipeline | done | `lib/feature-states.mjs`, `FlowStrip`; "Run pending" removed |
| T-P0-10 R1 evidence | Step 2b | PASS artifact `r1-evidence-40716824856-1` is not in the repo → not validated. Failed run labelled "Diagnostic example: failed R1 run"; scope note + "PASS recorded in ledger but not validated for display" on home, demo, trace, report |
| T-P0-11 polish | partial | `components/ui/*` (PageHeader, StatusChip, EmptyState, InlineStatus, Panel), skeletons, state cards, stacked tables ≤740px, 44px targets; V-19 browser check deferred |
| T-P1-01 titles | done | metadata on every page; dynamic titles on id routes |
| T-P1-02 keyboard tabs | done | `lib/tabs.mjs`, roving tabindex in RunDetail |
| T-P1-03 report in shell | done | `/r/r1-diagnostic` inside shell with breadcrumbs back to trace and demo |
| T-P1-04 reasons | done | LiveRun, PatchReview, Ops, SavedJourneyVersion use `reasonText` with small `code:` detail |
| T-P1-05 breadcrumbs | done | `components/Breadcrumbs.tsx` rendered by the shell on every non-root page |
| T-P1-06 malformed ids | done | `lib/ids.mjs`; versions, runs report, patches, verifications 404 |
| T-P1-07 error/404 | done | navigation back to Demo / Your workspace / Status |
| T-P1-09 loading | done | skeletons with `aria-busy` in workspace, run, patch, version |
| T-P1-10 patch link | done | `/verifications/pending` link replaced by a gated explanation |

Existing test edits (plan-sanctioned, intent kept): `workspace-navigation.test.mjs` now asserts `/w/me/runs` and `/w/me/reports` instead of hash anchors; `workspace-states.test.mjs` only gained tests.

## Verification (MEASURED, this session)
- `npm --prefix web test`: 85/85 pass (baseline 55/55).
- `git diff --check`: exit 0.
- typecheck / build / browser: **NOT RUN** (dependencies absent).

## Blocked / remaining
- T-P0-07 auth unavailable page + redirects: see latest checkpoint notes below; cookie/PKCE checks (REV-04) BLOCKED (no credentials, no Supabase config).
- T-P0-09 authenticated E2E: BLOCKED on owner gates G1–G6.
- T-P0-10 Step 2a: owner must supply artifact `r1-evidence-40716824856-1` (sha256 `4198076…c885`) for validation.
- Account-save copy for config 503 ("not set up") needs `lib/account-save.mjs` to expose the reason; left unchanged to keep `account-save.test.mjs` untouched.
- T-P1-08, T-P2-*: not started.
- Codex/Claude Local: `npm ci`, typecheck, build, V-03…V-19 at 375/768/1280, keyboard walk-through of drawer and tabs.

## Checkpoints
Cumulative patches from the starting HEAD, built without Git writes (`git diff HEAD` + `git diff --no-index /dev/null <new file>`), checked with `git apply --check` on a `git archive` export of the starting HEAD. SHA-256 and sizes are in the accompanying `*.sha256` file delivered with each patch and in the final report.
Apply: `git apply --whitespace=nowarn tabwise-web-cloud-<X>.patch` on a clean checkout of `9e904b3`.

## CODEX-TABWISE-WEB-02 integration handoff

Updated: 2026-11-01T04:06:45Z. Evidence/run id: `web02-20261101T040523Z` (local Windows, Node 24.22.1). This section supersedes the Cloud environment limitations above; it does not supersede historical Cloud measurements.

### Reproduced defects and corrections (MEASURED)

| Defect | Result | Correction and regression |
|---|---|---|
| A: unsafe version switch | CONFIRMED, corrected | Browser reproduction replaced 1 unsaved step with 6 saved steps after denied writes. Loading now aborts unless the draft write and readback match current steps; visible explanation, current steps retained. `recorder.browser.mjs` A passes. |
| B: false save success | CONFIRMED, corrected | Browser reproduction reported Saved after payload succeeded and index write failed. Save now requires readback-confirmed payload, index and current pointer; failures keep current steps/draft and all prior versions. Corrupt indexes are refused without overwriting; duplicate hashes deduplicate. Unit cases cover quota, denied, corrupt, duplicate and partial writes at every stage; browser B passes. |
| C: stale journey state/listener | CONFIRMED, corrected | Real React DOM rerender from passenger to seat retained passenger's 1 step instead of seat's 5. Journey-keyed inner session resets rules, refs, timers, recording and listeners. Browser C exercises reused outer component, recording after the identity change, separate draft writes and returning/restoring A. |
| D: mobile version controls | CONFIRMED, corrected | At 375px the only version action was hidden; no read-only action existed at either target width. Visible View steps opens an integrity-checked preview without changing the editor/draft. Keyboard Enter and touch tested at 375/768; no horizontal page overflow. Operation feedback now sits outside the hidden mobile editor. |

### P0 integration

- T-P0-06: storage and lifecycle defects corrected; actual Fernway iframe keyboard recording, immediate reload, restore, two distinct saves and refresh passed. V-08/V-09 focused flow, V-10, V-16 and cross-journey V-17 checks exercised. Hidden-tab/close/reopen behavior remains for final manual QA.
- T-P0-07: implemented planned HTML unavailable page and safe reason whitelist. Local login (OAuth flag disabled) and missing-code callback returned 303 to HTML; malicious reason fell back without reflection (V-11/V-13 PASS). Existing success responses pass through; real PKCE/session cookies remain BLOCKED, never claimed from the synthetic header test.
- T-P0-03: fixed a further reproduced integration gap: summary supported diagnostic_evidence_available, but workspace API never supplied it. Owner-validated run IDs now receive bounded diagnostic evidence metadata lookups; failed diagnostic runs appear in Reports. Foreign rows are refused before artifact lookup, and lookup errors remain errors instead of false empty states. Existing workspace and ops routes still use their real APIs.
- T-P0-10 step 2b retained. Targeted repository artifact-name search found no later PASS artifact/summary. Required: original `r1-evidence-40716824856-1` ZIP (expected SHA256 `419807699a32e3752f6e6637f275803b9db803c960991f0b4d8ecfe8844fc885`), provenance/profile/content/disclosure review. No PASS trace or R2 claim was invented.
- T-P1-02: local trace End-key selection/focus passed; existing arithmetic tests pass. Mobile menu Escape/focus return and malformed verification 404 passed. Other inherited P1 completion claims still need final browser QA.

### Final verification (MEASURED)

| Command/check | Result | Exit |
|---|---|---|
| `npm --prefix web test` | PASS, 96/96 | 0 |
| `npm --prefix web run typecheck` | PASS | 0 |
| `npm --prefix web run build` | PASS, includes dynamic auth unavailable route | 0 |
| `git diff --check` | PASS | 0 |
| `node --test web/test/recorder.browser.mjs` | PASS, 5/5 real React/browser regressions | 0 |
| `node --test web/test/web-smoke.browser.mjs` | PASS, 3/3 local Next/fixture workflow checks | 0 |

Browser scope: isolated headless Chromium, browser-only synthetic input, external requests blocked; local Next process had OAuth/public Supabase/service credentials overridden to empty without editing .env.local. Workspace/ops produced genuine local configuration 503 states. No NVDA, execution, model call or production write. Dev server stopped. An automatically generated web/AGENTS.md was present by the session snapshot and is retained byte-for-byte (baseline SHA256 checked). It is outside the product changes and should not be staged with this task.

### Changes, review and remaining work

- Exact path inventory: [Tabwise-web02-change-inventory.json](Tabwise-web02-change-inventory.json). It classifies all inherited files by their session-start hashes, distinguishes additions and changes to previously clean tracked files, and excludes the unrelated directory. Existing tests were not edited in this session; all inherited changes retained.
- Added regression files: `web/test/local-save-failures.test.mjs`, `auth-redirect.test.mjs`, `workspace-diagnostics.test.mjs`, `recorder.browser.mjs`, `web-smoke.browser.mjs`. Browser tests run separately from the standard unit-test glob; use the latter smoke test against a credential-disabled local server.
- Independent reviewer: no actionable findings in scoped changes; 11/11 targeted unit tests independently passed. Browser review was outside that reviewer's scope. Owner review should focus on Recorder/local-drafts state transitions, safe auth redirects, and owner-checked workspace diagnostic lookups (up to 25 bounded artifact queries, concurrent; no artifact bytes fetched).
- BLOCKED: T-P0-09 real GitHub OAuth, PKCE/session persistence, authenticated save/view, second-user API isolation and database RLS verification; needs secure owner configuration and separate live-test authorization. Existing offline ownership tests are not a substitute. R1 PASS display blocked on the original artifact and validation above.
- NOT TESTED: full V-19 visual/accessibility matrix on every primary page at 375/768/1280, all drawer focus paths, all tab keys, hidden-tab/page-close recovery, actual browsers blocking site storage. T-P0-11 therefore remains partially verified. T-P1-08 secondary refinements remain deferred; no P2 work attempted.
- Claude Local next: independent browser/visual QA of the listed remaining checks, then owner-configured OAuth/backend acceptance. Account-save configuration 503 still uses its existing generic unavailable copy; improve only if needed after auth setup. No further broad redesign is needed for these fixes.
- Branch and HEAD preserved as requested. Everything remains uncommitted; no staging, commit, push, merge, PR, install, schema/RLS, workflow, frozen R1/R2, STATE/LOG or credential-file changes. The unrelated fx-wPC4q4 directory was not inspected or changed.
