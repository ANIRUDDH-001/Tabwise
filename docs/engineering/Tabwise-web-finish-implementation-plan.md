# Tabwise web finish — implementation plan

Status: PLAN ONLY. Not yet approved for execution, publication or handoff.
Prepared: 2026-10-30T19:28:33Z (`date -u`) by Claude (planning session, no code changed).
Branch: `feat/tabwise-web-e2e-finish` · Baseline: `063e789f2b0429105b73dc624bb96c77a660ba70` (MEASURED: `git rev-parse HEAD` at preparation time).
Scope: `web/**` only, plus owner-approved Vercel/Supabase configuration listed in §E.

Evidence labels: **MEASURED** (observed in a command or browser), **CONN** (read via Vercel/Supabase connector), **INF** (inference — verify before relying on it).

Git actions: every merge, commit, push, deploy or branch operation mentioned in this document is performed by the owner or an owner-authorized developer — never by a Claude agent.

## Revision summary

| ID | Change | Sections touched |
|---|---|---|
| REV-01 | New P0 task T-P0-10: validate the later R1 PASS run `r1-20261028T153344Z` and, only if valid, make it the principal screen-reader demonstration; keep the failed run `r1-20261028T134638Z` as a labelled diagnostic example; truthful fallback otherwise | A.3, A.4, B (T-P0-10), C.2, F (V-18), G |
| REV-02 | Essential visual finishing moved into P0 as T-P0-11 (layout, hierarchy, consistent components, readable evidence/report surfaces, 375/768/1280 acceptance). T-P1-08 now covers only non-essential refinements | A.1, B (T-P0-11, T-P1-08), C.4, F (V-19), G |
| REV-03 | T-P0-06: debounced saves plus synchronous flush on `visibilitychange`/`pagehide`; immediate-reload test; truthful storage-failure state; validation of restored drafts and legacy `tabwise-version:*` records; no cross-journey restore or destructive migration; unsaved work preserved during version switching | B (T-P0-06), F (V-08, V-09, V-16, V-17) |
| REV-04 | T-P0-07/T-P0-09: real check of PKCE and session cookie survival across redirects and refresh; safe cookie attributes; unauthorized and cross-user API tests separate from database RLS tests; no test-user creation or privilege change without approval; BLOCKED/NOT TESTED instead of PASS when not performed | B (T-P0-07, T-P0-09), D.2, F (V-P4, V-P6, V-P8, V-P9) |
| REV-05 | Navigation acceptance is per region: one appropriate active item per region (top nav, sidebar, drawer, breadcrumbs) where the route is represented; no requirement of a single global `aria-current` | B (T-P0-01, T-P0-02), C.3, F (V-03, V-04) |

---

## A. Objective and current baseline

### A.1 Product goal and delivery constraints

Make https://tabwise-meta.vercel.app/ a polished, truthful product for the hackathon demo:

- **P0** — a fully functional public demo, unified navigation, responsive shell, local draft persistence, local version discovery, truthful feature states, and the existing authenticated workspace workflow wherever it is properly configured.
  P0 also includes essential visual finishing (REV-02): coherent layout and page hierarchy; consistent navigation, buttons, panels, status indicators and spacing; professional desktop and mobile presentation; meaningful interactive feedback; readable evidence and report surfaces; no visually unfinished or disconnected primary screens. P0 also presents R1 evidence accurately (REV-01).
- **P1** — comprehensive product polish beyond the essentials: keyboard accessibility, page metadata, breadcrumbs, error handling, report navigation, and non-essential visual refinements.
- **P2** — optional enhancements, only after P0 and P1 are verified.

Rules that bind every task:

- Preserve the current Tabwise theme and visual identity (tokens in `web/app/globals.css`). Improve the whole experience, not only CSS.
- Unified navigation with explicit **Demo** and **Your workspace** boundaries. Every CTA either works or truthfully explains why it is unavailable.
- NVDA execution, R2 qualification, worker dispatch, Spark/Meta calls, patch execution and verification stay behind their existing approval gates. No task may bypass `BLOCK` qualification, approval references, budget checks or review gates.
- A smaller P0 that fully works beats a larger incomplete product.
- ₹0 cost ceiling. No new dependencies, no lockfile changes, no `.claude/` changes.
- Frozen R1, vendored Guidepup, the R2 execution boundary, `STATE.md` and `LOG.jsonl` are out of scope and must not be edited.

Key dates (IST): feature freeze 2026-11-02 23:59 · demo recording 2026-11-03 · internal submit 2026-11-04 22:00 · hard deadline 2026-11-05 07:30.

### A.2 Production baseline

| Item | Value | Label |
|---|---|---|
| Production URL | https://tabwise-meta.vercel.app/ | MEASURED |
| Deployment | `dpl_8F9nPkeZUhhv4SzFU19bZ4cDTq14`, READY, from `main` `063e789`, region `iad1` | CONN |
| Other aliases | `tabwise-seven.vercel.app`, `tabwise-algominds-projects-68a5e35a.vercel.app` | CONN |
| Vercel project / team | `prj_UDiv7hsFzi7fpun4eMhCOT8DsW0R` / `team_dKCxOthHp76gtaT5JaK6BIFE` (scope `algominds-projects-68a5e35a`) | CONN |
| Every `/api/*` route | `503 {"reason":"sign_in_configuration_pending"}` | MEASURED |
| `/auth/login` | raw JSON `503 github_oauth_provider_pending` | MEASURED |
| Cause | `NEXT_PUBLIC_SUPABASE_URL` and/or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` absent in Production; `TABWISE_OAUTH_CONFIGURED` unset | INF |
| Supabase project | `ueobjrtvsgvkigmjxkks`, ACTIVE_HEALTHY, ap-south-1 | CONN |
| Supabase schema | 5 migrations, matching `supabase/migrations/`; 19 public tables, RLS enabled on all | CONN |
| Supabase data | 0 auth users, 0 identities, 0 operators, 0 runs, 0 journey versions; 3 journeys seeded `supported=true` | CONN |
| `system_flags` | `dispatch_mode=owner_only`, `diagnosis_mode=off`, `worker_review_verdict=PENDING`, `qualification_ref=null`, `public_daily_dispatch_limit=5` | CONN |
| Storage | bucket `tabwise-evidence`, private, 4 MB limit | CONN |
| Web tests | `npm --prefix web test` → 55/55 pass | MEASURED |

Stack (MEASURED from `web/package.json`): Next.js 16.4.3 (App Router), React 19.3.1, TypeScript 7.0.2, Tailwind 4.3.3 (styling is mostly hand-written in `globals.css`), `@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.118.0, `@tabwise/contracts` (`file:../packages/contracts`). Scripts: `dev` (`next dev --hostname 127.0.0.1`), `build`, `start`, `typecheck` (`tsc --noEmit`), `test` (`node --test test/*.test.mjs`).

### A.3 Existing working functionality (MEASURED in browser on production)

- Landing page, demo workspace `/w/demo`, sample app `/apps/fernway` with the Fernway fixture iframe (`/fernway?flow=passenger&variant=broken`, strict CSP).
- Journey editor `/journeys/{id}/edit`: key recording via `postMessage` from the iframe, step reorder, local save to `localStorage` (`tabwise-journey:{id}`), and reload of the saved draft.
- Static R1 trace `/runs/r1-20261028T134638Z` (Timeline / Findings / Fix / Verify tabs) and public report `/r/r1-diagnostic`.
- All static routes render; `/status` renders hard-coded rows.

**R1 evidence in the UI (REV-01).** The public UI is wired to `web/data/r1.json` (imported by `web/app/page.tsx`, `web/app/w/demo/page.tsx`, `web/app/runs/[id]/page.tsx`, `web/app/r/[slug]/page.tsx`, `web/components/RunDetail.tsx`; referenced by `web/lib/snapshot.mjs` and `web/lib/workspace-navigation.mjs`). It presents the historical **failed** run `r1-20261028T134638Z` as the main trace. The repository ledgers record a later run:

- `docs/ledger/PLAN.md:102` — "F-02 R1 real NVDA speech capture — status: done (R1 PASS r1-20261028T153344Z, D-54; D-53/A15 profile only, not default browse-mode coverage)".
- `docs/ledger/RUNS.md` row `r1-20261028T153344Z` — GitHub Actions run `40716824856` (attempt 1), commit `0c93fa73e0c111a2df65302adfe0006d63f50a39`, decision D-54; scored PASS under the D-53/A15 profile only (`virtualBuffers.enableOnPageLoad=false`); owner-reported 3/3 attempts, 30/30 steps; artifact `r1-evidence-40716824856-1` (id `12829526270`), sha256 `419807699a32e3752f6e6637f275803b9db803c960991f0b4d8ecfe8844fc885`; the row states `summary.json` was **not** inspected by Claude.

These are ledger records (CITED), not independently re-validated evidence. T-P0-10 performs that validation before any UI change.

### A.4 Reproduced defects

| ID | Defect | Where | Label |
|---|---|---|---|
| D1 | Missing Supabase public config in Production; workspace shows misleading "Workspace storage is temporarily unavailable" for a configuration 503 | `lib/workspace-state.mjs` `workspaceMessage()`; Vercel env | MEASURED |
| D2 | "Sign in with GitHub" shows a raw JSON 503 page | `app/auth/login/route.ts` | MEASURED |
| D3 | At ≤740px the top nav and sidebar are both hidden (no navigation at all) and the recorder is hidden with no explanation | `globals.css` media query (line 4) | MEASURED |
| D4 | Local versions are written (`tabwise-version:{sha}`) but never listed anywhere | `components/Recorder.tsx` | MEASURED |
| D5 | Unsaved recorded steps are lost on refresh (recorded 3 Tab steps, reload restored the older saved 6-step draft) | `components/Recorder.tsx` | MEASURED |
| D6 | Owned sidebar uses hash anchors (`/w/me#runs` …) and a hard-coded `active` prop | `lib/workspace-navigation.mjs`, `components/Workspace.tsx` | MEASURED |
| D7 | Top nav has no active state; "Journey editor" link is hard-coded to `fernway-passenger` | `app/layout.tsx` | MEASURED |
| D8 | "Run pending" chips imply runs will happen; the Spark step is shown without its "off" state | `components/JourneyList.tsx`, `app/page.tsx` | MEASURED |
| D9 | Demo report `/r/r1-diagnostic` leaves the shell (no way back); editor sidebar says "Read only" though the editor is editable | `app/r/[slug]/page.tsx`, editor page | MEASURED |
| D10 | Every page has the same `<title>` | `app/layout.tsx` | MEASURED |
| D11 | `role="tab"` without arrow-key handling | `components/RunDetail.tsx` | MEASURED |
| D12 | Raw reason codes shown to users (underscores replaced by spaces) | `components/LiveRun.tsx` and others | MEASURED |
| D13 | `/status` is static; malformed ids do not 404 (`/verifications/[id]`); error page has no navigation back; not-found always links to `/w/demo` | `app/status`, `app/verifications/[id]`, `app/error.tsx`, `app/not-found.tsx` | MEASURED |
| D14 | The UI presents only the failed R1 run as the screen-reader result, although a later R1 PASS run is recorded in the ledgers (REV-01) | `web/data/r1.json` and its importers | CITED (`docs/ledger/PLAN.md:102`, `docs/ledger/RUNS.md`) |

### A.5 Feature classification

| Feature | Class | Why |
|---|---|---|
| Live worker runs (`POST /api/runs`) | **Policy-blocked** — keep | `TABWISE_EXECUTION_APPROVAL_REF` unset; `worker_review_verdict=PENDING`; `dispatch_mode=owner_only` |
| Spark diagnosis (`POST /api/runs/[id]/diagnose`) | **Policy-blocked** — keep | `diagnosis_mode=off`; `TABWISE_META_APPROVAL_REF`/`MODEL_API_KEY` deliberately unset |
| Patch execution, verification runs, NVDA | **Policy-blocked** — keep | Review gates |
| Ops limits / kill switch | **Policy-blocked** — keep | `requireOperator`; 0 operators; no operator row is to be created |
| GitHub sign-in | **Configuration-blocked** | Provider not configured; `TABWISE_OAUTH_CONFIGURED` unset |
| Account save / workspace / saved versions / run history / stored reports | **Configuration-blocked** | Supabase env missing in Production |
| Navigation, mobile, draft loss, local versions, misleading copy, titles, keyboard tabs, 404s | **Broken** — fix in code | D3–D13 |

### A.6 Relevant source and test coverage

Routes (all under `web/app/`):

| Route | File | Renders |
|---|---|---|
| `/` | `page.tsx` | Hero quoting R1, flow strip, `JourneyList` |
| `/w/demo` | `w/demo/page.tsx` | Notice, Fernway banner, `JourneyList`, R1 evidence table |
| `/w/me` | `w/me/page.tsx` | `<Workspace owned><OwnedWorkspace/></Workspace>` |
| `/w/me/ops` | `w/me/ops/page.tsx` | `Ops` inside a **non-owned** `Workspace` (inconsistent) |
| `/apps/fernway` | `apps/fernway/page.tsx` | `JourneyList` + iframe |
| `/fernway` | `fernway/route.ts` | Serves `../fixtures/fernway/index.html` with strict CSP |
| `/journeys/[id]/edit` | `journeys/[id]/edit/page.tsx` | `Recorder`; `generateStaticParams` over journeys |
| `/journeys/versions/[id]` | `journeys/versions/[id]/page.tsx` | `SavedJourneyVersion` |
| `/runs/[id]` | `runs/[id]/page.tsx` | R1 id → static `RunDetail`; UUID → `LiveRun`; else `notFound()` |
| `/runs/[id]/report` | `runs/[id]/report/page.tsx` | `StoredDiagnosticReport` |
| `/r/[slug]` | `r/[slug]/page.tsx` | Only `r1-diagnostic`; outside the shell |
| `/patches/[id]` | `patches/[id]/page.tsx` | `PatchReview` (UUID-checked) |
| `/verifications/[id]` | `verifications/[id]/page.tsx` | `VerificationPanel` (no id check) |
| `/status` | `status/page.tsx` | Hard-coded rows |
| `/auth/login`, `/auth/callback` | `auth/*/route.ts` | OAuth start / code exchange |

Journeys (`web/lib/journeys.ts`): `fernway-passenger` (flow `passenger`), `fernway-seat`, `fernway-search`.

Existing tests (`web/test/`, MEASURED): `account-save`, `artifact-zip`, `d65-cleanup`, `diagnostic-ingest`, `diagnostic-report`, `evidence-view`, `finding-references`, `ingest`, `jobs`, `journey-version`, `reconcile-completion`, `reconcile`, `report-view`, `review-identity`, `run-record`, `run-review-view`, `server`, `snapshot-coverage`, `snapshot-forgery`, `snapshot`, `stored-evidence`, `verification-presentation`, `workspace-data`, `workspace-navigation`, `workspace-states` (25 files, 55 tests). Tests are plain `node --test` over `.mjs` modules, so new testable logic must live in `web/lib/*.mjs` (pure functions), with components as thin consumers.

---

## B. Implementation tasks

Conventions for every task:

- Testable logic goes in `web/lib/*.mjs` with `node --test` coverage in `web/test/*.test.mjs`. Components stay thin.
- No new dependencies. No changes outside `web/**` except where the task says so.
- Do not change the behaviour, gates or response contracts of `web/app/api/**` unless the task says so explicitly (only T-P0-07 touches `web/app/auth/**`).
- "Done" always means: listed tests pass, `npm --prefix web run typecheck` passes, `npm --prefix web run build` passes, and the acceptance checks pass in the stated environment.

### P0 tasks

#### T-P0-01 — Navigation model and active state (D6, D7)

- **Priority:** P0 · **Depends on:** none · **Start here.**
- **Files:** modify `web/lib/workspace-navigation.mjs`, `web/test/workspace-navigation.test.mjs`; create `web/lib/site-navigation.mjs`, `web/test/site-navigation.test.mjs`.
- **Current behaviour:** `workspaceNavigation(owned)` returns hash anchors for the owned workspace; `active` is passed as a hard-coded prop per page; the top nav has no model at all.
- **Changes:**
  - `site-navigation.mjs` exports `primaryNavigation()` → groups `Demo` (`/w/demo`, `/apps/fernway`, `/journeys` picker, `/runs/r1-20261028T134638Z`, `/r/r1-diagnostic`) and `Your workspace` (`/w/me`, `/w/me/journeys`, `/w/me/runs`, `/w/me/reports`), plus `Status` (`/status`).
  - `isActive(href, pathname)` — exact match for roots (`/`, `/w/me`, `/w/demo`), prefix match on path segments otherwise (`/w/me/runs` is active for `/w/me/runs`, not for `/w/me`). Never matches on query or hash.
  - `sectionFor(pathname)` → `"demo" | "workspace" | "status" | "public"`; `/runs/<UUID>`, `/runs/<UUID>/report`, `/patches/*`, `/verifications/*`, `/journeys/versions/*` map to `"workspace"`; `/runs/r1-…`, `/r/*`, `/apps/*`, `/journeys/*/edit`, `/journeys` map to `"demo"`.
  - `breadcrumbsFor(pathname, labels?)` → ordered `{href,label}` list (consumed by T-P1-05).
  - Replace hash anchors in `workspaceNavigation(true)` with the real routes from T-P0-03.
- **Expected behaviour:** a single source of truth for every nav surface.
- **Security / a11y:** pure functions; no user data.
- **Regression tests:** table-driven tests for every route in A.6 (active item per region, section, no hash links remain in the owned nav, no two sibling links active in the same list).
- **Acceptance (REV-05):** `workspaceNavigation(true)` contains no `#`; every route in A.6 maps to exactly one section; within each navigation list (top nav, sidebar, drawer) at most one item is active, and exactly one when the current route is represented in that list; the active group is correct; breadcrumbs from `breadcrumbsFor()` are correct. There is **no** requirement that the whole page has a single `aria-current` element.
- **Done:** tests green; old `workspace-navigation` tests updated to the new routes without deleting their intent.

#### T-P0-02 — Unified responsive shell and mobile navigation (D3, D7)

- **Priority:** P0 · **Depends on:** T-P0-01.
- **Files:** modify `web/app/layout.tsx`, `web/components/Workspace.tsx`, `web/app/globals.css`; create `web/components/TopNav.tsx` (client component).
- **Current behaviour:** top nav links are static; at ≤740px `.topbar nav` and `.sidebar` are `display:none`, leaving no navigation.
- **Changes:**
  - `TopNav` uses `usePathname()` with `isActive`/`sectionFor`; renders the `Demo` and `Your workspace` groups with a visible boundary, sets `aria-current="page"` on the active link, and highlights the active group.
  - "Journey editor" becomes "Journeys" → `/journeys` (picker from T-P0-05), not a hard-coded journey.
  - Mobile (≤740px): a "Menu" button (`aria-expanded`, `aria-controls`) opens a drawer containing the top-level groups **and** the current section's sidebar items. Escape and the close button dismiss it; focus moves into the drawer on open and returns to the Menu button on close; the drawer closes on route change. Implement with existing CSS + a small state hook (no library).
  - `Workspace` derives `active` from the pathname (drop the hard-coded prop or ignore it). Sidebar stays visible ≥741px.
  - Remove the `display:none` on navigation in the 740px query; keep the reduced-motion and print rules.
- **Expected UI:** at 375px every page shows the brand, the Menu button and the current page title; at 1280px the full top nav and sidebar are visible with active states.
- **Security / a11y:** skip-to-content link stays first focusable; drawer is a `nav` landmark with a label; touch targets ≥44px on mobile; visible focus rings.
- **Regression tests:** covered by T-P0-01 logic tests; browser checks V-03/V-04 in §F.
- **Acceptance (REV-05):** at 375×812, 768×1024 and 1280×800, from every route in A.6 the user can reach Demo, Your workspace and Status in ≤2 interactions. In each navigation region (top nav, sidebar, mobile drawer, breadcrumbs) the current route is marked `aria-current="page"` once if it appears in that region; no sibling links in the same region are both active; the active group highlight matches `sectionFor(pathname)`. Several regions may each carry their own `aria-current`.
- **Done:** typecheck/build pass; V-03 and V-04 PASS.

#### T-P0-03 — Real workspace routes (D6)

- **Priority:** P0 · **Depends on:** T-P0-01.
- **Files:** modify `web/components/OwnedWorkspace.tsx`, `web/app/w/me/page.tsx`, `web/app/w/me/ops/page.tsx`, `web/components/SavedJourneyVersion.tsx`; create `web/app/w/me/journeys/page.tsx`, `web/app/w/me/runs/page.tsx`, `web/app/w/me/reports/page.tsx`.
- **Current behaviour:** one long `OwnedWorkspace` page fetching `/api/workspace`, navigated with hash anchors; ops renders inside the non-owned shell; `SavedJourneyVersion` back link is `/w/me#journeys`.
- **Changes:**
  - Split `OwnedWorkspace` into `section` variants (`overview`, `journeys`, `runs`, `reports`) sharing one fetch/state helper. `/w/me` shows an overview (counts + latest three items per section + next action).
  - Each new page renders `<Workspace owned>` with its section.
  - `/w/me/ops` uses `<Workspace owned>`; its gating is unchanged (operator check is server-side).
  - Back links point to `/w/me/journeys` etc.
- **Expected API use:** unchanged — `GET /api/workspace` only.
- **Security:** no new data exposure; all data still comes through the existing route and RLS/service-role logic.
- **Regression tests:** extend `workspace-data.test.mjs` for any helper that partitions the payload by section.
- **Acceptance:** refreshing `/w/me/runs` lands on runs with "Runs" active; no `#` URLs in the workspace.
- **Done:** tests/typecheck/build pass; V-05 PASS.

#### T-P0-04 — Truthful configuration, auth and outage states (D1)

- **Priority:** P0 · **Depends on:** none (parallel with T-P0-01).
- **Files:** modify `web/lib/workspace-state.mjs`, `web/test/workspace-states.test.mjs`, `web/components/OwnedWorkspace.tsx`, `web/components/SavedJourneyVersion.tsx`; create `web/lib/reason-copy.mjs`, `web/test/reason-copy.test.mjs`.
- **Current behaviour:** `workspaceMessage(status)` maps any 503 to "Workspace storage is temporarily unavailable…".
- **Changes:**
  - `workspaceMessage(status, reason)` distinguishes:
    - `503 sign_in_configuration_pending` / `server_configuration_pending` → "Sign-in isn't set up on this deployment yet. You can still use the demo." CTAs: Open demo, View status. **No** "Sign in" button.
    - `401` → "Sign in to see your workspace." CTA: Sign in with GitHub (`/auth/login`), Open demo.
    - other `5xx` / network → "We couldn't reach your workspace. Try again." CTA: Try again.
  - `reason-copy.mjs` exports `reasonText(code)` (human copy for every reason code emitted by `web/app/api/**` and `web/app/auth/**`) with a safe fallback ("Something went wrong (code: …)"). Shared with T-P1-04.
- **Expected UI:** with Production as it is today, `/w/me` says sign-in is not set up, not "storage unavailable".
- **Security:** never surface stack traces or env names in UI copy.
- **Regression tests:** every branch above; every reason code found by `grep -ho "reason:'[a-z_]*'" web/app web/lib -r` (or equivalent) has copy.
- **Acceptance:** unit tests cover 503-config, 401, 500, network failure; copy contains no underscores.
- **Done:** tests pass; V-06 PASS.

#### T-P0-05 — Journey picker route

- **Priority:** P0 · **Depends on:** T-P0-01.
- **Files:** create `web/app/journeys/page.tsx`; modify `web/components/JourneyList.tsx` (shared with T-P0-08).
- **Changes:** `/journeys` lists the three journeys from `web/lib/journeys.ts` with name, flow, step count of the local draft if one exists (client-side badge "Unsaved draft" / "N local versions"), and an "Open editor" link.
- **Acceptance:** `/journeys` lists 3 journeys and each opens its editor; the top nav "Journeys" link is active on `/journeys` and `/journeys/*/edit`.
- **Done:** typecheck/build pass; V-07 PASS.

#### T-P0-06 — Editor draft autosave, local versions, mobile notice (D4, D5, D9 part)

- **Priority:** P0 · **Depends on:** none for the library; T-P0-02 for the mobile notice styling.
- **Files:** create `web/lib/local-drafts.mjs`, `web/test/local-drafts.test.mjs`; modify `web/components/Recorder.tsx`, `web/app/journeys/[id]/edit/page.tsx`, `web/app/globals.css`.
- **Current behaviour:** `Recorder` loads `tabwise-journey:{id}` on mount; saving writes it and `tabwise-version:{sha}`; recorded-but-unsaved steps vanish on reload; versions are never listed; the editor is hidden at ≤740px.
- **Changes (`local-drafts.mjs`, pure, storage injected for testing):**
  - `draftKey(id)` = `tabwise-draft:{id}`; `saveDraft(storage, id, steps, now)` writes `{journeyId, steps, updatedAt, schema: 1}` and returns `{ok:true}` or `{ok:false, reason}` (quota, denied, unavailable) — it never throws; `readDraft`; `clearDraft`.
  - `validateSteps(journeyId, steps, rules)` (REV-03): rejects the record unless `journeyId` matches the editor's journey, every step uses a key in the editor's supported key set and palette (read the existing constants in `Recorder.tsx`; move them into `local-drafts.mjs` or a sibling `.mjs` so both the component and tests use one definition), and the step count is within the editor's existing step limit. Returns `{ok, reason}`.
  - `versionIndexKey(id)` = `tabwise-versions:{id}` holding `[{sha, savedAt, stepCount}]`, newest first, de-duplicated by sha, capped at 50 entries. `recordVersion(storage, id, entry)`; `listVersions(storage, id)`.
  - `legacyVersions(storage, journeyId, rules)` — scans existing `tabwise-version:*` keys read-only. A legacy record is listed only if it parses, belongs to `journeyId`, passes `validateSteps`, and its stored digest/sha matches the recomputed digest where the record carries one. Invalid records are skipped (counted, not shown as versions) and **never** deleted, rewritten or adopted into the new index.
  - All functions tolerate a throwing or `null` storage (private mode) and corrupt JSON (treat as absent).
- **Changes (`Recorder`):**
  - Autosave (REV-03): debounced (~500 ms) save after each change, **plus** a synchronous `saveDraft` flush of the current steps on `visibilitychange` (when `document.visibilityState === 'hidden'`) and on `pagehide`, where the browser supports them. Also flush synchronously immediately after each recorded step is appended, so an immediate reload after a recording action keeps that step.
  - On mount: read the draft; if it fails `validateSteps` for this journey it is ignored (never restored into a different journey) and the user sees "A saved draft couldn't be restored." If valid and different from the saved journey (`tabwise-journey:{id}`), show an inline banner "You have unsaved steps from {relative time}." with **Restore** and **Discard**. Do not auto-apply.
  - On local save: write `tabwise-journey:{id}` and `tabwise-version:{sha}` exactly as today, then `recordVersion` and `clearDraft`.
  - "Local versions" panel listing `listVersions` (+ validated legacy) with timestamp, step count, short sha, and "Load into editor". Loading a version when unsaved steps exist first keeps those steps as the current draft (already persisted by autosave) and asks for confirmation; the user can return to the draft via the restore banner. Switching versions never discards unsaved work silently.
  - Status line with `aria-live="polite"`: "Draft saved locally", "Saved as version {sha7}", and, whenever `saveDraft` returns `ok:false`, a persistent warning "Your browser isn't letting Tabwise save drafts. Unsaved steps will be lost on reload." (truthful failure state).
  - Copy and docs must not promise persistence after a browser crash, storage denial, private-mode eviction or other failures the page cannot prevent.
  - Fix the editor sidebar "Read only" label (D9) to reflect the actual mode.
  - ≤740px: show a notice card "Recording needs a wider screen (at least 741 px). Your drafts and versions are listed below." and still render the read-only versions list.
- **Account save:** unchanged logic (`saveJourneyToAccount` in `web/lib/account-save.mjs` → `POST /api/journeys`); only the button state/copy uses `reasonText` (T-P0-04) and shows "Sign in to save to your account" when the API answers 401, or "Account saving isn't set up on this deployment" for config 503.
- **Security:** drafts contain only recorded key names and journey ids; nothing sensitive. No network calls for local features.
- **Regression tests:** debounce-independent unit tests for the library: save/read/clear; `saveDraft` returning `ok:false` on a throwing/quota storage; index ordering, dedupe, cap; `validateSteps` rejecting wrong journey id, unsupported key, out-of-palette step, over-limit length; legacy scan accepting a valid record and skipping invalid/foreign/corrupt ones without mutating storage; draft for journey A never returned for journey B; immediate-flush path (simulate "append step → flush → new reader" with no timer elapsed). Keep `account-save.test.mjs` passing unchanged.
- **Acceptance:** record 3 steps → reload immediately (no wait) → Restore brings back exactly those 3 steps; record 1 step → switch tab → close/reopen → step restorable where `pagehide`/`visibilitychange` fire; save twice → panel lists 2 versions newest first; valid legacy `tabwise-version:*` keys appear and invalid ones do not; with storage blocked the warning is shown; loading a version with unsaved steps keeps those steps restorable; at 375px the notice and versions list render.
- **Done:** tests pass; V-08, V-09, V-10, V-16, V-17 PASS.

#### T-P0-07 — Auth entry, unavailable page and cookie persistence (D2)

- **Priority:** P0 · **Depends on:** T-P0-04 (copy).
- **Files:** modify `web/app/auth/login/route.ts`, `web/app/auth/callback/route.ts`; create `web/app/auth/unavailable/page.tsx`, `web/lib/auth-redirect.mjs`, `web/test/auth-redirect.test.mjs`.
- **Current behaviour:** login returns `503` JSON when `TABWISE_OAUTH_CONFIGURED` is unset; otherwise `signInWithOAuth({provider:'github', options:{redirectTo:`${origin}/auth/callback`}})` and `303`. Callback: `exchangeCodeForSession(code)` → `303 /w/me`; errors `400 oauth_code_missing`, `401 oauth_exchange_failed` as JSON.
- **Changes:**
  - Login, when OAuth or Supabase config is missing → `303` to `/auth/unavailable?reason=github_oauth_provider_pending` (or `sign_in_configuration_pending`). Never JSON for a browser navigation.
  - Callback errors → `303` to `/auth/unavailable?reason=<code>`.
  - `/auth/unavailable` renders inside the shell: human copy from `reasonText`, links to Demo and Status. Only whitelisted reason codes are rendered (`auth-redirect.mjs` `safeReason()`); anything else becomes a generic message (prevents reflected content).
  - **Cookie persistence (INF — must be verified, REV-04):** `sessionClient()` sets cookies through the route-handler cookie store. Verify with a real check (not by reading code) that (a) the `/auth/login` `303` response carries the PKCE code-verifier cookie (`Set-Cookie` with the `sb-…-auth-token-code-verifier` name pattern), (b) the `/auth/callback` `303` response carries the session cookie(s), and (c) after landing on `/w/me` a page refresh still yields an authenticated `GET /api/workspace` (`200`). If `Response.redirect()` drops cookies, build the redirect with `NextResponse.redirect(url, 303)` and copy every cookie written by the Supabase client onto that response.
  - Cookie attributes: `HttpOnly` where the library sets it, `Secure` on HTTPS deployments, `SameSite=Lax`, `Path=/`; no auth cookie readable by page scripts beyond what `@supabase/ssr` requires.
  - The OAuth `code`, access token and refresh token are never rendered, logged, put into another URL, or included in `/auth/unavailable` reasons. After the callback the browser URL no longer contains `code`.
  - Optional `next` parameter is **not** added (avoids open-redirect risk); callback always lands on `/w/me`.
- **Not changed:** `requireUser`, `requireOperator`, `assertProject`, origin checks in `endpoint()`, RLS, policies, grants.
- **Security:** no open redirect; redirect target derived only from request origin; reason whitelist; no token or code echoed into pages or logs.
- **Regression tests:** `safeReason` whitelist; URL builder for unavailable page; a helper that copies cookies onto the redirect response (unit-tested with a fake cookie list if introduced); extend `server.test.mjs` only if existing helpers make the route unit-testable without network.
- **Acceptance:** with `TABWISE_OAUTH_CONFIGURED` empty, clicking "Sign in with GitHub" shows the HTML unavailable page (status 200 page after a 303). With the provider configured (Production, after §E), V-P3 and V-P4 pass: verifier cookie present on login redirect, session cookies present on callback redirect with safe attributes, `/w/me` authenticated after refresh, no `code` left in the URL.
- **Done:** V-11, V-13 PASS locally; V-P3/V-P4 PASS in Production after owner gates, otherwise recorded as BLOCKED/NOT TESTED (never PASS).

#### T-P0-08 — Honest pipeline and gated CTAs (D8)

- **Priority:** P0 · **Depends on:** T-P0-04 (copy), T-P0-05 (shares `JourneyList`).
- **Files:** modify `web/components/JourneyList.tsx`, `web/app/page.tsx`, `web/app/w/demo/page.tsx`; create `web/lib/feature-states.mjs`, `web/test/feature-states.test.mjs`.
- **Changes:**
  - Remove "Run pending" chips.
  - `feature-states.mjs` defines the canonical list: Recording (available), Account save (depends on configuration), Live runs (gated: worker review pending), Spark diagnosis (off on this deployment), Patch verification (gated). Each has `state`, `label`, one-line `reason`, and `href` (`/status`).
  - The flow strip (Record → Capture → Diagnose with Spark → Review & rerun) shows each step's state chip from this list.
  - Any control for a gated feature renders as a disabled button with `aria-disabled="true"` and adjacent visible reason text (not tooltip-only).
- **Security:** purely presentational; no gate is loosened; no new API calls.
- **Acceptance:** no chip says "pending" for a feature that cannot run; every gated control shows its reason and links to `/status`.
- **Done:** tests pass; V-12 PASS.

#### T-P0-09 — Authenticated save and view, end to end

- **Priority:** P0 · **Depends on:** T-P0-03, T-P0-06, T-P0-07; owner gates G1–G6 (§E).
- **Files:** none beyond the above, unless verification uncovers a defect (fix in the owning task's files).
- **Flow:** `/auth/login` → GitHub → `/auth/callback` → `/w/me` → editor → "Save to account" (`POST /api/journeys`) → `/w/me/journeys` lists it → `/journeys/versions/{id}` (`GET /api/journeys/versions/{id}`) shows the immutable version with matching digest.
- **Acceptance:** after the owner's sign-in in Production, `journey_versions` has one row whose `user_id` equals the owner's `auth.users.id`; the UI shows the version with its digest; runs/reports show truthful empty states.
- **Authorization checks (REV-04) — API and RLS are tested separately; neither substitutes for the other:**
  - **API, unauthenticated:** `GET /api/workspace`, `GET /api/journeys/versions/{id}` and `POST /api/journeys` without a session → `401` (POST also fails same-origin checks from another origin); no row data in the body. (V-P8)
  - **API, cross-user:** a second authenticated identity requesting the owner's `/api/journeys/versions/{id}` → `403`/`404`, no row data; that identity's `/api/workspace` lists none of the owner's versions. Requires a second **owner-authorized** test account; if none is authorized, record BLOCKED. The API reads with the service role, so this check verifies the route's own ownership filter, not RLS. (V-P9)
  - **Database RLS:** a rolled-back transaction with `set local role authenticated` and simulated JWT claims for a different `sub` returns 0 of the owner's `journey_versions` rows; the same query with the owner's `sub` returns the row (proves the simulation is effective). (V-P6)
  - No production test-user creation, operator promotion, policy modification or privilege change for these checks without separate owner approval.
- **Done:** V-P4, V-P5, V-P6, V-P8 PASS and V-P9 PASS or BLOCKED (with reason). Any check not actually performed is recorded as BLOCKED or NOT TESTED, never PASS. If the owner gates are not complete by 2026-11-02 12:00 IST, mark BLOCKED and ship the truthful unavailable states (T-P0-04/T-P0-07).

#### T-P0-10 — Accurate R1 evidence presentation (REV-01, D14)

- **Priority:** P0 · **Depends on:** none for validation (step 1 can start immediately); UI changes depend on T-P0-11 component contracts.
- **Files:** read-only inputs `docs/ledger/PLAN.md`, `docs/ledger/RUNS.md`, `docs/ledger/DECISIONS.md` (D-53, D-54), `docs/evidence/**` if present, the R1 artifact `r1-evidence-40716824856-1` (owner-provided download if not in the repo); modify `web/data/` (add a separate data file for the PASS run, e.g. `web/data/r1-pass.json`, keeping `web/data/r1.json` for the failed run), `web/lib/snapshot.mjs`, `web/app/page.tsx`, `web/app/w/demo/page.tsx`, `web/app/runs/[id]/page.tsx`, `web/app/r/[slug]/page.tsx`, `web/components/RunDetail.tsx`, `web/lib/workspace-navigation.mjs` / `web/lib/site-navigation.mjs` (demo links), and the matching tests (`web/test/snapshot*.test.mjs`, `report-view.test.mjs`, `evidence-view.test.mjs`, plus a new `web/test/r1-evidence.test.mjs`). Never modify anything under `docs/evidence/` or the R1 workflow.
- **Current behaviour:** homepage, demo, trace and report present only the failed run `r1-20261028T134638Z`.
- **Step 1 — validate (blocks every UI change):**
  - Locate the PASS evidence for `r1-20261028T153344Z`: the artifact `r1-evidence-40716824856-1` (or a committed copy) and its `summary.json`.
  - Check integrity: recompute sha256 of the artifact zip and compare with `419807699a32e3752f6e6637f275803b9db803c960991f0b4d8ecfe8844fc885` (RUNS.md).
  - Check provenance: run id `40716824856`, commit `0c93fa73e0c111a2df65302adfe0006d63f50a39`, workflow `.github/workflows/r1.yml`, decision D-54, matches the ledgers.
  - Check scope: PASS is under the D-53/A15 profile only (`virtualBuffers.enableOnPageLoad=false`), not default browse-mode coverage; record attempts/steps from `summary.json` itself, not from the ledger's owner-reported summary.
  - Check disclosure suitability: the artifact contains only fixture-page speech and no secrets, tokens, personal data or machine identifiers that should not be public; redact nothing silently — if something is unsuitable, stop and report.
  - Record the validation result (MEASURED with commands, or BLOCKED with reason) in the PR/commit description prepared for the owner. Do not change existing evidence classifications in any ledger.
- **Step 2a — if validated:** add the PASS run as the principal successful screen-reader demonstration on the homepage and demo (hero quote, link to its trace), using only fields present in the validated artifact. Keep the failed run reachable as a separate, clearly labelled "Diagnostic example: failed R1 run" with its own trace and report. Each R1 surface shows a scope note: "Measured with NVDA under the A15 profile (browse mode off on page load). This shows real screen-reader speech capture; it does not prove R2 causal diagnosis, Fernway findings, Spark output or patch verification."
- **Step 2b — if not validated or incomplete:** keep the failed run as the main trace, label it accurately as a failed run, and state "A later R1 run is recorded as PASS in the project ledger but its evidence has not been validated for display." Never create a success view from ledger text alone.
- **Rules:** never substitute one run id for another; never edit a run's data to change its outcome; never present R1 as evidence of R2/Spark/patch results.
- **Security / a11y:** public data only; scope note is visible text, not a tooltip.
- **Regression tests:** `r1-evidence.test.mjs` asserts each displayed run id, outcome and scope label comes from its own data file; the failed run is still labelled failed; the PASS view (if present) cannot render without its validated data file; updated snapshot/report tests.
- **Acceptance:** every displayed R1 claim (run id, outcome, attempt/step counts, profile, commit) matches its validated artifact or ledger source; the limitation statement is present on homepage, demo, trace and report; V-18 PASS.
- **Done:** Step 1 result recorded; Step 2a or 2b implemented; tests pass.

#### T-P0-11 — Essential product polish (REV-02)

- **Priority:** P0 · **Depends on:** T-P0-02 (shell). Other P0 UI tasks consume its components.
- **Files:** `web/app/globals.css` (owner of shared styles); create `web/components/ui/PageHeader.tsx`, `web/components/ui/StatusChip.tsx`, `web/components/ui/EmptyState.tsx`, `web/components/ui/InlineStatus.tsx`, `web/components/ui/Panel.tsx`; apply them in the primary screens: `app/page.tsx`, `w/demo/page.tsx`, `apps/fernway/page.tsx`, `journeys/page.tsx`, `journeys/[id]/edit/page.tsx`, `w/me/**`, `runs/[id]/page.tsx`, `runs/[id]/report/page.tsx`, `r/[slug]/page.tsx`, `status/page.tsx`, and the components they render (`RunDetail`, `LiveRun`, `OwnedWorkspace`, `SavedJourneyVersion`, `JourneyList`).
- **Changes:** implement the §C.4 contracts using existing theme tokens only (no new UI library, no theme change): one page-header pattern, one button system, one status-chip system, consistent panel spacing, readable evidence/report typography (line length ≤ ~80ch, tables that stack on mobile, monospace only for speech/code), inline save/progress feedback with `aria-live`.
- **Acceptance (browser, at 375×812, 768×1024, 1280×800 on every primary screen):** no horizontal page scroll; one `h1`; page header present; buttons and chips use only the defined variants; touch targets ≥44 px at 375; no overlapping or clipped text; evidence/report text readable without zoom; every interactive save/submit gives visible feedback; no primary screen lacks shell navigation. V-19 PASS.
- **Done:** V-19 PASS; typecheck/build pass.

### P1 tasks

| ID | Task | Files | Changes | Acceptance |
|---|---|---|---|---|
| T-P1-01 | Page metadata (D10) | `web/app/layout.tsx` (title template `%s · Tabwise`), each `page.tsx` (`export const metadata` or `generateMetadata`) | Unique, descriptive titles; dynamic routes use the id/journey name | Every route in A.6 has a distinct title |
| T-P1-02 | Keyboard tabs (D11) | `web/components/RunDetail.tsx`; create `web/lib/tabs.mjs` + test | Roving `tabIndex`, ArrowLeft/Right/Home/End, `aria-selected`, `aria-controls`, tab panels with `tabIndex=0` | Unit test for index math; keyboard-only walk-through works |
| T-P1-03 | Demo report in shell (D9) | `web/app/r/[slug]/page.tsx`, `web/app/runs/[id]/report/page.tsx` | Render inside the demo shell with breadcrumbs back to the R1 trace; keep it public and print-friendly | From `/r/r1-diagnostic` the user can return to the trace and Demo |
| T-P1-04 | Human-readable reasons (D12) | `web/components/LiveRun.tsx`, `PatchReview.tsx`, `VerificationPanel.tsx`, `Ops.tsx` | Use `reasonText()` everywhere a code is shown; keep the raw code in a small "code:" detail for support | No underscores visible in user copy |
| T-P1-05 | Breadcrumbs | create `web/components/Breadcrumbs.tsx`; pages | Uses `breadcrumbsFor()`; `nav[aria-label=Breadcrumb]`, last item `aria-current="page"` | Present on every non-root page; links correct |
| T-P1-06 | 404 for malformed ids (D13) | `verifications/[id]`, `patches/[id]`, `journeys/versions/[id]`, `runs/[id]/report` pages; create `web/lib/ids.mjs` + test | Validate UUID (and the R1 id where applicable) server-side before rendering; `notFound()` otherwise | `/verifications/abc` → 404 page |
| T-P1-07 | Error and not-found pages (D13) | `web/app/error.tsx`, `web/app/not-found.tsx` | Shell navigation, "Try again" (error), links to Demo and Your workspace by section | Both pages offer navigation back |
| T-P1-08 | Non-essential visual refinements (essentials moved to T-P0-11) | `web/app/globals.css`, `web/components/ui/*` | Secondary screens (patch, verification, ops), hover/active micro-states, illustration of empty states, density tuning | No regression of V-19 |
| T-P1-09 | Loading feedback | `OwnedWorkspace.tsx`, `SavedJourneyVersion.tsx`, `LiveRun.tsx` | Skeleton blocks instead of blank space; `aria-busy` on the region | No blank region during fetch |
| T-P1-10 | Patch and verification screens | `PatchReview.tsx`, `VerificationPanel.tsx` | Replace `/verifications/pending` link with a truthful gated state; show review status from existing API data | No link to a non-existent record |

Each P1 task: depends on T-P0-01/T-P0-02 (shell) and T-P0-04 (copy); done = unit tests where logic exists, typecheck/build pass, matching browser check in §F.

### P2 tasks (only after P0 and P1 are verified)

| ID | Task | Files | Notes |
|---|---|---|---|
| T-P2-01 | Config-derived `/status` | `web/app/status/page.tsx`, create `web/lib/status-rows.mjs` + test | Server computes booleans from env **presence** only (never values) plus static policy rows; never reads secrets into the page |
| T-P2-02 | Motion polish | `globals.css` | Short transitions for drawer/tabs, disabled under `prefers-reduced-motion` |
| T-P2-03 | Region alignment | Vercel project setting | Move functions to `bom1` near Supabase ap-south-1; separate production authorization |

---

## C. Navigation and UX specification

### C.1 Information architecture

```
Tabwise (brand → /)
├── Demo                                  [public, no account]
│   ├── Demo workspace        /w/demo
│   ├── Sample app (Fernway)  /apps/fernway
│   ├── Journeys              /journeys  → /journeys/{id}/edit
│   ├── R1 trace              /runs/r1-20261028T134638Z
│   └── R1 report             /r/r1-diagnostic
├── Your workspace                        [GitHub sign-in]
│   ├── Overview              /w/me
│   ├── Saved journeys        /w/me/journeys  → /journeys/versions/{uuid}
│   ├── Runs                  /w/me/runs      → /runs/{uuid} → /runs/{uuid}/report
│   │                                          → /patches/{uuid} → /verifications/{uuid}
│   ├── Reports               /w/me/reports
│   └── Operations            /w/me/ops (only rendered for operators; gated server-side)
└── Status                    /status
Auth: /auth/login → GitHub → /auth/callback → /w/me ; failures → /auth/unavailable
```

The editor (`/journeys/{id}/edit`) is reachable from both Demo and Your workspace; it belongs to the **Demo** section in navigation (it works without an account), and its "Save to account" control links into Your workspace.

### C.2 Page behaviour

| Page | Expected behaviour |
|---|---|
| Homepage `/` | Hero with the validated R1 result per T-P0-10 (PASS run if validated, otherwise the accurately labelled failed run) and its scope note; honest flow strip with state chips (T-P0-08); primary CTA "Open the demo", secondary "Your workspace" |
| Demo workspace `/w/demo` | Banner stating it is a public demo with sample data; journeys list; R1 evidence per T-P0-10 (successful demonstration and separate "Diagnostic example: failed R1 run"); links to traces and reports |
| Fernway `/apps/fernway` | Iframe of the broken passenger flow; journey list beside it; explains the app is a fixture |
| Journey picker `/journeys` | 3 journeys with local draft/version badges; opens the editor |
| Journey editor | Record, reorder, local save, autosaved draft with restore banner, local versions panel, account save with truthful state; mobile notice ≤740px |
| Local draft and versions | Draft restored only on explicit Restore; versions newest first; loading a version asks before discarding unsaved changes |
| Authenticated workspace `/w/me` | Signed out → sign-in prompt; config missing → "not set up" message; signed in → overview counts + next actions |
| Saved journeys `/w/me/journeys` | List of account versions (n, journey, saved time, short digest) → version page |
| Saved version `/journeys/versions/{id}` | Immutable steps, digest, journey, breadcrumbs back to Saved journeys; 404 on malformed id |
| Runs `/w/me/runs` | List of runs (status, journey, created); empty state explains runs are gated pending worker review |
| Run `/runs/{uuid}` | Existing `LiveRun` polling (5 s visible / 30 s hidden, 30 min cap); stages, evidence timeline, findings, report link; reasons humanised |
| Evidence | Existing `EvidenceTimeline` within the run page; downloads via existing `/api/runs/[id]/evidence` only |
| Findings | Shown in run and report pages with references; no fabricated findings |
| Reports `/w/me/reports`, `/runs/{uuid}/report`, `/r/r1-diagnostic` | Index lists stored reports; report pages printable; breadcrumbs back to run / demo |
| Patch review `/patches/{uuid}` | Existing review UI; execution remains gated; gated controls show reason |
| Verification `/verifications/{uuid}` | Existing panel; 404 on malformed id; no link to "pending" placeholder |
| Status `/status` | Feature rows with state + one-line reason (P0: static truthful copy from `feature-states.mjs`; P2: config-derived) |
| Operations `/w/me/ops` | Unchanged server gating; non-operators see "Operations are limited to approved operators" |

### C.3 Cross-cutting behaviour

- **Active states (REV-05):** derived only from `usePathname()` via `isActive()`. Each navigation region (top nav, sidebar, mobile drawer, breadcrumbs) marks the current route with `aria-current="page"` once if the route appears in that region; siblings in the same region are never both active; the active group is highlighted in the top nav. Multiple regions may each carry their own `aria-current`.
- **Breadcrumbs:** every non-root page; computed by `breadcrumbsFor()`; dynamic labels (journey name, short id) passed by the page.
- **Mobile:** drawer per T-P0-02; content single column; tables become stacked rows; no horizontal page scroll at 375px.
- **Refresh:** every state is URL-addressable (no hash navigation, no client-only routes); refresh on any page lands on the same page with the same active item; drafts survive refresh via `localStorage`.
- **Blocked controls:** `aria-disabled="true"` button + visible reason + link to `/status`; never a control that silently does nothing.
- **Loading:** skeletons for list/detail regions with `aria-busy="true"`; no layout jump when data arrives.
- **Errors:** inline error panel with human copy (`reasonText`), the code in small text, and a recovery action (Try again / Sign in / Open demo). Route-level errors use `error.tsx` with navigation.

### C.4 Component contracts (theme preserved; implemented in P0 by T-P0-11)

| Component | Contract | Check |
|---|---|---|
| PageHeader | breadcrumb → `h1` → one-line purpose → primary action; one `h1` per page | Single `h1`; heading order valid |
| Button | `primary` / `secondary` / `quiet`; min height 44 px on mobile; visible focus ring using existing accent token; disabled uses `aria-disabled` + reason | Keyboard focus visible on all three |
| StatusChip | `ok` / `gated` / `off` / `failed` / `info`; text label always present (colour is not the only signal) | Readable with colours removed |
| Card / Section | Consistent padding scale from existing tokens; section `h2` | Same spacing across pages |
| Table | Header row; stacks into labelled rows ≤740px | No horizontal scroll at 375px |
| EmptyState | Title, one-sentence reason, next action | Present for every list |
| InlineStatus | `aria-live="polite"` for save/progress messages | Screen-reader announces save |
| Skeleton | Matches final layout size; respects reduced motion | No layout shift on load |

---

## D. Backend and service integration

### D.1 Dependencies (source-verified routes; tables/RPCs from CONN)

| UI | API route | Server path | Supabase |
|---|---|---|---|
| Sign in | `GET /auth/login` | `sessionClient().auth.signInWithOAuth({provider:'github'})` | Supabase Auth (GitHub provider) |
| Callback | `GET /auth/callback` | `exchangeCodeForSession(code)` → cookies | `auth.users`, `auth.identities` |
| Workspace | `GET /api/workspace` | `requireUser` then reads | `runs`, `journey_versions` (by `user_id`), `journeys` catalog |
| Save to account | `POST /api/journeys` | same-origin check, `requireUser`, service role insert, `n = last + 1`, sha256 digest; conflict → `409` | `journey_versions` (immutable) |
| Saved version | `GET /api/journeys/versions/[id]` | `requireUser` + ownership | `journey_versions` |
| Run detail | `GET /api/runs/[id]` (+ reconcile) | `requireUser` | `runs`, `run_stages`, `artifacts`, `findings`, `diagnoses` |
| Evidence | `GET /api/runs/[id]/evidence` | signed access to private bucket | Storage `tabwise-evidence` |
| Report | `GET /api/runs/[id]/report` | `requireUser` | `reports`, `diagnoses`, `findings` |
| Patch / verification | `GET /api/patches/[id]`, `GET /api/verifications/[id]` | `requireUser` | `patches`, `verifications` |
| Ops | `/api/ops/limits`, `/api/ops/flags` | `requireOperator` | `operators`, `system_flags`, `kill_switch` RPC |
| **Gated, unchanged** | `POST /api/runs`, `POST /api/runs/[id]/diagnose`, `POST /api/runs/[id]/cancel` | approval refs, `admit_run`/`admit_version`, `reserve_diagnosis`, budget checks, `GH_PAT` dispatch | RPCs `admit_run`, `admit_version`, `reserve_diagnosis`, `persist_diagnosis`, `reserve_hosted`, `settle_hosted`, `run_transition`, `review_patch`, `claim_reconcile`, `immutable_record` |

Server clients (`web/lib/server/supabase.ts`): `serviceClient()` (service role; `503 server_configuration_pending` if config missing), `sessionClient()` (publishable key + request cookies; `503 sign_in_configuration_pending` if missing), `requireUser`, `requireOperator` (`operators` table). `assertProject` pins `ueobjrtvsgvkigmjxkks` (`web/lib/server/core.mjs:3`). Server pattern: `endpoint(request, work, write)` returning `{reason}` JSON + status, enforcing same-origin on writes.

### D.2 Session and cookies

- There is no Next middleware/proxy refreshing Supabase sessions; cookies are only written inside route handlers. Server components that need the user call the API routes, which read cookies per request.
- T-P0-07 verifies cookie survival across the `303` redirects and after refresh; this is the main technical risk in P0 (INF until verified).
- Authorization has two independent layers (REV-04): **API authorization** (`requireUser` plus per-route ownership filters; routes that use the service role bypass RLS, so these filters are the only protection on those paths) and **database RLS** (protects session-client/anon reads). Each is tested separately (V-P8/V-P9 for API, V-P6 for RLS).
- Do **not** add a middleware in P0 unless sessions demonstrably expire mid-demo; if needed later, it is a separate task within `web/**` using the existing `@supabase/ssr` package only.

### D.3 RLS (CONN)

- RLS enabled on all 19 public tables. Policies: `SELECT` for `anon, authenticated` on `reports`, `projects`, `apps`, `journeys`; `SELECT` for `authenticated` on `findings`, `journey_versions`, `runs`, `run_stages`, `artifacts`, `diagnoses`, `patches`, `verifications`. Seven owner-only tables have no policies (advisor INFO; service role only).
- No task changes RLS, policies, grants or migrations. Writes stay on the server (service role) behind `requireUser` and same-origin checks.

### D.4 Configuration boundary

- `NEXT_PUBLIC_*` values are inlined at **build time** → any change requires a new deployment to take effect.
- `SUPABASE_SERVICE_ROLE_KEY` and `TABWISE_OAUTH_CONFIGURED` are read at **runtime** on the server → take effect on the next deployment (Vercel env changes are not applied to existing deployments).
- Production and Preview are separate Vercel targets. **Preview receives no service-role key** (owner decision); Preview is therefore read-only/unavailable for privileged operations and shows the truthful "not set up" states.

### D.5 Error handling

- API responses keep their `{reason}` contract and status codes.
- UI maps reasons via `reasonText()`; auth navigations never render JSON.
- Server logs must not include tokens, codes, cookies or env values.

---

## E. Configuration and owner-only actions

### E.1 Environment variables

| Variable | Purpose | Public/Secret | Local `web/.env.local` | Vercel Preview | Vercel Production | Current state | Required action | Who |
|---|---|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API endpoint for browser and server | Public | Owner fills | Optional (public only) | Required | Missing in Production (INF) | Retrieve via Supabase connector, write via Vercel connector | Engineer (after G1) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (`sb_publishable_…`) key for the session client; use this, not the legacy anon JWT | Public | Owner fills | Optional (public only) | Required | Missing in Production (INF) | Same as above | Engineer (after G1) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only writes/reads (`journey_versions`, workspace) | **Secret** | Owner fills | **Not set** (owner decision) | Required, type Sensitive | Unknown (Vercel envs unreadable: 403) | Owner copies from Supabase dashboard into Vercel and `.env.local` | Owner |
| `TABWISE_OAUTH_CONFIGURED` | Enables `/auth/login` | Server flag | Empty until provider verified, then `1` | Not set | `1` only after provider verified (§E.4 step 6) | Unset (MEASURED by behaviour) | Set after verification | Engineer (after G1 + provider verified) |

**Deliberately excluded — must remain unset everywhere** (they enable live execution, paid inference or dispatch): `MODEL_API_KEY`, `TABWISE_EXECUTION_APPROVAL_REF`, `TABWISE_META_APPROVAL_REF`, `GH_PAT`, `GH_PAT_OWNER`, and any other worker-dispatch token or execution flag. If any already exists in Vercel, do not touch it; report its presence (name and target only) to the owner.

Local files: `web/.env.example` (tracked, empty values, comments) and `web/.env.local` (git-ignored by `.gitignore` rule `.env.*` with `!.env.example`). Never commit `.env.local`.

### E.2 Connector capabilities

| Action | Tool | Classification |
|---|---|---|
| Read Supabase URL and publishable key | Supabase `get_project_url`, `get_publishable_keys` | CONNECTOR-CAPABLE |
| Read schema, RLS, advisors, logs; read-only SQL checks | Supabase `list_tables`, `get_advisors`, `query_logs`, `execute_sql` (SELECT, or rolled-back transaction) | CONNECTOR-CAPABLE |
| Access Vercel project in team scope | Vercel `authorize_team_access` (single-use consent link, ~10 min) | REQUIRES CONNECTOR ACCESS APPROVAL (owner clicks Approve) |
| Read project settings; list env **names/targets** without decrypting | Vercel `get_project`, `filter_project_envs` | CONNECTOR-CAPABLE after G1 |
| Create/update public env vars and the OAuth flag | Vercel `create_project_env` / `edit_project_env` | CONNECTOR-CAPABLE after G1; Production config change → needs owner go-ahead at execution time |
| Runtime logs/errors | Vercel `get_runtime_logs`, `get_runtime_errors` | CONNECTOR-CAPABLE |
| Deploy / redeploy / promote / alias / domain | Vercel `create_deployment`, `request_promote`, … | REQUIRES SEPARATE PRODUCTION AUTHORIZATION |
| GitHub provider, Site URL, redirect allowlist | none in Supabase connector | CURRENTLY UNSUPPORTED → owner dashboard |
| Service-role key | not exposed by any connector | REQUIRES OWNER SECRET/ACCOUNT ACTION |
| Operator row | `execute_sql` insert | Not authorized (owner decision) |
| Migrations / RLS / policy / privilege changes | — | Not part of this plan; separate approval |

### E.3 Owner gates

| Gate | Owner action | How the engineer verifies |
|---|---|---|
| G1 | Approve the Vercel team access link generated by the engineer | `get_project` succeeds |
| G2 | Create GitHub OAuth App (see E.4 step 3) and enter its client ID/secret directly in Supabase → Authentication → Sign In / Providers → GitHub → Enable. Never paste them in chat | Public `https://ueobjrtvsgvkigmjxkks.supabase.co/auth/v1/settings` reports `external.github: true` |
| G3 | Supabase → Authentication → URL Configuration (exact entries in E.4 step 4) | Login redirect reaches GitHub without `redirect_to` errors (auth logs) |
| G4 | Copy service-role key from Supabase → Project Settings → API Keys into Vercel Production as Sensitive `SUPABASE_SERVICE_ROLE_KEY`, and into local `web/.env.local` | Name/target listed (not decrypted); after deploy, signed-out `/api/workspace` returns `401`, not `503` |
| G5 | Authorize the Production redeploy (separate authorization) | Deployment READY; runtime errors clean |
| G6 | Sign in once with GitHub and save one journey (engineer cannot enter passwords) | Read-only SQL in E.5 |
| G7 | Commit/push approved files (owner/partner) | `git log` |

### E.4 Setup order

1. Engineer: generate Vercel consent link → **G1**.
2. Engineer: `get_project` (confirm root directory `web`, framework, git link) and `filter_project_envs` (names/targets only). Report any excluded variable already present.
3. Owner (**G2**): GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
   - Application name: Tabwise
   - Homepage URL: `https://tabwise-meta.vercel.app`
   - Authorization callback URL: `https://ueobjrtvsgvkigmjxkks.supabase.co/auth/v1/callback`
   - Generate a client secret; enter ID and secret only in the Supabase dashboard.
4. Owner (**G3**): Supabase → Authentication → URL Configuration.
   - Site URL: `https://tabwise-meta.vercel.app`
   - Redirect URLs (exact, no wildcard): `https://tabwise-meta.vercel.app/auth/callback` and `http://127.0.0.1:3000/auth/callback` (the dev script binds `127.0.0.1`).
   - **No Preview wildcard.** Preview has no service-role key and is not an auth test target. Add a specific Preview URL later only with separate review.
5. Owner (**G4**): service-role key into Vercel Production (Sensitive) and local `.env.local`. Not into Preview.
6. Engineer: verify G2 via the public auth settings endpoint; then `create_project_env` for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Production; Preview optional, public only) and `TABWISE_OAUTH_CONFIGURED=1` (Production) — all before the deploy so one redeploy suffices.
7. Owner (**G5**): authorize one Production redeploy of the approved commit.
8. Engineer: Production checks V-P1–V-P3; owner **G6**; engineer V-P4–V-P6.

### E.5 Verification queries (read-only)

- Provider: `GET https://ueobjrtvsgvkigmjxkks.supabase.co/auth/v1/settings` (public; requires `apikey` header with the publishable key) → `external.github == true`.
- After G6: `select id, created_at from auth.users;` and `select provider from auth.identities;` → one GitHub identity.
- `select id, user_id, n, created_at from public.journey_versions order by created_at desc limit 5;` → row with the owner's `user_id`.
- RLS refusal (rolled back): `begin; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true); select count(*) from public.journey_versions; rollback;` → `0`.
- RLS positive control (rolled back): same, with the owner's `sub` → the owner's row count (≥1). Both are required for V-P6; a refusal without the positive control is NOT TESTED.
- `get_advisors` (security) → no new warnings.

### E.6 Rollback

| Change | Rollback |
|---|---|
| Vercel env var added/edited | Delete or restore the previous value via dashboard/connector; redeploy to apply |
| `TABWISE_OAUTH_CONFIGURED=1` causes issues | Remove it; redeploy → login returns to the unavailable page |
| Bad deployment | Owner-authorized promotion/rollback to `dpl_8F9nPkeZUhhv4SzFU19bZ4cDTq14` (current READY baseline) |
| GitHub OAuth App | Disable provider in Supabase; revoke/delete app in GitHub |
| Code | Revert the specific commit(s) on the feature branch (owner/partner) |
| Test data | Not deleted without separate approval; the single saved version is harmless |

---

## F. Verification matrix

Environments: **L** = local source (`D:\Projects\Meta AI\app`), **LB** = local browser against `npm --prefix web run dev` (127.0.0.1:3000, started in the user's terminal; no `.claude/launch.json`), **PV** = Vercel Preview (no service-role key), **PR** = Vercel Production (after G5).

Global commands (L):

```
npm --prefix web test
npm --prefix web run typecheck
npm --prefix web run build
git diff --check
git status --short
```

Pass = exit code 0, test count ≥ 55 and every new test file listed in §B executed. `npm --prefix web run build` must be run with `web/.env.local` absent or empty values unless the owner has authorized using real values locally.

| ID | Task | Test | Expected result | How to verify | Env | Pass/Fail |
|---|---|---|---|---|---|---|
| V-01 | All | Source tests | All pass, new files included | `npm --prefix web test` | L | exit 0 |
| V-02 | All | Typecheck + build | No errors | `npm --prefix web run typecheck`; `npm --prefix web run build` | L | both exit 0 |
| V-03 | T-P0-01/02 | Desktop/tablet nav (REV-05) | Per region (top nav, sidebar, breadcrumbs): current route marked once where represented; no two active siblings; active group correct; breadcrumbs correct | Visit each A.6 route at 1280×800 and 768×1024, inspect accessibility tree per region | LB | all routes correct in every region |
| V-04 | T-P0-02 | Mobile nav (REV-05) | Menu opens drawer, focus moves in, Escape closes, focus returns, no horizontal scroll; drawer marks the current route once; no active siblings | 375×812 on 5 routes | LB | all steps pass |
| V-05 | T-P0-03 | Workspace routes on refresh | `/w/me/runs` reload keeps "Runs" active; no `#` links | Reload each workspace route | LB | no hash URLs; active correct |
| V-06 | T-P0-04 | Truthful states | Without env: `/w/me` says "Sign-in isn't set up…"; never "storage unavailable" | LB with empty `.env.local`; unit tests | L, LB | copy matches |
| V-07 | T-P0-05 | Journey picker | 3 journeys, each opens editor | Click through | LB | 3/3 |
| V-08 | T-P0-06 | Draft persistence (REV-03) | Record 3 steps, reload **immediately** (no wait), Restore → same 3 steps; also unit test of append→flush→read with no timer | Fernway iframe recording + `node --test web/test/local-drafts.test.mjs` | L, LB | exact steps restored |
| V-09 | T-P0-06 | Local versions (REV-03) | Two saves → 2 entries newest first; valid legacy keys listed; invalid/foreign legacy keys not listed and not modified; loading a version with unsaved steps keeps them restorable | Panel + `localStorage` inspection before/after | LB | ordering, count, storage unchanged for invalid keys |
| V-10 | T-P0-06 | Mobile editor | Notice + versions list at 375px | Resize | LB | visible, no overflow |
| V-11 | T-P0-07 | Unavailable sign-in | Click Sign in → HTML page with reason; no JSON | LB without OAuth flag | LB | HTML page, whitelisted reason |
| V-12 | T-P0-08 | Gated CTAs | No "Run pending"; every gated control has visible reason + `/status` link | Visual + DOM check on `/`, `/w/demo`, `/apps/fernway` | LB | none missing |
| V-13 | T-P0-07 | Security: reflected reason | `/auth/unavailable?reason=<script>` renders generic copy | Visit URL | LB | no raw input rendered |
| V-14 | T-P0-04/07 | Security: no secrets in client | Built client bundle contains no service-role key or excluded var names with values | `grep -r "SUPABASE_SERVICE_ROLE_KEY" web/.next/static` | L | 0 matches |
| V-15 | All P0 | Error handling | Offline/500 shows Try again; error page has navigation | DevTools offline / bad id | LB | recovery action present |
| V-16 | T-P0-06 | Storage failure (REV-03) | With storage throwing/denied, the persistent warning is shown and no false "saved" message appears | Unit test with throwing storage; browser with site data blocked | L, LB | warning shown; no false success |
| V-17 | T-P0-06 | Draft validation (REV-03) | A draft for journey A is never offered in journey B; a draft with unsupported keys or over the step limit is rejected with the "couldn't be restored" message | Unit tests + manual `localStorage` edit | L, LB | no cross-journey or invalid restore |
| V-18 | T-P0-10 | R1 claims (REV-01) | Every displayed R1 run id/outcome/count/profile matches its validated source; failed run labelled failed; limitation note on homepage, demo, trace, report; fallback text if PASS evidence not validated | `node --test web/test/r1-evidence.test.mjs`; sha256 check of artifact; page review | L, LB | all claims traced to source |
| V-19 | T-P0-11 | Essential polish (REV-02) | At 375×812, 768×1024, 1280×800 on every primary screen: no horizontal scroll, one `h1`, page header, defined button/chip variants only, ≥44 px touch targets at 375, no clipped text, readable evidence/report, visible feedback on save actions | Built-in browser at three sizes; accessibility tree + screenshots | LB | every check true on every primary screen |
| V-PV1 | T-P0-04 | Preview truthful states | Preview without service key shows "not set up" for account features; demo fully works | Preview URL after owner push | PV | no misleading copy |
| V-P1 | All | Production smoke | Public routes 200; nav/mobile as V-03/V-04 | Built-in browser on production | PR | all pass |
| V-P2 | T-P0-04 | API config fixed | Signed-out `GET /api/workspace` → `401`, not `503` | Request in browser | PR | 401 |
| V-P3 | T-P0-07 | Login start | `/auth/login` → 303 to GitHub authorize URL | Browser | PR | reaches GitHub |
| V-P4 | T-P0-07/09 | Cookies and session (REV-04) | Login `303` carries PKCE verifier cookie; callback `303` carries session cookie(s) with `HttpOnly` (where set by library), `Secure`, `SameSite=Lax`, `Path=/`; `/w/me` authenticated after refresh; no `code` left in URL; no token/code in page or logs | Browser network panel during owner's G6 sign-in; `get_runtime_logs` scan | PR | all true; else BLOCKED/NOT TESTED |
| V-P5 | T-P0-09 | Save + view | Version appears in `/w/me/journeys`; version page shows matching digest | UI + E.5 SQL | PR | row with owner `user_id`; digest matches |
| V-P6 | T-P0-09 | Database RLS (REV-04) | Other `sub` sees 0 rows **and** owner `sub` sees the row | E.5 rolled-back queries (refusal + positive control) | PR | both conditions; else NOT TESTED |
| V-P7 | All | Runtime errors | No new runtime errors after deploy | `get_runtime_errors` | PR | none new |
| V-P8 | T-P0-09 | API unauthenticated (REV-04) | No session: `/api/workspace`, `/api/journeys/versions/{id}` → `401`; `POST /api/journeys` → `401`/origin refusal; no row data in bodies | Signed-out browser requests | PR | all refused, no data |
| V-P9 | T-P0-09 | API cross-user (REV-04) | Second authorized identity cannot read the owner's version (`403`/`404`, no data) and does not see it in `/api/workspace` | Requires a second owner-authorized test account | PR | refused; BLOCKED if no authorized second account |

Results must be reported as PASS / FAIL / BLOCKED / NOT TESTED with the command or observation that produced them. Do not report PR results before G5. Authenticated checks that could not be performed are BLOCKED or NOT TESTED, never PASS.

---

## G. Implementation ordering

### G.1 Dependency graph

```
T-P0-01 ──┬─> T-P0-02 ──┬─> T-P0-11 ──┬─> (P1 shell work)
          │             │             └─> T-P0-10 step 2 (UI)
          ├─> T-P0-03 ──┤
          └─> T-P0-05 ──┤
T-P0-04 ──┬─> T-P0-07 ──┼─> T-P0-09 ──> PR verification
          └─> T-P0-08   │
T-P0-06 ────────────────┘
T-P0-10 step 1 (validate R1 PASS evidence) ──> T-P0-10 step 2a or 2b
Owner: G1 → G2 → G3 → G4 → (engineer env writes) → G5 → G6 (→ optional second authorized test account for V-P9)
```

Critical path: owner gates G1–G6 (calendar time) in parallel with code; the code critical path is T-P0-01 → T-P0-02 → T-P0-11 → (T-P0-07 → T-P0-09, T-P0-10 step 2). T-P0-10 step 1 may need the owner to provide the R1 artifact download; start it on day one.

### G.2 Parallel work and file ownership

| Stream | Tasks | Owns files |
|---|---|---|
| A — Shell, navigation & polish | T-P0-01, T-P0-02, T-P0-03, T-P0-05, T-P0-11, T-P1-01, T-P1-05, T-P1-07, T-P1-08 | `web/lib/site-navigation.mjs`, `web/lib/workspace-navigation.mjs`, `web/components/TopNav.tsx`, `Workspace.tsx`, `OwnedWorkspace.tsx`, `Breadcrumbs.tsx`, `web/components/ui/**`, `web/app/layout.tsx`, `web/app/globals.css`, `web/app/w/**`, `web/app/journeys/page.tsx`, `error.tsx`, `not-found.tsx` |
| B — Editor | T-P0-06 | `web/lib/local-drafts.mjs`, `web/components/Recorder.tsx`, `web/app/journeys/[id]/edit/page.tsx`, `web/test/local-drafts.test.mjs` |
| C — States, auth, copy | T-P0-04, T-P0-07, T-P0-08, T-P1-04, T-P1-10 | `web/lib/reason-copy.mjs`, `workspace-state.mjs`, `feature-states.mjs`, `auth-redirect.mjs`, `web/app/auth/**`, `JourneyList.tsx`, `LiveRun.tsx`, `PatchReview.tsx`, `VerificationPanel.tsx`, `Ops.tsx` |
| D — R1 evidence | T-P0-10, T-P1-02, T-P1-03 | `web/data/r1*.json`, `web/lib/snapshot.mjs`, `web/components/RunDetail.tsx`, `web/app/page.tsx`, `web/app/w/demo/page.tsx`, `web/app/runs/[id]/page.tsx`, `web/app/r/[slug]/page.tsx`, `web/test/r1-evidence.test.mjs`, `web/test/snapshot*.test.mjs` |
| Shared | `web/app/globals.css` (stream A owns), `app/page.tsx` and `app/w/demo/page.tsx` (stream D owns; stream C's T-P0-08 flow-strip edits and stream A's T-P0-11 component adoption are applied after D's change, in that order) | One writer at a time per file |

Do not edit outside `web/**`. Another session (S5b/S6) works on the worker/R2 side; before starting and before each integration, run `git status --short` and `git diff --stat`; if any `web/**` file shows changes you did not make, stop and report. Never edit `STATE.md`, `LOG.jsonl`, `src/**`, `vendor/**`, `packages/contracts/**`, `supabase/migrations/**`, `.github/**`, `.claude/**`, `.codex/**`, `web/app/api/runs/**`, `web/app/api/ops/**`. The untracked `tabwise-s4-c1.patch` at the repo root is not part of this work — leave it alone.

### G.3 Integration sequence

All merges, commits and pushes below are owner or owner-authorized-developer Git actions, never Claude agent actions.

1. Stream A lands T-P0-01 (pure library + tests) first; stream D starts T-P0-10 step 1 (validation) at the same time.
2. Streams A/B/C/D proceed in parallel within their files.
3. Integration order: C (copy libraries) → A (shell, T-P0-11 components) → D (R1 data and pages) → C (T-P0-08 flow strip) → B (editor) → C (auth routes).
4. After each integration: V-01, V-02.
5. Local browser pass V-03–V-19.
6. Owner commit/push → Preview check V-PV1.
7. Owner gates → Production V-P1–V-P9.

### G.4 Freeze and cut rules

- **P0 freeze criteria:** V-01–V-19 PASS locally (V-18 may pass via the T-P0-10 step 2b fallback); V-PV1 PASS; V-P1–V-P9 PASS or explicitly BLOCKED/NOT TESTED on an owner gate with truthful UI in place.
- **Cut rules:** P2 is dropped first. Within P1 keep T-P1-01 (titles), T-P1-06 (404s), T-P1-07 (error nav), T-P1-04 (reasons); cut T-P1-09, T-P1-10, then T-P1-08. Essential polish (T-P0-11) and R1 accuracy (T-P0-10) are P0 and are not cut; if T-P0-10 validation is blocked, ship step 2b. If owner gates are not done by 2026-11-02 12:00 IST, T-P0-09 ships BLOCKED with T-P0-04/T-P0-07 truthful states.
- Nothing new after 2026-11-02 23:59 IST except fixes for FAIL results.

### G.5 Effort estimates (INF)

| Task | Hours |
|---|---|
| T-P0-01 | 1.5 |
| T-P0-02 | 2.5 |
| T-P0-03 | 1.5 |
| T-P0-04 | 1 |
| T-P0-05 | 0.5 |
| T-P0-06 | 4 (incl. flush, validation, failure state) |
| T-P0-07 | 2 (incl. cookie verification) |
| T-P0-08 | 1 |
| T-P0-09 | 1.5 (verification incl. API and RLS checks) |
| T-P0-10 | 3 (validation 1–1.5 + UI/tests) |
| T-P0-11 | 4 |
| **P0 total** | **≈22** |
| P1 | ≈4 (essential polish moved to P0) |
| P2 | ≈2 |

### G.6 Rollback and recovery

- Small, task-scoped commits so any task can be reverted independently.
- Local-storage changes are additive (new keys); old keys are never deleted, so reverting the editor loses no user data.
- Configuration rollback per §E.6. The current Production deployment remains the fallback.

### G.7 Remaining owner authorization gates

1. Approval of this document's contents and of its GitHub publication.
2. Owner-controlled commit and push.
3. Separate implementation and verification authorization for the partner.
4. G1 Vercel connector access; G2 OAuth App; G3 URL configuration; G4 service-role key; G5 Production redeploy; G6 test sign-in; optional second owner-authorized test account for V-P9; owner download of the R1 artifact for T-P0-10 if it is not in the repository.
5. Anything in §E.2 marked separate authorization (deployments, region change, operator row, migrations/RLS/policy changes, excluded variables).

### G.8 Start and finish

- **Start:** confirm branch `feat/tabwise-web-e2e-finish` at or after `063e789`, clean `web/**`; run V-01/V-02 to re-baseline; begin T-P0-01.
- **Finished:** P0 freeze criteria in G.4 met, results recorded as PASS/FAIL/BLOCKED/NOT TESTED with evidence, no gate loosened, no excluded variable set, no secrets in tracked files.
