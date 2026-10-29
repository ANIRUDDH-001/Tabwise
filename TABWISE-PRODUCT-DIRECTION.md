# Tabwise — Product Direction (hackathon build)

Written 2026-10-28 (UTC) by Claude (read-only review); revised after the owner's stack decisions.

**How this document marks things:**
- **OWNER**: an owner decision from this session.
- **MY CALL**: Claude's call, open to change.
- **PENDING (§13)**: still needs approval.
- **TO VERIFY**: a fact that must be checked before relying on it.
- **Evidence labels** follow AGENTS.md: MEASURED (run), CITED (source), INFERENCE.

Owner authorization (2026-10-29): Codex may implement lanes A+B+C, including the new worker workflow and the D8 dependencies in isolated lockfiles. Deploys, live dispatches, Meta calls or spending, restricted credential creation, commits and remote publication remain separately gated. Frozen R1 must not change.

---

## 1. Executive verdict

**Build a hosted Next.js web app that runs real NVDA keyboard journeys on disposable GitHub-hosted Windows VMs.** Meta Muse Spark turns that evidence into a source-level diagnosis and a minimal patch. A human approves the patch, and a real rerun decides whether it worked. P0 runs only on our own realistic sample app.

**Why this shape:**
- It is the only shape in which someone other than us can open a URL, record a journey, start a real screen-reader run, and get a fix checked by a second real run, all before the deadline.
- It reuses what already works:
  - the R1 GitHub-hosted NVDA path (MEASURED: run 40716824856, 5m 1s for 3 attempts × 10 steps);
  - the guarded send gate;
  - Codex's R2 capture adapter (`src/r2/capture.mjs`);
  - the budget-guarded Meta client;
  - axe-core 4.14.0.

**Decisions so far:**

| Area | Decision |
|---|---|
| Product (OWNER) | Hybrid hosted app; sample apps only in P0; the product is the R2/R3/R7 harness; Spark diagnoses and proposes a patch, and a real rerun is required; Wonder deferred |
| Features in (OWNER) | Public URL; read-only demo workspace; shareable verified report; cost and provenance shown. Regression mode and the self-test are P1. The BYO-repo Action and Glimmer are out |
| Stack (OWNER) | Next.js on Vercel. Next.js API routes are the only backend layer, with no Edge Functions. Supabase Postgres, Auth and Storage. Realtime only where it genuinely helps |
| Worker (OWNER) | A separate `tabwise-run.yml`, subject to an independent safety review; R1 untouched. No `id-token: write` by default: polling plus authenticated artifact retrieval first |
| Dispatch credential (OWNER) | A short-lived fine-grained PAT, server-side only, created by the owner |
| Meta resources (OWNER) | The owner **has** a Meta Model API key and $150 of hackathon API credits. These are project resources and not a question to reopen |
| Budget (OWNER) | A combined $100 application ceiling, split and enforced independently: $60 local/eval and $40 hosted. **$50 of the $150 credits stays untouched as a buffer.** Ceilings, not targets. ₹0 incremental spend; existing broker safeguards kept |
| Real Spark (OWNER) | **Real Muse Spark diagnosis and patch generation are mandatory P0 features**, not recorded-only. Real calls stay subject to the broker controls and per-step execution authorization |
| Safety review (OWNER, D16 + D16b, revised 10-29) | **Codex authors** `tabwise-run.yml`, `scripts/tabwise-run.mjs` and the guarded R2 worker integration. **Claude reviews them independently** against the frozen R1 safety checklist, R2 guard integration, the R2 provider contract, execution isolation, workflow identity, permissions, input delivery, cancellation, evidence integrity and Actions policy. Codex cannot self-approve. **No real dispatch until Claude gives an explicit PASS and the owner approves** |
| Implementation ownership (OWNER, IMPL 10-29) | **Codex is the primary implementer for lanes A, B and C.** Claude is limited to independent safety reviews and important architectural conflicts (quota restriction); no routine implementation, UI, testing, docs or database work |
| Infrastructure operations (OWNER, 10-29) | Supabase is connected through MCP for Codex and Claude. Agents perform every supported operation through MCP: project configuration, migrations, RLS, functions, verification. The owner does no manual SQL, dashboard or migration copying; only an unsupported or account-authorization action is raised as a named exception |
| Local cap (OWNER, D13b) | SQLite cap drops from $100 to $60 through reviewed, test-backed changes. The combined ≤ $100 exposure must be shown by tests (§6.9). Frozen R1 is untouched |
| Qualification (OWNER, D7 + D19) | At most a $0.05 probe, only after the §6.9 tests pass. Before **public** diagnosis is even proposed, it must be verified: the actual credit balance, that promotional credits apply to `muse-spark-1.3`, the billing safeguards, model availability, and reservation-based hard caps. Enabling public inference is a separate proposal and never automatic |
| Access (OWNER, D2 + D18) | GitHub sign-in to run; demo read-only without sign-in. Public limits: **1 concurrent public worker, 2 runs per user per day, 5 public runs globally per day**. Owner/qualification capacity is reserved separately under a strict global limit (2 workers in total). Only owned sample apps and fixed supported journeys. Atomic rate limits, idempotency, kill switch, **automatic downgrade to owner-only**. No queue and no automatic retries. **Public dispatch stays disabled until Claude's independent safety verdict on the Codex-authored worker and an explicit Actions-policy assessment (§6.10) are done** |
| Static demo (OWNER, D20) | A useful public read-only demo built from static snapshots of verified runs, independent of Supabase. It includes evidence references, GitHub run IDs, model provenance, limitations and verified results. **Never** fabricated output and **never** R2 withheld material. No keep-alive automation |
| Free tier (OWNER) | Standard runners only; limits rechecked (§6.8); bounded artifacts, retention, storage, egress and polling; capacity held back for rehearsal and judging; owner-only limits dashboard; no paid upgrades of any kind |

**Verdict on the polling mechanism (OWNER asked for an evaluation): sufficient for P0, with two accepted trade-offs.**
1. **Progress is coarse.** The UI shows live progress at stage level (VM setup → NVDA ready → running journey → uploading) from the GitHub Jobs API. The full evidence timeline appears when the run finishes, not word by word during it.
2. **The spec travels in public.** It goes to the worker through `workflow_dispatch` inputs, which anyone can see in a public repo. So the spec may carry nothing private: typed journey text must come from a fixed test-data palette.

OIDC is needed only if per-step live streaming becomes a requirement (P1, §7).

**Free-tier verdict (rechecked against official pages on 2026-10-28, §6.8):**

**Feasible, after five reductions.** No free tier blocks the core loop: real NVDA runs on standard GitHub runners in a public repo are free (CITED). These parts of the earlier plan don't survive as written:

1. **The every-minute sweeper.** Vercel Hobby cron runs once a day at most; anything more frequent fails at deploy (CITED). Replaced with lazy enforcement at admission and on every read, so no scheduler is required (§6.2).
2. **The 20 MB per-run evidence cap.** That cap would fill Supabase's 1 GB of free storage in 50 runs. New cap: 4 MB per run, and admission closes at 60% storage used.
3. **The public queue.** Removed (OWNER): requests over capacity get a 429 with a reason.
4. **Spark diagnosis is live in P0, and staged by who can trigger it.** Live calls are mandatory (OWNER).
   - **Stage A, owner:** after qualification, `diagnosis_mode=owner`. The owner runs real Spark diagnoses and patches live: in rehearsal, in the demo video, and on demand during judging.
   - **Stage B, public:** `diagnosis_mode=public`, capped, and proposed separately once Stage A has measured costs.
   - Until Stage B, a public user's own run ends at evidence plus deterministic findings, with "Live Spark diagnosis for public runs is pending qualification". The static demo shows genuine stored Spark outputs, labelled with model, time, input hash and cost.
5. **The read-only path depending on Supabase.** A Supabase Free project pauses after 1 week of inactivity (CITED). The demo workspace and public reports therefore also ship as static, hash-stamped snapshots in the Vercel build, so judges can see them while Supabase is paused or out of quota. Only live runs need Supabase.

**Two policy checks before public exposure (owner actions, not reopening the stack):**
- **Vercel Hobby eligibility.** Hobby excludes "financial gain of **anyone** involved in **any part of the production**" (CITED). Vercel stays the host (OWNER). The open question is whether a prize counts, which only Vercel can answer, so the owner asks support before the production deploy (D17).
- **GitHub Actions policy for public dispatch.** Assessed in §6.10. Owner-only dispatch is compatible on its face. Public dispatch has one unresolved clause, which only GitHub can settle. Public dispatch stays off until that is settled; otherwise the hackathon runs owner-only (D18, OWNER).

**Biggest feasibility risk:** the critical path runs through approvals and owner actions nothing else can unblock (§15 lists them exactly):
- implementation authorization;
- dependency approval (D8);
- Claude's independent verdict on the Codex-authored worker, then owner approval of the first dispatch;
- the owner creating the PAT, the Supabase project and the Vercel project;
- probe authorization after the §6.9 tests;
- the private channel for withheld R2 fixtures (D5).

If these slip past **2026-10-29 end of day (IST)**, P0 slips past feature freeze.

---

## 2. Product definition

**One-sentence pitch:** Tabwise runs your app's key journeys under a real screen reader, shows exactly where a blind user gets stuck even when scanners say "0 issues", and uses Meta Muse Spark to propose a source fix that a real rerun then confirms or rejects.

**Thirty-second explanation (the demo voice-over):**
> "This booking form passes axe with zero violations. Watch what a blind user hears. They press Book, a red error appears on screen, and the screen reader says nothing. They're stuck, and no scanner caught it. Tabwise ran this journey under real NVDA on a clean Windows machine and recorded every key, every focus change and every word spoken. Meta's Muse Spark read that evidence alongside the source, pointed to the line that causes it, and proposed a one-line fix. Rerun: the error is now spoken. Verified by a second real run, not by the model's say-so."

| Question | Answer |
|---|---|
| 1. Primary user | Frontend developers and QA engineers who ship forms, dialogs and status flows: sign-up, checkout, booking, settings. Most have never used a screen reader. INFERENCE |
| 2. Recurring problem | Any UI change can silently break the journey for screen-reader users: errors not announced, focus lost after a dialog, status changes unspoken. Static scanners pass these (MEASURED: axe found 0 violations on all 6 R2 development pages, the broken ones included). Manual screen-reader QA is slow and needs skills most teams lack |
| 3. Why they care | A blocked user can't finish the task, and there is legal exposure in many jurisdictions. Most of all, the developer gets a reproducible bug with a fix, not a vague audit |
| 4. User input | Pick a sample app, record a keyboard journey by using it in the browser (or edit the step list), then press Run |
| 5. What executes | A fresh GitHub-hosted Windows VM runs real NVDA 2026.2 (A15 profile), Chromium, and the sample app on loopback. The guarded key journey checks for a page acknowledgement after each key. The VM captures speech, focus, page events, a screenshot per step and axe snapshots |
| 6. Results | An evidence timeline (keys, focus, speech, app events, screens); barrier findings with evidence citations; an axe comparison; the Spark diagnosis and patch; a verified before/after; a shareable report with provenance and cost |
| 7. Meta's role | Muse Spark 1.3 is the diagnostic engine. It reasons over the speech/focus/event timeline and the app source together to name the barrier, the step that triggers it, the mechanism and the source location. It writes a minimal patch and the speech it expects after the fix, or it abstains (§8) |
| 8. After diagnosis | A human reviews the diff and clicks Approve & verify. A real rerun on the patched source gives a deterministic verdict: FIXED, NOT FIXED, REGRESSED or INCONCLUSIVE |
| 9. End-to-end success | Journey recorded → real run → at least one barrier with evidence → cited Spark diagnosis → approved patch → rerun verdict FIXED with before/after speech → public report link |
| 10. Why Tabwise | Scanners (axe) don't interact with the page. Speech-capture tools (Guidepup; BrowserStack screen-reader automation, a public beta, CITED from its docs on 2026-10-28) give you speech logs and assertions you write yourself. Tabwise closes the loop: evidence → cause in the source → patch → **verified by a real rerun** (§12 objections) |

**Making it clear to a general judge (MY CALL):** frame it as *"What does your app sound like?"*, not "WCAG testing". The signature screen pairs what the screen shows with what the screen reader said at the same moment. A silence gap after a visible red error needs no accessibility vocabulary to understand. Accessibility terms appear only on the findings screen.

**Value proposition:** catch the barriers scanners miss, get the line to change, and know the fix works because it was rerun under a real screen reader.

**Non-goals:**
- WCAG conformance or certification claims;
- arbitrary URLs or customer repos;
- mobile screen readers, JAWS or VoiceOver;
- coverage of NVDA's default browse mode;
- autonomous agents;
- auto-merging into repos;
- consulting.

**Anti-goals (a failure even if it technically works):**
- any fabricated or mocked speech, run, cost or verdict;
- a model prediction presented as a verified result;
- dead buttons or decorative screens;
- "a dashboard on Guidepup" with nothing new underneath.

---

## 3. MVP boundary

| Capability | Exists now (MEASURED/CITED) | Required for P0 (new work) | Explicitly unsupported |
|---|---|---|---|
| Real NVDA execution | R1 workflow, guarded sends, vendored Guidepup, A15 profile (run 40716824856) | A new `tabwise-run.yml` and a journey-driven runner that reuses R1/R2 primitives | Default browse mode; NVDA on dev machines |
| Evidence capture | R1 speech/focus/send journals; R2 capture adapter (offline, fake transport, D-57/D-58; real binding marked BLOCK pending review) | Real binding of the R2 adapter; screenshots; an artifact manifest with hashes | Arbitrary-site capture |
| Fixtures | 3 R2 development pairs; a private withheld package (Codex) | One realistic sample app with 3 barrier types, in healthy and broken variants | Customer apps |
| axe baseline | `scripts/r2-baseline.mjs`, axe 4.14.0 | Run in the worker at checkpoints; shown in the UI | — |
| Meta | `src/meta/client.mjs` (`/v1/responses`), SQLite broker | Structured-output request, diagnosis contract and validator, Postgres broker at $40, SQLite cap at $60 | Wonder, Glimmer, SAM |
| Backend | none | Next.js API routes, Postgres schema, state machine, dispatch, reconciler, artifact ingest | Edge Functions, queues, Redis |
| UI | none | The screens in §5 | Editing on phones |
| Journey recording | R1 `steps.json` format | In-browser keyboard recorder, step editor, test-data palette | OS-level recording; free-text input |
| Repair + verify | none (R3 not run) | Patch validator, patch applied in the worker, rerun, deterministic verdict | Automatic PRs |
| Evaluation | R2 contract, preparation, capture (offline) | R2/R3 run through the same modules from a private repo; R7 review | Recall/precision claims |

---

## 4. User journey (onboarding to verified result)

1. **Landing** (`/`). A split hero, "Screen shows / NVDA said", built from a genuine recorded run. Two CTAs: *Open demo workspace* (no sign-in) and *Sign in with GitHub*.
2. **Demo workspace** (`/w/demo`). Sample app **"Fernway"** (a fictional rail booking app; PENDING D10), its 3 journeys, and recorded runs labelled with their GitHub run IDs. Every screen can be browsed read-only.
3. **Sign in** (GitHub OAuth through Supabase Auth). This creates a personal workspace with Fernway. The onboarding checklist (Record → Run → Review) doubles as the empty state.
4. **Record a journey** (`/journeys/[id]/edit`). Fernway opens in an iframe; the user presses **Record** and uses the keyboard, and each key becomes a step.
   - Typing into a field opens the test-data palette (e.g. `test.user@example.com`, `Asha Test`, `invalid-email`), and only palette values are stored. This is required because the spec is public (§1).
   - Steps can be edited, reordered and deleted, and optional checkpoints added.
   - Save creates an immutable, hashed journey version.
5. **Run.** A stage rail moves through Admitted → VM starting → Installing NVDA → Running journey → Uploading evidence → Complete, driven by the GitHub Jobs API step statuses. Expected duration is about 3–5 min (INFERENCE from the 5m 1s R1 run, which ran 3 attempts; a product run is 1 attempt).
6. **Evidence.** A 5-lane timeline per step: Keys, Focus, Speech, App events, Screen thumbnail. Silence windows are drawn explicitly, e.g. "2.0 s silence after `validation-error` appeared".
7. **Findings.** Candidate barriers come from deterministic signals and from Spark. The axe panel reads, for example, "axe-core 4.14.0: 0 violations in this state". Evidence chips jump to the timeline.
8. **Diagnosis and patch.** The mechanism, source location, confidence or abstention, diff and rationale, plus the expected speech after the fix, labelled *Prediction*.
9. **Approve & verify.** A verify run uses the patched source, the same journey and the same profile.
10. **Before/after.** Paired timelines at the affected step, the verdict, and the deterministic checks.
11. **Share.** An immutable public report (`/r/[slug]`), server-rendered, ready to print to PDF.

---

## 5. UI/UX specification

### 5.1 Navigation map
```
/                         Landing
/w/demo                   Demo workspace (public, read-only)
/w/me                     My workspace (auth)
  /apps/fernway           Journeys, runs
  /journeys/[id]/edit     Recorder + step editor (auth)
  /runs/[id]              Run (tabs: Timeline · Findings · Fix · Verify)
  /verifications/[id]     Before/after
/r/[slug]                 Public report (SSR, no auth)
/status                   Live-runs / diagnosis availability, last successful run
```
A persistent **pipeline rail** on the run screens carries the product message: `Journey ▸ Run ▸ Evidence ▸ Diagnosis ▸ Fix ▸ Verified`. Each node shows its real state: done, active, blocked or not started.

### 5.2 Wireframes
```
LANDING
┌──────────────────────────────────────────────────────────────┐
│ Tabwise                             Demo  Docs  [Sign in GH] │
│  What does your app sound like?                              │
│  ┌─ Screen shows ──────────┐  ┌─ NVDA said ───────────────┐  │
│  │ [Email ______]          │  │ "Book, button"            │  │
│  │ ⚠ Enter a valid email   │  │  ░░ 2.0 s silence ░░      │  │
│  └─────────────────────────┘  └───────────────────────────┘  │
│  axe: 0 issues ✓     Real screen reader: user stuck ✕        │
│  [Open demo workspace]  [Record your first journey]          │
│  Recorded run · GitHub run 40… · NVDA 2026.2 (A15)           │
└──────────────────────────────────────────────────────────────┘

RUN (in progress)                     RUN / TIMELINE (complete)
┌ Journey▸Run▸Evidence▸… ──────────┐  ┌ Journey▸Run▸Evidence▸Diagnosis▸Fix▸Verified ┐
│ Run #12 · GitHub run 40… ↗       │  │ Steps │ Step 5  Enter on "Book"              │
│ ✓ Admitted          0:02         │  │ 1 Tab │ Keys   ▮Enter                        │
│ ✓ VM starting       1:10         │  │ 2 type│ Focus  Book (button) ──────          │
│ ● Running journey   (7 steps)    │  │ …     │ Speech "Book, button" ░ silence 2.0s░│
│ ○ Uploading evidence             │  │ 5 ⚠   │ App    validation-error @+180ms      │
│ [Cancel run]                     │  │       │ Screen [thumb]   [View finding →]    │
└──────────────────────────────────┘  └──────────────────────────────────────────────┘

FIX (patch review)
┌ Finding: Error not announced (Spark · confidence high) ──────┐
│ Evidence: utt#14, evt#22, silence w#5    Source: book.html:41│
│ ─ <p id="email-error"></p>                                   │
│ + <p id="email-error" role="alert"></p>                      │
│ Why: …   Prediction (unverified): "Enter a valid email…"     │
│ Checks: applies cleanly ✓ allowed file ✓ no external URL ✓   │
│ [Reject]                        [Approve & verify (real run)]│
└──────────────────────────────────────────────────────────────┘

VERIFY
┌ FIXED ✓  verified by run #13 (GitHub 40… ↗) ─────────────────┐
│ Step 5 before: "Book, button"  ░ silence ░                   │
│ Step 5 after : "Book, button"  "Enter a valid email address" │
│ Checks: symptom gone ✓ other steps unchanged ✓ evidence ✓    │
│ [Create shareable report]                                    │
└──────────────────────────────────────────────────────────────┘
```

### 5.3 Screen contracts
| Screen | Purpose | Components / interactions | Data | Loading / empty / error / disabled | Live vs replayed |
|---|---|---|---|---|---|
| Landing | Get the message across in 5–10 s | Split hero, 3-step how-it-works, CTAs | One pinned public report | Static fallback image | Recorded run, labelled |
| Workspace | Choose an app or journey; see history | App card, journey list, run list with status chips | journeys, runs | Skeleton rows; the empty state is the onboarding checklist; a "Live runs paused" banner when the kill switch is on | Demo is recorded; "mine" is live |
| Recorder | Create a journey | iframe app, Record/Stop, step list (edit/reorder/delete), checkpoints, palette, Save | journey_versions | A mouse click while recording shows a toast: "Keyboard only: screen-reader users navigate by keys". Max 25 steps; invalid steps flagged inline | Live |
| Run | Watch and inspect | Stage rail, GitHub run link, Cancel, 5-lane timeline, evidence chips | runs, artifacts | Per-stage elapsed time; a 429 shows its reason and when to retry; on failure, the stage, reason and *Run again*; partial evidence labelled INCOMPLETE | Live (or recorded, labelled) |
| Findings | Understand the barrier | Finding cards, axe panel, "detected by: signal / Spark / both", abstention card | findings, axe | "Diagnose with Spark" disabled until evidence is complete; a budget-exhausted state; abstention treated as a first-class result | Live call, cached by input hash |
| Fix | Review the patch | Diff viewer, rationale, labelled prediction, validator checks, Approve/Reject | patches | Approve disabled while any check fails | Live |
| Verify | Before/after | Paired timelines, verdict banner, check list | verifications | Pending; INCONCLUSIVE with its reason | Live |
| Report | Share a trustworthy result | Summary, before/after, diff, evidence, provenance table, print CSS | Immutable snapshot + sha256 | 404 for unknown slugs | A snapshot of genuine runs |
| Status | Honesty during outages | Flags, last successful run | system_flags | — | Live |

**Accessibility of Tabwise itself (P0):**
- keyboard-complete flows with visible focus;
- Radix primitives (via shadcn/ui);
- run progress announced with `aria-live="polite"`;
- timeline lanes also exposed as an ordered list for each step;
- reduced motion respected;
- axe on our own routes in CI.

The NVDA self-test is P1, and makes no certification claim.

**Responsive:**
- ≥1024 px: two panes.
- 640–1023 px: lanes stacked.
- <640 px: read-only for report, run and findings. The recorder shows "Use a desktop keyboard".

### 5.4 Visual identity (MY CALL; mockups on request)
- **Meta-inspired, not Meta-branded.** No Meta logo or wordmark, and not Meta's proprietary Optimistic font.
- **Tokens:**
  - Neutrals: `--bg #FFFFFF`, `--surface #F5F6F8`, `--border #E3E6EA`, `--text #0B0D10`, `--muted #5B6470`.
  - `--primary #0866FF`.
  - A blue→violet gradient `#0866FF→#7B3FF2` reserved **only** for Spark output, so a Meta AI moment is unmistakable and never decorative.
  - Lanes: speech `#7B3FF2`, focus `#0866FF`, keys `#475467`, app `#D97706`, barrier `#D92D20`, verified `#12B76A`.
  - Mirrored dark tokens.
- **Type:** Inter for the UI and JetBrains Mono for speech, code and IDs (both via `next/font`). Scale: 12/14/16/20/28/40.
- **Spacing and motion:** an 8 px grid with 8 px radii. Motion is 150–200 ms ease-out, on state changes only. Skeletons rather than spinners.
- **Avoiding the "AI-generated" look:**
  - no gradient blobs, glassmorphism or emoji headers;
  - no stock three-card grid;
  - real data on every screen;
  - copy in the product's own voice, e.g. "2.0 s of silence after the error appeared".

### 5.5 Frontend engineering (Next.js)
| Concern | Decision |
|---|---|
| Framework | Next.js App Router + TypeScript; Server Components for data pages; Client Components for the recorder, timeline interactions and the diff viewer |
| Rendering | `/r/[slug]` and `/w/demo` are server-rendered, cacheable and shareable with OG meta. Run pages render on the server first and then poll on the client |
| Auth | `@supabase/ssr` cookie session; middleware guards `/w/me/**` |
| Server-only boundary | Service-role key, GitHub PAT and Meta key are read only in `server-only` modules; there is never a `NEXT_PUBLIC_` secret. Build check: grep the client bundle for secret names |
| Client state | TanStack Query for polling `GET /api/runs/[id]` (dedup, backoff, stop when terminal); local state for journey drafts |
| Live updates | P0 polls every 5 s while a run is active, because the reconciler is driven by those reads anyway. Supabase Realtime is CUT for P0 because it adds nothing over polling with this mechanism (OWNER: Realtime only where it genuinely helps) |
| Optimistic UI | Only for journey edits. Never for runs or verdicts |
| Code splitting | `next/dynamic` for the recorder and the diff viewer |
| Error handling | `error.tsx` per route segment, with Retry and "copy correlation ID" |
| Tests | Vitest for the timeline, diff and verdict; Playwright E2E on the golden path against a local Supabase (P1); axe on our routes (P0) |
| Virtualization, session replay | CUT |

---

## 6. Architecture

### 6.1 Deployment and data flow
```
 Browser ──HTTPS──► Next.js on Vercel (Hobby, free; non-commercial — eligibility D17)
                    ├─ Static (built in): /, /w/demo, /r/[slug] snapshots — work with Supabase paused
                    ├─ Pages (RSC/SSR)            live reads via Supabase (RLS, user session)
                    └─ API routes — every call short (< 10 s), except diagnose (≤ 120 s, flag-gated)
                       server-only secrets: SUPABASE_SERVICE_ROLE, GH_PAT, MODEL_API_KEY (hosted)
                        POST /api/runs ──────────── atomic admission (one SQL txn) → dispatch, or 429
                        GET  /api/runs/[id] ─────── reconcile-on-read (10 s lease) → GitHub API
                        POST /api/runs/[id]/cancel
                        POST /api/runs/[id]/diagnose ─ diagnosis_mode gate (default off)
                                                        → hosted broker ($40 ceiling) → Meta
                        POST /api/patches/[id]/approve → verify run (same admission)
                        POST /api/reports
                        GET/POST /api/ops/* ─────── owner-only: limits dashboard, kill switches, daily budget
                              │                                   ▲
                              ▼                                   │ GET run (+ jobs) per reconcile;
 Supabase Free: Postgres (state, admission counters, broker, audit) · Auth (GitHub) · Storage (≤ 4 MB/run)
                              │                                   │ download artifact (PAT), then DELETE it
                              ▼ workflow_dispatch(inputs: run_id, spec_b64, spec_sha256)  — PAT, server only
 GitHub Actions — ANIRUDDH-001/Tabwise (public; standard windows-2025 runner only; free — CITED)
   tabwise-run.yml: permissions contents: read only · run-name "tabwise <run_id>" · timeout from measured worst case (≤ 25 min)
   NVDA 2026.2 (A15) + Chromium + Fernway on 127.0.0.1 · non-loopback requests blocked
   reuse: sendguard, foreground probe, vendored Guidepup, R2 capture adapter, axe
   → actions/upload-artifact (retention-days: 1, compressed, ≤ 4 MB): evidence + manifest.json

 Local / eval (separate, never touches the hosted DB): SQLite broker ($60 ceiling) · private repo (D5)
```

**No scheduler in P0.** Vercel Hobby cron is daily at most (CITED), so these jobs are done lazily instead:
- **Deadlines** are enforced inside admission: the same transaction times out overdue runs before counting slots.
- **Live runs** are reconciled on every read.
- **Orphans** (a run nobody is viewing) are reconciled by the next admission, which checks every non-terminal run older than its stage deadline. GitHub's own `timeout-minutes` ends the VM regardless.
- **Optional backstop:** one daily Vercel cron that marks overdue runs timed out and deletes stale artifacts. pg_cron on Supabase Free is TO VERIFY and not required.

**Security boundaries:**
- **Browser:** holds only the Supabase anon key and the user session, never the PAT, service role or Meta key.
- **Worker:** holds **no secret and no write path to our backend.** It reads its spec from inputs and writes only a GitHub artifact.
- **Backend trust in a worker result:** the backend trusts an artifact only when all of these hold:
  - the run's `path` is `.github/workflows/tabwise-run.yml`;
  - `event=workflow_dispatch` and `head_branch=main`;
  - `head_sha` is in the allowlist of approved worker SHAs;
  - `actor` is the PAT owner;
  - `display_title` is `tabwise <run_id>`;
  - the manifest's `spec_sha256` equals the stored spec hash;
  - every file hash matches.

### 6.2 Job lifecycle
```
admitted → dispatching → dispatched → running → uploading → ingesting → completed
   └───────────┴─────────────┴───────────┴──────────┴──────────┴──→ failed(reason) | cancelled | timed_out
 (rejected requests never become runs: 429 + reason, recorded in audit_log)
```
- **Transitions:** only through the SQL function `run_transition(run_id, from, to, reason)`, which validates the edge and appends to `audit_log` in the same transaction.
- **Idempotency:** `POST /api/runs` requires an `Idempotency-Key`, unique per `(user_id, key)`. A repeated key returns the same run, or the same rejection.
- **Dispatch mode (OWNER D18).** `dispatch_mode` takes one of three values: `off`, `owner_only`, `public`.
  - **It ships as `owner_only`.** Raising it to `public` needs both of these, recorded in `system_flags` with references: `worker_review_verdict=PASS`, and `actions_policy_cleared=true` (§6.10).
  - **Automatic downgrade** from `public` to `owner_only` (audited, shown on `/ops`). It happens when any of these holds:
    - any capacity gate turns amber;
    - GitHub rate remaining is below 1,000;
    - 2 consecutive public runs fail at infrastructure stages;
    - a hash or identity check fails;
    - the kill switch is used.
  - Downgrades never touch existing runs or evidence. Only the owner can raise the mode again.
- **Atomic admission (OWNER D2 + D18).** The SQL function `admit_run(user, kind, journey_id)` runs in one transaction under a single advisory lock.
  - **First**, it times out overdue runs (the lazy deadline step above).
  - **Then it checks, in order:**
    1. `dispatch_mode` permits this `kind`;
    2. the journey is a fixed supported journey on an owned sample app (`journeys.supported=true`);
    3. per-user active runs = 0;
    4. the per-user public daily count is < 2;
    5. the global public daily count is < `public_daily_dispatch_limit` (≤ 5, the code max);
    6. active public workers = 0, i.e. at most 1 concurrent public worker;
    7. total active workers are < 2, the strict global limit;
    8. the capacity gates in §6.8.
  - **Owner slot:** owner and qualification runs (`kind=owner`, owner GitHub ID checked on the server) skip checks 4–6. They can't be starved by public runs, because 6 + 7 leave one slot for the owner.
  - **Result:** it inserts the run as `admitted` and increments the counters, or it returns the first failed check as the 429 reason.
  - **No queue, no automatic retries.** *Run again* is a new admission.
- **Correlation:** the dispatch carries `run_id`. The workflow's `run-name` makes the GitHub run findable. The reconciler lists `tabwise-run.yml` runs created after the dispatch time and matches on `display_title`, then stores `gh_run_id`. Whether the dispatch API returns a run ID: TO VERIFY. The design does not depend on it.
- **Reconciliation:**
  - Happens on every `GET /api/runs/[id]`, at most once per run every 10 s via a lease column, so ten open tabs still cost one GitHub call.
  - Uses one GitHub call per reconcile: the jobs list for the run, which carries job and step status. Before `gh_run_id` is known, it uses the runs list filtered to the workflow.
  - Maps step statuses to stages. On completion it downloads, verifies and stores the artifact (`ingesting`), then deletes the GitHub artifact.
  - Reads `x-ratelimit-remaining` on every response. Below 1,000 it stops polling, shows "status delayed", and closes admission (§6.8).
- **Client polling** (bounded, free-tier requirement 4):
  - every 5 s while visible, every 30 s while hidden (`visibilitychange`);
  - stops when the run is terminal;
  - hard stop after 30 min, with a "Refresh status" button.
- **Deadlines:**
  - `admitted` → `dispatched` within 10 min;
  - `dispatched` → `running` within 10 min;
  - `running` → `completed` within the workflow's `timeout-minutes` plus 5 min. That timeout is set to 1.5× the measured worst case, capped at 25.
  - Otherwise the run becomes `timed_out` (lazily, at the next read or admission), and a GitHub cancel is sent.
- **Retries:**
  - **No automatic retry of NVDA runs**, inherited from R1. *Run again* creates a new linked run.
  - A failed dispatch HTTP call is retried once, then the run becomes `failed(dispatch_error)`.

### 6.3 Data model
```
projects(id, owner_id null=demo, name, visibility)
apps(id, project_id, slug, base_sha256, files jsonb{path→sha256})
journeys(id, app_id, name); journey_versions(id, journey_id, n, steps jsonb, sha256, created_by)
runs(id, journey_version_id, base_sha256, patch_id null, kind baseline|verify,
     status, reason, idempotency_key, user_id, spec_sha256, gh_run_id, gh_head_sha,
     nvda_version, profile 'A15', lease_until, deadline_at, created_at, started_at, finished_at,
     evidence_status complete|incomplete)
     unique(user_id, idempotency_key); index(status, created_at); index(journey_version_id, created_at desc)
run_stages(run_id, stage, status, started_at, finished_at) pk(run_id, stage)
artifacts(run_id, path, sha256, bytes, kind)  -- caps: 4 MB/run total, 150 KB/screenshot (WebP), journals ≤ 512 KB
findings(id, run_id, source signal|spark, step, title, mechanism, evidence_refs text[], location jsonb, confidence)
diagnoses(id, run_id, model, mode, prompt_sha256, input_sha256, output jsonb, verdict, usage jsonb,
          cost_nano, reservation_id) unique(input_sha256, model, prompt_sha256)
patches(id, finding_id, diff, files text[], validator jsonb, status proposed|approved|rejected, reviewed_by, reviewed_at)
verifications(id, patch_id, baseline_run_id, verify_run_id, verdict FIXED|NOT_FIXED|REGRESSED|INCONCLUSIVE, checks jsonb)
reports(slug, snapshot jsonb, sha256, created_by, created_at)          -- immutable
budget_reservations(id, model, worst_nano, settled_nano, state, user_id, run_id, created_at)  -- hosted $40 cap
system_flags(dispatch_mode off|owner_only|public default 'owner_only',
             diagnosis_mode off|owner|public default 'off',
             public_daily_dispatch_limit int check (0 ≤ value ≤ CODE_MAX=5),
             public_daily_diagnosis_limit int check (0 ≤ value ≤ CODE_MAX=10),
             worker_review_verdict text, actions_policy_cleared bool default false, policy_ref text,
             qualification_ref text, note, updated_by, updated_at)   -- editable at /ops, no redeploy; raising a mode needs its refs
rate_counters(user_id, day, runs, diagnoses) ; global_counters(day, public_dispatches, gh_api_calls, served_bytes)
capacity_snapshots(at, db_bytes, storage_bytes, gh_rate_remaining, est_egress_bytes, broker_reserved_nano)
audit_log(id, actor, action, subject, at, detail jsonb)
```
- **RLS:** users read only their own projects. Demo rows are public-read. Reports are public-read by slug.
- **Writes:** all writes go through API routes using the service role, after an explicit ownership check.
- **Pagination:** cursor pagination on run history using `(created_at, id)` (P1).

### 6.4 API contracts (Next.js route handlers)
| Route | Auth | Contract |
|---|---|---|
| `POST /api/runs` | user session | Body `{journey_version_id, patch_id?}` plus the `Idempotency-Key` header. Validates ownership, palette-only text and spec ≤ 60,000 chars, then calls `admit_run` (§6.2). Response `202 {run_id, status}`, or `429 {reason: dispatch_off \| owner_only \| unsupported_journey \| user_active \| user_daily \| global_daily \| no_public_slot \| global_limit \| capacity_<gate>, retry_after?}`. Users never get dispatch rights; the PAT exists only in this route's process |
| `GET /api/runs/[id]` | session, or public for demo rows | Reconciles under the lease, then returns `{status, stages[], gh_run_url, evidence_status}` |
| `POST /api/runs/[id]/cancel` | owner | GitHub cancel, then `cancelled`; partial evidence kept and labelled |
| `POST /api/runs/[id]/diagnose` | run owner | Allowed by `diagnosis_mode`: `off` → `403`; `owner` → owner GitHub ID only; `public` → also signed-in users, under the per-user cap of 3 a day and the global daily cap. Requires a `completed` run with `complete` evidence. Then it serves the cache, or reserves worst-case cost on the hosted broker and calls **real** `muse-spark-1.3` with explicit `max_output_tokens` and an input-size cap, and validates the output. Client timeout 120 s. Response `{diagnosis_id, verdict, findings[], model, usage, cost}` |
| `POST /api/patches/[id]/approve` | owner | The validator must pass; this creates a verify run (same path as `POST /api/runs`) |
| `POST /api/reports` | owner | Verification must be terminal. Returns an immutable snapshot and slug |
| `GET /api/ops/limits` | owner (GitHub user ID allowlist, server-checked) | Capacity snapshot (§6.8): runs today and active, GitHub rate remaining, DB and storage bytes, estimated egress, broker reserved/settled vs $40, flag states, thresholds |
| `POST /api/ops/flags` | owner | Sets `dispatch_mode`, `diagnosis_mode` and the daily limits (bounded by `CODE_MAX`). Raising `dispatch_mode` to `public` is refused unless `worker_review_verdict=PASS` and `actions_policy_cleared=true`. Raising `diagnosis_mode` is refused unless `qualification_ref` is set (and, for `public`, a recorded owner approval). **The kill switch sets both modes to `off`.** Existing runs, evidence and reports are untouched. Audited |
| `GET /api/cron/daily` (optional) | Vercel cron secret | Daily backstop: overdue → `timed_out`, delete expired artifacts, take a capacity snapshot |

### 6.5 Worker (`tabwise-run.yml`; Codex authors, Claude reviews independently, owner approves the first dispatch — D16/D16b revised)
- **Independent review checklist (Claude reviews; explicit PASS/FAIL per line, recorded in DECISIONS.md; Codex cannot self-approve):**
  1. R1 frozen: `r1.yml`, `scripts/r1.mjs`, locks and evidence byte-identical (diff against HEAD);
  2. R1 guards reused, not bypassed: sendguard, foreground probe, runguard identity;
  3. R2 provider contract: `capture.mjs` interface consumed unchanged;
  4. isolation: loopback only, `RUNNER_TEMP` copy, no network egress from the page;
  5. workflow identity checks (§6.1);
  6. permissions `contents: read` only, no secrets referenced;
  7. input delivery: hash verified, schema validated, palette-only, nothing echoed;
  8. cancellation and timeouts;
  9. evidence integrity: manifest, hashes, size caps;
  10. Actions policy considerations (§6.10).
- **Trigger:** `workflow_dispatch` with inputs `run_id` (UUID), `spec_b64` and `spec_sha256`. The input limit is 65,535 characters (CITED, GitHub docs). Journeys of ≤25 steps plus a ≤40-line patch fit comfortably.
- **Workflow settings:**
  - `permissions: contents: read` and nothing else (**no** `id-token`);
  - main only; actions pinned to SHAs; `persist-credentials: false`;
  - `runs-on: windows-2025` (standard runner only, never larger runners);
  - `timeout-minutes`: 1.5× the measured worst case, capped at 25;
  - artifact `retention-days: 1`, and the backend deletes the artifact after ingest;
  - `concurrency: tabwise-run-${{ inputs.run_id }}`;
  - `run-name: tabwise ${{ inputs.run_id }}`.
- **Steps:** the same setup as R1 (`npm ci --ignore-scripts`, guidepup setup, NVDA, Chromium, read-only checkout), then `node scripts/tabwise-run.mjs`. That script:
  1. Decodes the spec and verifies its sha256.
  2. Validates the spec against the shared schema: allowlisted keys, palette text, Fernway base hash.
  3. Copies Fernway into `RUNNER_TEMP` and applies an approved patch through a strict applier: allowed files only, ≤40 lines, no external URLs, no new `<script src>`.
  4. Serves the app on 127.0.0.1 and blocks non-loopback requests with Playwright `route`.
  5. Runs the journey through the R1 send gate and the R2 capture adapter: one fresh attempt.
  6. Takes a screenshot after each step and runs axe at checkpoints.
  7. Writes the evidence and `manifest.json`.
  8. Uploads the artifact with `if: always()`.
- **Logs:** the workflow echoes nothing from the spec beyond the `run_id`. The inputs are public anyway, which is why they may contain no private content.
- **R1 frozen:** `r1.yml`, `scripts/r1.mjs`, the R1 locks, thresholds and evidence stay untouched. `workflowGuardErrors` accepts an explicit approved identity, per Codex's handoff.

### 6.5a Builder-check settlements (MY CALL)
- **One attempt per product run.** Evaluation runs keep the frozen R2/R3 protocol.
- **Verdict tolerance.**
  - Speech is compared as normalized text per step: lowercased, whitespace collapsed, punctuation stripped.
  - Timing is ignored except for silence windows. A silence exists only when no utterance falls within the adapter's observation window.
  - Check (b) passes when every baseline utterance at the unaffected steps still appears in the verify run, in order; extra utterances are fine.
  - A capture-integrity failure gives INCONCLUSIVE, never REGRESSED.
- **Run inputs.**
  - Every run uses the pinned Fernway base (broken variant) plus at most one approved patch. Patches don't stack in P0.
  - The healthy variant appears only as a labelled reference run in the demo workspace.
  - The cache key is base sha256 + patch sha256 + journey sha256 + evidence sha256.
- **Evaluation path (consistent with OWNER "Product is the harness", with labels isolated).**
  - Same modules: worker runner, diagnosis prompt + schema + validator, and the verdict function.
  - They run from a private repo with a sealed local spec, and do **not** touch the hosted database.
  - Evidence stays in private artifacts. Scoring is offline through Codex's `preparation.mjs`.
  - The patch allowlist means "files of the app under test".
- **Repo visibility.** ANIRUDDH-001/Tabwise is public: the page for run 40716824856 loaded without sign-in on 2026-10-28.

### 6.6 Execution safety answers
1. **Can the existing workflow be adapted?** Yes, as a new workflow with the same guards. R1 is neither bypassed nor edited.
2. **How the UI starts a test:** UI → `POST /api/runs` → server-side `workflow_dispatch` with the PAT. The browser never holds a GitHub token.
3. **Permissions:**
   - PAT: Tabwise repo only; **Actions read and write** (dispatch, cancel, read runs, jobs and artifacts); Metadata read is automatic. Short expiry (PENDING D4b).
   - Workflow: `contents: read`.
4. **How results return:** the server downloads the artifact (PAT, Actions read), verifies the hashes and identity checks in §6.1, then stores the files.
5. **Where evidence lives:** a private Supabase Storage bucket, served via signed URLs (1 GB free). Reports embed snapshot excerpts only. User runs are kept 14 days, and pinned demo runs and report snapshots indefinitely. GitHub artifacts last 1 day and are deleted after ingest. The current GitHub billing page doesn't say artifact storage is free for public repos, so we don't assume it.
6. **How progress appears:** GitHub job step statuses → `run_stages` → client polling.
7. **Isolation:** one disposable VM per run; a per-run concurrency group; RLS per project; no secrets on the VM.
8. **Restrictions:**
   - Fernway at a pinned base only.
   - ≤25 steps; allowlisted keys (Tab, Shift+Tab, Enter, Space, Escape, arrows, Home/End, type).
   - Palette-only text.
   - The patch rules above.
9. **Users' own projects:** not in P0 (OWNER). The future path is the GitHub Action on the user's own runner.
10. **Local execution:** not needed, and deferred.

### 6.7 Failure handling (all P0)
| Scenario | Behaviour |
|---|---|
| Worker unavailable / dispatch fails | One retry, then `failed(dispatch_error)`; /status banner; demo workspace unaffected |
| Job submitted twice | Same run via the idempotency key; button disabled while pending |
| GitHub run not found after dispatch | The reconciler keeps searching until the 10-min deadline, then `failed(no_github_run)` |
| Browser crashes | Teardown writes partial evidence → `failed(browser_crash)`, `incomplete`; diagnosis disabled |
| NVDA stops responding | Existing timeouts and sticky stop → `failed(nvda_unresponsive)` |
| Artifact missing, corrupt or hash mismatch | `failed(evidence_integrity)`; nothing shown as results |
| Model API fails or times out (route limit 300 s, CITED) | Reservation stays open (existing rule); "Diagnosis failed — retry" (a new reservation); `diagnosis_mode=off` kill switch |
| User refreshes mid-run | State is server-side; the page rehydrates and resumes polling |
| Partial evidence | `incomplete`; no verdicts; labelled |
| User cancels | GitHub cancel → `cancelled`; partial evidence kept and labelled |
| Deadline exceeded | Lazy check at the next read or admission (or the daily cron) → `timed_out` + GitHub cancel; GitHub's `timeout-minutes` ends the VM regardless |
| Two users submit at once | Atomic admission: one gets the public slot, the other gets `429 no_public_slot` with a retry hint. No queue |
| GitHub API rate low (< 1,000 remaining) | Polling paused ("status delayed"), admission closed, owner dashboard red |
| Supabase paused or over quota | Static demo and reports keep working; live features show "Live runs unavailable"; owner restores (data kept; restore window per Supabase docs) |
| Vercel Hobby limit exceeded | The feature is unavailable until the 30-day window passes (CITED). Prevention: bounded polling, static assets, small payloads, alerts at 50%. The recorded demo video is the last resort |
| Hosted broker near its ceiling | Diagnosis closes at 80% of $40; the hard stop at 100% is enforced by the broker regardless |
| Private-repo eval minutes exhausted | Eval runs stop: blocked with no payment method (CITED). The product is unaffected |
| Fix approved, never verified | Patch shows "approved, unverified"; the report refuses to say "fixed" |
| Malicious URL or page | Impossible by construction (no URLs); patch validator; loopback-only network |
| Abuse | Rate counters, the hosted $40 broker, kill switches |
| GitHub outage during judging | Status page; static demo and reports; recorded demo |

### 6.8 Free-tier capacity plan (official pages read 2026-10-28; recheck before implementation, OWNER requirement 1)

**Limits that matter, and how we stay inside them.** "Reserve" is capacity held back for final rehearsal and judging (OWNER requirement 5).

| Provider: limit (CITED) | Our worst-case use (INFERENCE until measured) | Control | Alert / gate | Fallback at limit |
|---|---|---|---|---|
| **GitHub:** standard hosted runners free in public repos | ≤ 1 public + 1 owner run at a time; ≤ 5 public dispatches a day globally, ≤ 2 per user (`CODE_MAX`=5) | Atomic admission; `runs-on: windows-2025` only | Dashboard: runs today, minutes used | — |
| **GitHub:** 20 concurrent jobs (Free) | ≤ 2 | Global cap 2 | — | — |
| **GitHub:** 6 h per job | ≤ 25 min | `timeout-minutes` from measured worst case | — | — |
| **GitHub:** PAT 5,000 requests/h | One reconcile per run every 10 s ≈ 360/h per active run, ≈ 720/h at 2 runs, plus dispatch/download/delete ≈ 5 per run | Lease; counter in `global_counters` | Pause and close admission below 1,000 remaining | Status delayed; recover on reset |
| **GitHub:** artifact storage 500 MB (private, Free); public-repo storage not stated free | ≤ 4 MB per run, 1-day retention, deleted after ingest → < 50 MB live | Size check in the worker + ingest | Dashboard | Run fails `evidence_too_large` |
| **GitHub:** Actions terms (CITED) bar burden "disproportionate to the benefits"; example: "as part of a serverless application" | ≤ 5 public runs a day testing the repo's own sample app | Ships `owner_only`; public only after §6.10 clears | Auto-downgrade | Owner-only (§6.10) |
| **GitHub, private eval repo (D5):** $12/month included; Windows $0.010/min → about 1,200 Windows min; with no payment method, usage is blocked at the allowance | R2+R3 frozen protocol, estimate ≤ 150 min (TO MEASURE) | No payment method, or a $0 budget (owner verifies) | Owner checks GitHub billing | Eval pauses; product unaffected |
| **Supabase:** DB 500 MB | Rows + journals in JSON; < 20 MB expected | No blobs in the DB | 50% amber, 70% close admission | Live features off |
| **Supabase:** Storage 1 GB | 4 MB/run → 600 MB ≈ 150 runs | 14-day expiry; daily cleanup | 40% amber, **60% close admission** | Expire oldest non-pinned runs |
| **Supabase:** egress 5 GB (+ 5 GB cached) | Timeline view ≈ 1.5 MB (thumbnails); 1,000 views ≈ 1.5 GB | Signed URLs only on demand; static demo assets served by Vercel | `served_bytes` counter, 50% amber, 70% close live views | Static demo still works |
| **Supabase:** paused after 1 week of inactivity; restore window 1 year in current docs (older changelog said 90 days) | Judging dates unknown (Q-open) | **No keep-alive automation** (OWNER: don't rely on uptime). Static snapshots for the demo and reports | Owner daily check through judging | Owner restores from the dashboard; live features are down until then |
| **Supabase:** log retention 1 day | — | Our own `audit_log` | — | — |
| **Vercel Hobby:** function max duration 300 s | Runs never hold a request; diagnose ≤ 120 s | Short routes; `maxDuration` set per route | — | — |
| **Vercel Hobby:** 1M invocations, 4 active-CPU hours, 360 GB-hrs provisioned memory, 100 GB fast data transfer | Polling ≈ 720 invocations/h per watched run; I/O wait isn't active CPU (CITED) | Bounded polling; static pages | Vercel usage page (owner) checked daily; 50% amber | Over the limit, a feature is unavailable for about 30 days (CITED) — **prevention only** |
| **Vercel Hobby:** cron once a day, ±59 min | One optional daily job | Lazy enforcement (§6.2) | — | — |
| **Vercel Hobby:** 100 deployments a day | Batched deploy windows (D14) | — | — | — |
| **Vercel Hobby:** non-commercial only | Hackathon entry with prize money | — | — | **D17** |
| **Meta:** hosted ceiling $40; local ceiling $60 | Owner-mode live diagnoses for rehearsal, demo and judging; public mode only after separate approval; planned use about $13 (§8) | Brokers (§6.9) | Close at 80% of each ceiling | Kill switch |

**Owner-only dashboard (`/w/me/ops`, OWNER requirement 11).** One page with:
- a traffic light per row of the table above;
- remaining capacity, as a number and a percentage;
- the last capacity snapshot time;
- buttons: kill switch, daily dispatch limit, diagnosis flag.

Values that can't be read through an API are shown as "check manually" with a link: Vercel usage, Supabase egress if the management API isn't available on Free, and GitHub billing. Nothing is estimated silently.

**Measurement before public launch (OWNER requirement 3).** Five owner qualification runs record:
- average and worst-case wall time;
- per-stage times;
- artifact bytes;
- GitHub API calls per run.

These numbers replace the INFERENCE estimates above and set `timeout-minutes`, the caps and the daily limit.

**Reserve policy (OWNER requirement 5):**
- the public daily dispatch limit starts at **5** (the code max), and the owner can lower it at any time;
- admission closes at the thresholds above, leaving ≥ 40% of storage and egress for rehearsal and judging;
- the owner slot is never public.

**Is the MVP feasible on free tiers?** Yes, with the five reductions in §1. Nothing in P0 assumes capacity beyond these figures. The Vercel eligibility question (D17) is the one item that could force a change of host. If Vercel says no, the smaller alternative is the static demo plus reports on GitHub Pages (free; allowed for a project site, TO VERIFY), with live runs owner-dispatched only.

### 6.9 Budget exposure: showing combined spend ≤ $100 (OWNER D13b, required before any probe)

**Invariant:** for each broker, `reserved_worst_case + settled ≤ ceiling` at all times. Every Meta call must go through a broker.

**Mechanism:**
1. **Worst-case reservation before every call.**
   - `worst = in_tokens_upper × in_price + max_output_tokens × out_price`.
   - `in_tokens_upper` is the UTF-8 byte length of the request. A token is at least one byte for byte-level tokenizers (INFERENCE; the probe checks reported `usage` against it).
   - The request is refused if `worst` exceeds a per-call limit ($0.10 hosted, $0.05 for the probe).
2. **Atomic reservation.**
   - SQLite: the existing broker's `BEGIN IMMEDIATE`.
   - Postgres: `SELECT … FOR UPDATE` on a single budget row, inside one transaction.
   - Concurrent reservations serialize, so they cannot jointly overshoot.
3. **Failure accounting (the existing rule kept).**
   - A call with an unknown outcome (timeout, crash, network error after send) keeps its full worst-case reservation and is never refunded automatically.
   - Settlement only lowers a reservation to the reported cost, and only when a usage block is present.
4. **Retries** are new reservations. There are no automatic retries inside a reservation.
5. **Explicit request limits** on every call: `max_output_tokens`, an input byte cap, one request per reservation, no tools.
6. **Key separation (D13c).**
   - The hosted key lives only in Vercel's server env; the local key only on the owner's machine.
   - If Meta allows several keys, separate keys make the split auditable and individually revocable.
   - If it doesn't, the shared key never leaves a broker-wrapped client, and a grep test in CI forbids raw `fetch` to `api.meta.ai` outside the client.
7. **Combined bound:** each broker ≤ its ceiling, so the total is ≤ $60 + $40 = $100. On top of that, the owner has $150 in promotional credits (OWNER), so the $100 ceiling leaves a $50 buffer. Incremental billing stays at ₹0 provided the credits apply to `muse-spark-1.3` usage before any card charge. That is checked once during qualification (D19), recorded with a reference, and not reopened. The card's spend limit only notifies, so the brokers are the real stop.

**Tests that must pass before the probe** (offline, fake transport):
- 50 concurrent reservations against a nearly full ceiling → none overshoot;
- a crash between send and settle → the reservation is retained;
- a timeout → retained;
- a retry → a second reservation;
- a settle above the reservation → rejected and alarmed;
- a missing usage block → the worst case is kept;
- a per-call limit violation → refused before send;
- caps read back as $60 / $40;
- a bypass grep → clean.

**Frozen R1** is untouched by all of this; the cap change touches broker config and governance text only.

### 6.10 GitHub Actions usage-policy assessment (OWNER D18; read 2026-10-28)

Source: GitHub Terms for Additional Products and Features, Actions section (CITED, paraphrased), plus "Use for Development and Testing". This is a reading of the terms, **not legal advice and not a compliance guarantee**. Low usage alone does not show compliance (OWNER).

| Clause (paraphrased) | Owner-only dispatch | Public sign-in dispatch | Assessment |
|---|---|---|---|
| GitHub-hosted runners: no activity unrelated to producing, testing, deploying or publishing the repo's own software project | Tests Fernway, which lives in this repo → related | Same runs, same app; only the person pressing Run differs | Compatible on its face for both |
| Actions may be used only to develop and test *your* applications | Yes | The judges run tests of *our* application | Likely compatible; the wording is about the application, not the person |
| Burden disproportionate to benefit; examples include CDN use or "part of a serverless application" | ≤ 2 runs at once, a few a day | A hosted web app triggers Actions as its compute back end: this **resembles the "serverless application" example** in shape, even at low volume | **Unresolved for public dispatch** |
| No offering Actions, standalone or integrated, as an application or service **for commercial purposes** | Not a service | A free, non-commercial demo with no payment, but the prize question echoes D17 | Probably compatible; not certain |
| One licensed user accesses a VM at a time | Nobody but the workflow touches the VM | Judges never access the VM | Compatible |
| GitHub may monitor, restrict, disable repositories or suspend accounts for misuse | — | — | The **consequence is severe**: losing the repo or account also loses the R1 evidence and the submission repo |

**Verdict:**
- **Owner-only dispatch:** compatible on its face. Every run is the repo owner testing their own project.
- **Public dispatch:** **not resolvable by us.** The "serverless application" example is the one clause that a hosted, user-triggered design resembles. Only GitHub can settle it, through a written answer from GitHub Support.

**Plan:**
1. Build public dispatch fully, but ship it **disabled** (`dispatch_mode=owner_only`).
2. **Owner action (D18a):** send GitHub Support a factual description and ask whether it's acceptable. The description: a public repo; a hosted demo app; signed-in users trigger at most 5 runs a day on standard runners; each run tests the repo's own sample app; no commercial use.
3. Public dispatch is enabled only on a clear written yes, recorded as `policy_ref`, **and** after Claude's independent PASS on the worker.
4. **If there's no clear yes by 2026-11-02 (feature freeze), the hackathon runs owner-only.** What judges get:
   - the static demo, with complete verified loops;
   - genuine owner-dispatched runs (there's no request list in P0, per D22), shown in the static demo once they're verified;
   - a demo video showing a live dispatch, a live Spark diagnosis and a verify rerun.
   - The UI states this honestly: "Live runs are started by the Tabwise team during judging".
   - This is bounded: at most 5 requests a day, each simply a stored row, so it creates no unbounded queue.

**Long-term compliant worker (post-hackathon):**
1. **First choice: the Tabwise GitHub Action in the user's own repository.**
   - The user's workflow, runners and minutes test the user's own project, which is exactly the use the terms allow.
   - Our hosted app only receives artifacts (pull, or a user-provided upload).
   - The same worker code; this is the BYO-Action item already marked out of scope for P0.
2. **Hosted SaaS:** our own dedicated, disposable Windows VMs from a cloud provider. That is paid infrastructure, which is excluded for now.
3. **Not acceptable:** self-hosted runners on anyone's everyday desktop (OWNER).

---

## 7. Engineering depth matrix

| Concept | Product problem | Implementation | Benefit | Cost | Pri |
|---|---|---|---|---|---|
| Idempotent job creation | Double clicks would launch two VMs | Unique `(user_id, idempotency_key)` | No duplicates | Low | P0 |
| DB state machine + audit | 7+ states across 3 systems | Transition function, CHECKs, audit_log | Consistent and debuggable | Low | P0 |
| Atomic admission (no queue) | Shared free runners and budget | `admit_run`: one transaction, advisory lock, ordered checks, reserved owner slot, 429 reasons | Bounded load; judges never starved | Low | P0 |
| Reconcile-on-read + lazy deadlines | Serverless with no frequent cron on Hobby | Lease column; deadlines enforced inside admission; optional daily cron | No zombie runs, no scheduler | Low | P0 |
| Capacity gates + owner dashboard | Free-tier limits (OWNER) | `capacity_snapshots`, thresholds, `/ops` | No surprise lockouts | Low | P0 |
| Static fallback snapshots | Supabase pause or quota during judging | Demo and reports built into the Vercel deploy, hash-stamped | Read-only path survives | Low | P0 |
| Authenticated artifact ingest + identity checks | Results come back without worker secrets | PAT download; workflow/SHA/actor/title/spec-hash/file-hash checks | Trustworthy evidence, zero runner secrets | Medium | P0 |
| Spec integrity | Inputs are public and could be tampered with | sha256 in the DB, verified on the worker and in the manifest | Tamper detection | Low | P0 |
| Hosted budget broker ($40 ceiling) | Paid calls from the hosted app | Port reserve/settle to a Postgres transaction; port the broker tests plus the §6.9 tests | Hard stop; combined total ≤ $100 | Medium | P0 |
| Local cap ($60) | Split caps (OWNER) | Set the SQLite broker cap to $60 (config/governance edit, PENDING D13b) | Total ≤ $100 | Low | P0 |
| Diagnosis cache | Repeats cost money | Unique on input + model + prompt hash | Free, replayable | Low | P0 |
| Schema-validated model output | Model output is untrusted | Strict schema + server validator | No hallucinated citations shown | Medium | P0 |
| Prompt-injection defence | Page and speech text reach the prompt | Delimited data; no tools; constrained output; patch validator | Bounded impact | Low | P0 |
| RLS + server-only writes | Multiple users | RLS reads; service-role writes after ownership checks | Isolation | Low | P0 |
| Rate limiting | Free resources | `rate_counters` | Abuse bounded | Low | P0 |
| Kill switches | Outage or budget | `system_flags` read by routes and UI | Honest degradation | Low | P0 |
| Correlation IDs + structured logs | UI → API → GitHub → worker | `run_id` in run-name, logs and manifest | Fast triage | Low | P0 |
| Artifact caps + hashes | Big screenshots and logs | Caps, re-hash on ingest | Bounded, intact | Low | P0 |
| Immutable reports | Shared links must not change | Snapshot + sha256 | Trust | Low | P0 |
| OIDC worker callbacks | Per-step live streaming | `id-token: write` + JWT validation | Word-by-word progress | Medium | **P1, only if needed** |
| Supabase Realtime | Push updates | — | Nothing over polling here | — | CUT (P0) |
| Cursor pagination | Run history | Keyset | Scales | Low | P1 |
| Edge Functions, Redis, Kafka, CQRS, microservices, gateway, distributed locks, DLQ | No real problem | — | — | — | CUT |

---

## 8. Meta integration

- **Model:** `muse-spark-1.3` in Standard mode, via `POST https://api.meta.ai/v1/responses` (the existing client contract). CITED dev.meta.ai/docs/models, read 2026-10-28: the latest model, "Recommended for new work", supports structured output, 1,048,576-token context.
- **Mode:** Standard for every hosted diagnosis. Contributor only for owner-run evaluation on our own fixtures (D-29; terms §6.1–6.2).
- **Resources (OWNER):** the API key and the $150 credits exist, and the application ceiling is $100. **Real Spark diagnosis and patch generation are mandatory in P0.**
- **Authorization state:** no call is authorized *yet*. Each step below needs its own execution go-ahead.
- **Qualification sequence** (each step is gated on the one before):
  1. **Offline:** §6.9 tests green, with both ceilings read back.
  2. **Probe:** ≤ $0.05, local broker, owner go-ahead. It measures the `text.format` shape, latency, `usage` against the byte bound, the actual cost, and model availability. In the same session, the owner records the credit balance and that credits apply to `muse-spark-1.3` (D19), as `qualification_ref`.
  3. **Owner mode:** `diagnosis_mode=owner` on the hosted app, with the hosted key server-side only. The owner runs real diagnoses and patches live.
  4. **Public mode:** proposed separately after step 3 has measured costs, with its own caps. Never automatic.
- **Proposed spend plan** (all within the ceilings; for approval *after* the probe, from measured costs; INFERENCE at about $0.03 per diagnosis):

| Use | Broker | Plan | Calls (≈) |
|---|---|---|---|
| Qualification probe | Local $60 | ≤ $0.05 | 1 |
| Development (prompt, schema, validator against real output) | Local | ≤ $3.00 | ≤ 100 |
| Frozen R2 / R3 (PLAN) | Local | $1.50 / $0.50 | as frozen |
| Owner rehearsal, demo video, live judging sessions | Hosted $40 | ≤ $4.00 | ≤ 130 |
| Public mode, if later approved | Hosted | ≤ $5.00 (3 per user a day, a global daily cap) | ≤ 160 |
| **Planned total** | | **≈ $14** | Leaves ≈ $86 of the $100 ceiling unused, plus the $50 credit buffer |

- **Product consequence:**
  - **Live owner sessions:** real Spark runs live, with cost and model shown.
  - **Static demo:** genuine stored Spark outputs with full provenance.
  - **A public user's own run,** until public mode is approved: evidence plus deterministic findings, with "Live Spark diagnosis for public runs is pending qualification".
- **Hosted placement:** the call runs inside `POST /api/runs/[id]/diagnose`, under Vercel's 300 s cap (CITED). The client timeout is 120 s, and `maxDuration` is 150. If the probe measures latency over about 100 s, the per-call output cap comes down before anything else changes. Background or asynchronous responses are TO VERIFY and not relied on.
- **Structured output:**
  - Request field: `text.format` with a JSON schema. `response_format` does not configure structured output on Responses (CITED, structured-output docs).
  - The exact Responses shape isn't shown in the docs, so the qualification probe settles it.
  - Strict subset: the root is an object; every object has `additionalProperties:false` and lists all keys in `required`; nullable fields use `anyOf` with null below the root; no `oneOf`/`allOf`.

**Input evidence (product mode):**
```
{ "journey":[{step, keys, label}],
  "timeline":[{step, keys_ack, focus_before, focus_after:{role,name,id},
               speech:[{id,text}], silence:{id,ms}|null, app_events:[{id,type,target}]}],
  "signals":[{id, kind:"silence_after_visible_change"|"focus_to_body"|..., step, refs}],
  "axe":{violations, rules_checked},
  "source":[{path, lines:[{n,text}]}] }        // app-under-test files only, line-numbered; declared untrusted data
```

**Output schema (abbreviated):**
```
{ "verdict":"barrier_found"|"no_barrier"|"insufficient_evidence", "abstention_reason":string|null,
  "findings":[{ "step":int, "title", "user_impact", "mechanism", "evidence_refs":[string],
     "location":{"path","start_line","end_line"}, "confidence":"high"|"medium"|"low",
     "patch":{"diff","rationale","expected_speech_after":[string]}|null }] }
```

**Server validation:** a finding is downgraded when any of these holds:
- an evidence ref is unknown;
- a line doesn't exist;
- the diff doesn't apply;
- a patch rule is violated.

If every finding is invalid, the result counts as an abstention. The stored record keeps the model, mode, prompt hash, input hash, usage and cost.

**Reasoning boundaries:**
- Spark's output is a *Diagnosis* and a *Prediction*. Only a verify run yields "FIXED".
- `expected_speech_after` is displayed but is **not** the pass criterion. The deterministic verdict requires all three:
  - (a) the symptom is gone at the finding's step;
  - (b) the other steps are preserved (§6.5a);
  - (c) the evidence is complete.

**Cost (INFERENCE; replaced by MEASURED after the probe):**
- About 15k input tokens × $1.25/M ≈ $0.019, plus ≤3k output × $4.25/M ≈ $0.013, so **≈ $0.03 per diagnosis** (CITED prices, read 2026-10-28).
- Ceilings, not targets: hosted $40 and local/eval $60 (OWNER). Expected real use is far lower; the probe measures it.

**Credits (OWNER):** $150 of promotional credit is available and the application ceiling is $100, leaving a $50 buffer. During qualification the owner records the balance and that credits apply to `muse-spark-1.3`, once, not as a recurring question. Meta's spend limit only notifies and doesn't block (13 E11), so the brokers are the hard stop.

**Failure and fallback:**
- Retry creates a new reservation.
- A kill switch can turn diagnosis off.
- During an outage the demo workspace shows genuine stored diagnoses, labelled "Recorded diagnosis (model, date)".
- No substitute model is ever presented as Meta.

**Showing what Meta adds beyond the inputs:**
| Arm | What it does on Fernway | How it's shown |
|---|---|---|
| axe-core | 0 violations (MEASURED on the R2 development pages) | UI panel |
| Deterministic signals | Flag the symptom at a step | "detected by signal": an honest, strong detection baseline |
| Naive fix (always `role=alert`) | Wrong for focus loss | R3 negative control (the deliberately wrong patch) |
| Frozen R2 speech-only / visual-only arms | Causal contrast with the same model | Eval mode, private repo |
| **Spark (product mode)** | Mechanism + source line + minimal patch + abstention | R2 localization and R3 rescue on withheld pairs |

Meta's claimed contribution is localization to the source plus repair, verified by rerun. If R2 or R3 fails, the claim shrinks to "reviewer assistance" (PLAN kill check, 2026-10-31).

The R2 arms deliberately exclude the source code, while product mode includes it. So R2 supports "speech evidence carries causal signal", R3 supports "the product loop repairs", and the report says which evidence backs which claim.

---

## 9. Demo storyboard (about 3:00; confirm the official length before recording)

**Primary story:** a silent validation error on Fernway's passenger form. Universal: everyone has been blocked by a form. It maps to R2 pair 1 (the `role=alert` removal).
**Fallback:** focus lost when the seat dialog closes (R2 pair 2).

| Time | Beat | Screen | Live or replayed |
|---|---|---|---|
| 0:00–0:15 | "axe says 0 issues. A blind user can't book this ticket." | Landing | Recorded run, labelled |
| 0:15–0:35 | One-sentence product + the pipeline rail | Workspace | Live UI |
| 0:35–1:00 | Record the journey by keyboard, palette for the email field | Recorder | Live |
| 1:00–1:25 | Run: the stage rail advances, with a GitHub run link; on-screen card "≈3 min later" | Run | Live, time-skip labelled |
| 1:25–1:50 | Timeline: red error on screen, NVDA silent for 2 s; axe 0 | Timeline | Same live run |
| 1:50–2:20 | Spark diagnosis: cited evidence, the source line, a one-line patch, "Prediction (unverified)" | Findings → Fix | Live (recorded and labelled if the API is down) |
| 2:20–2:45 | Approve → verify run → FIXED, before/after speech | Verify | Live, time-skip labelled |
| 2:45–3:00 | Share the report: provenance (GitHub runs, NVDA 2026.2 A15, model, measured cost); "Hear what your users hear." | Report | Live |

**Recording rules:**
- Record from the laptop browser. NVDA runs only on GitHub VMs.
- Label every time skip.
- Replays carry "Recorded run · GitHub run N · date".
- Record a full genuine backup take on Nov 2–3.
- **Evidence behind each claim:** GitHub run IDs, manifest hashes, `diagnoses.input_sha256`, broker cost rows, verification checks JSON.
- **Never mocked:** speech, run IDs, timings, model output, costs, verdicts, axe results.

---

## 10. P0 / P1 / P2 / CUT

| Area | P0 | P1 | P2 | CUT |
|---|---|---|---|---|
| Web UI (Next.js) | Landing, workspace, run/timeline, findings, fix, verify, report (SSR), status | History pagination, dark mode polish, timeline playback at real timing | OG images | Session replay |
| Journeys | Keyboard recorder (iframe), step editor, palette, versions | Checkpoint polish | — | OS-level/mouse recording, free text |
| Backend | API routes, schema, RLS, state machine, idempotency, atomic admission (no queue), reconciler with lazy deadlines, capacity gates, owner dashboard, kill switch | Client error log | — | Edge Functions, Realtime, Redis, Kafka, microservices, frequent cron, run queue |
| Worker | `tabwise-run.yml` (contents: read), spec via inputs, R1/R2 primitives, screenshots, axe, manifest | OIDC live streaming (only if needed) | — | URLs/repos, local NVDA |
| Evidence | Private Storage, caps, hash checks, timeline | 30-day retention job | Zip download | — |
| Meta | **Real** Spark diagnosis + patch (mandatory), validator, cache; $40 hosted / $60 local ceilings with the §6.9 tests; qualification sequence; `diagnosis_mode=owner` live | `diagnosis_mode=public` (separate approval after measured owner-mode costs) | — | Wonder (deferred), Glimmer, SAM |
| Repair | Validator, worker applier, verify rerun, deterministic verdict | Owner-only patch editing | — | Auto-PR |
| Report | Immutable SSR report, print CSS, provenance + cost | — | Custom PDF | — |
| Demo workspace | Static snapshots of verified Fernway runs: evidence refs, GitHub run IDs, manifest hashes, model provenance and cost, limitations, verdicts. Works without Supabase | — | — | Fabricated activity; anything from the private eval repo or R2 withheld material |
| Regression | Journeys kept; before/after verify | Saved-journey rerun + "changed vs last good" | Rerun on push | — |
| Self-test | axe on our UI | NVDA journey on Tabwise's own UI | — | Certification claims |
| Evaluation | R2/R3 via shared modules (private repo); R7 | — | — | Recall/precision claims |
| Deploy | Vercel Hobby + Supabase Free (pending D17); static demo/report snapshots; capacity reserve | — | Custom domain | Paid tiers, add-ons, larger runners, metered anything |

P1 is not guaranteed. **All P1 is dropped if any P0 exit test is incomplete on 2026-11-01** (OWNER).

---

## 11. Date-wise roadmap (IST)

About 120.4 h from 2026-10-28T18:06:45Z (23:36 IST) to feature freeze (computed from `date -u`).

**Timezone check:**
- Official deadline: 2026-11-04 21:00 EST (UTC−5; US DST ends 2026-11-01) = 2026-11-05 02:00 UTC = **2026-11-05 07:30 IST**.
- Internal target: 2026-11-04 22:00 IST = 16:30 UTC = 11:30 EST, **9.5 h earlier**. Correct and safe.

| # | Task | Depends on | Deliverable | Exit test | Pri | Target |
|---|---|---|---|---|---|---|
| 0 | Owner approvals (§13) + free-tier recheck | — | Recorded in DECISIONS.md; limits table §6.8 re-read on the day | Every P0-blocking item answered; D17 asked | P0 | 10-29 12:00 |
| 1 | Shared contracts | 0 | JSON Schemas: journey, run spec, artifact manifest, evidence bundle, diagnosis I/O, verdict; palette; fixtures | Schema tests pass; worker, Next.js and eval all import one package | P0 | 10-29 |
| 2 | Fernway sample app | 1 | 3 flows (passenger form, seat dialog, search status), healthy and broken, pinned hash | axe 0 in every state; offline Playwright journeys pass; authored fresh (not from withheld fixtures) | P0 | 10-29 |
| 3 | Data plane | 0,1 | Supabase migrations, RLS, transition function, idempotency, `admit_run`, counters, flags, capacity snapshots | SQL tests: illegal transition rejected; duplicate key returns the same result; 2nd concurrent public run → 429; owner slot still free; overdue run timed out at admission; daily limit lowered without redeploy | P0 | 10-30 |
| 4 | Budget ceilings | D13b (no hosted dependency for the SQLite part) | SQLite cap → $60 + governance text; Postgres broker ($40); §6.9 tests | All §6.9 tests green offline; both ceilings read back; R1 tests unchanged and green | P0 | **10-30 (gates the probe)** |
| 5 | Worker (Codex authors) | 0,1,2, D15 | `tabwise-run.yml`, `scripts/tabwise-run.mjs`, applier, manifest, size caps | Fake-transport tests; **Claude's independent explicit verdict** on the §6.5 checklist, with the D15 BLOCK cleared; **owner approves and dispatches the first real Fernway run → complete, hash-valid artifact ≤ 4 MB** | P0 | **10-30 EOD (critical)** |
| 5b | Measurement | 5 | 5 owner qualification runs | Mean and worst wall time, stage times, bytes, API calls recorded (MEASURED); timeout and caps set from them | P0 | 10-31 AM |
| 6 | Dispatch + reconciler + ingest | 3,5, PAT (owner-authorized credential) + Supabase project (via MCP) | `POST/GET /api/runs`, cancel, artifact verification + Storage + delete | An owner-mode UI run reaches `completed` with stages shown and evidence stored; GitHub artifact deleted; public mode refused while `actions_policy_cleared=false` (test) | P0 | 10-31 |
| 6b | Ops dashboard + capacity gates | 3,6 | `/ops`, flags, thresholds, kill switch | Kill switch blocks new runs and diagnosis while existing evidence still renders; gates close admission at threshold (tests) | P0 | 10-31 |
| 7 | Next.js UI | 1 (built on recorded bundles first) | Shell, tokens, landing, workspace, recorder, run/timeline; static demo/report snapshot build | Keyboard-only golden path; axe 0 on our routes; static demo works with Supabase env removed | P0 | 10-31 |
| 8 | Real Spark diagnosis | 4 (§6.9 green), probe go-ahead, then dev allocation approval | Probe (≤ $0.05) + `qualification_ref`; diagnose route, schema, validator, cache; `diagnosis_mode=owner` | Probe MEASURED: cost, latency, `usage` vs byte bound, `text.format` shape, availability. Then a real dev run yields cited findings or an abstention; invalid refs rejected (unit tests) | P0 | 10-31 |
| 9 | Real patch + verify | 5,6,8 | Validator, applier, verify run, verdict function | Correct patch → FIXED; wrong patch → NOT FIXED (dev fixtures) | P0 | 11-01 |
| 10 | Report + static demo + status | 7,9 | `/r/[slug]`; static snapshot build from verified Fernway runs (D20); /status | Every number traces to a row or manifest hash; the build fails if a snapshot lacks run ID, hash, model provenance or limitations, or comes from the eval repo | P0 | 11-01 |
| 11 | R2 + R3 via shared modules | 5,8,9, D5, D6 | Private-repo runs, frozen predictions, scoring | Frozen thresholds applied; results recorded as they fall | P0 | 11-01 → 11-02 |
| 12 | Hardening | all | Every §6.7 row exercised | Scripted failure drills pass | P0 | 11-02 |
| 13 | Deploy | 7,10, D17 answer, deploy authorization | Vercel + Supabase prod (agent-operated where an authorized connection exists; only on explicit deploy approval) with `dispatch_mode=owner_only` | A cold visitor completes the static demo; a signed-in non-owner gets an honest `owner_only` response | P0 | 11-02 |
| — | **Feature freeze** | | | | | **11-02 23:59** |
| 14 | R7 independent check | 11 | LOG.jsonl record | Reviewer did not run the tests; no tuning | P0 | 11-03 |
| 15 | Demo + README + provenance | 13 | Video, docs | Every claim maps to evidence | P0 | 11-03 |
| 16 | P1 items | P0 green on 11-01 | — | — | P1 | only if green |
| 17 | Submit | 15 | CV platform | Submission confirmed | P0 | 11-04 22:00 |

**Critical path:** 0 → 1 → 5 → 5b → 6 → 9 → 11 → 14 → 15.

**Approval-gated path for the Meta step:** 4 (§6.9 tests green) → probe go-ahead → probe + `qualification_ref` → measured cost → dev allocation approval (from the §8 plan) → 8 → 9 → owner-mode live. Public mode is a separate later proposal.

**Approval-gated path for public dispatch:** Claude's independent PASS → owner approves the first dispatch → measurement (5b) → GitHub Support answer (D18a) → owner raises `dispatch_mode=public`. If there's no answer by 11-02, owner-only for the hackathon (§6.10).

**Note:** items 8–9 need the dev allocation approved by 10-31 AM. Real Spark is mandatory, so this is a **schedule** dependency, not a scope cut.

**Parallel lanes once item 1 exists:**
- data plane (3–4);
- worker (2, 5);
- UI (7), which is built against recorded bundles so it never waits for the worker;
- evaluation (11), which reuses 5/8/9.

**Scope-cut triggers:**
| Trigger | Cut |
|---|---|
| No real Fernway run by 10-30 23:59 | Judges' live runs dropped; owner-dispatched runs + artifact import; demo workspace becomes the primary path |
| Structured output fails | JSON in text + the same validator (still Spark) |
| Item 9 later than 11-01 | All P1 cut; report simplified |
| R3 fails | Claim becomes "Spark proposes, rerun decides"; NOT FIXED shown honestly |
| Recorder unstable | Step editor only; recorder moves to P1 |
| D17: Vercel says a prize counts as commercial | Escalate to the owner at once. Vercel is the chosen host and paid tiers are excluded, so this is a real blocker that needs an owner decision |
| No GitHub Support answer by 11-02 | Owner-only for the hackathon: static demo of verified runs + owner-dispatched live runs + demo video with live dispatch and live Spark (§6.10) |
| Dev Meta allocation later than 10-31 | Items 8–9 slip day for day; P1 cut first; real Spark stays mandatory |
| Any capacity gate at amber on 11-02 | Public daily limit → 0 until judging; owner runs only |

---

## 12. Top five risks and objections

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| 1 | Worker integration slips: safety review, the real binding of the capture adapter (Codex marks it BLOCK pending review), first real run | High / critical | Approvals on 10-29; owner-dispatched run 10-30; artifact-import fallback |
| 2 | PLAN kill-check dates already conflict: withheld flows plus fix/retest due 10-29 and the claim-scope freeze on 10-31, but R2/R3 land around 11-01/02 | Certain / high | Owner decides knowingly (D9). Thresholds unchanged |
| 3 | Spark's diagnosis or patch fails on withheld pairs, or NVDA under A15 doesn't speak the fixed live region | Medium / high | Abstention is first-class; deterministic verdict; fallback story; honest NOT FIXED |
| 4 | Two people, about 5 days, plus governance overhead | High / high | Contracts first; umbrella specs (D14); automatic P1 cut |
| 5 | Free tiers and policies during judging: Supabase pauses after 1 week inactive (CITED); a Vercel Hobby overrun locks a feature for about 30 days (CITED); Hobby is non-commercial only and a prize may count (D17); the Actions "serverless" example (D18); PAT expiry | Medium / high | Static snapshots for the read-only path; capacity gates + dashboard; ask Vercel (D17); owner-only fallback (D18); PAT expiry after judging; owner checks daily |

**Five strongest objections:**

1. **"It's BrowserStack's beta plus an LLM."**
   BrowserStack's page covers speech capture and assertions you write; it doesn't mention diagnosis, patches or verified reruns (CITED, 2026-10-28). Tabwise's unit of value is a *verified fix*.
2. **"It only works on your sample app."**
   True for this build, and disclosed. The worker contract is the base for the post-hackathon Action that runs on the user's own runner.
3. **"A15 isn't how NVDA users run it."**
   Disclosed on every result. Forms are operated in focus mode anyway. Default browse mode is unproven, and we don't claim it.
4. **"A heuristic finds silence, so why Meta?"**
   Agreed, and the heuristic ships. Meta does the localization to the source and the minimal repair, measured by R2/R3, and it can abstain.
5. **"Judges won't wait 5 minutes."**
   The demo workspace shows genuine runs instantly, live runs show real stage progress, and the video uses labelled time skips.

---

## 13. Decisions (state at 2026-10-29)

**Decided (OWNER):**
- **D1:** Next.js on Vercel, plus Supabase.
- **D2/D18:** public access at low caps, conditional. Public dispatch is disabled until the independent review and the policy assessment.
- **D3:** separate workflow, no OIDC by default.
- **D4:** fine-grained PAT, server-side only.
- **D7/D19:** qualification comes before any public inference.
- **D13/D13b:** $60 local + $40 hosted hard caps, with a $50 buffer from the $150 credits.
- **D16/D16b (revised 10-29):** Codex authors the worker, Claude reviews independently, Codex cannot self-approve, and the owner approves the first real dispatch.
- **D20:** static fallback.
- **Free-tier requirements:** 1–12.
- **Meta:** key and credits available. Real Spark is mandatory in P0.
- **IMPL (10-29):** lanes A+B+C approved now, with **Codex primary on all three**. Claude does only safety reviews and architectural conflicts.
- **Supabase via MCP (10-29):** agents perform every supported operation; the owner does no manual SQL or dashboard work.
- **D8:** approved. Independent `web/` lockfile; the root R1 lockfile and frozen sources stay unchanged; Docker optional; nothing unused gets installed.
- **D21:** 4 MB per run; 150 KB per screenshot; admission closes at 60% storage; 14-day retention; $0.10 worst-case hosted call cap; 3 public diagnoses per user per day, only if public inference is enabled separately.
- **D10:** Fernway, newly authored, kept separate from the withheld fixtures.
- **D15:** Codex owns the R2 adapter and binding. The BLOCK stays in force until independent cross-agent review clears it.
- **D22: NOT in P0.** No live-run request list. Priority goes to genuine execution plus the transparent recorded/static fallback.
- **Planning defaults:**
  - D7c, D4b, D13c, D5, D9, D11, D12, D14 are accepted as planning defaults.
  - Agent-operated wherever an authorized MCP connection exists.
  - Owner batch windows (D14) are replaced by agent-managed execution plans.
  - Explicit gates stay in place for sensitive operations.

**Still owner-gated (a per-action go-ahead in chat):**
- the first real dispatch (after Claude's PASS);
- the Meta probe (≤ $0.05), and activating each D7c allocation;
- each deployment;
- `dispatch_mode=public`;
- `diagnosis_mode=public`;
- creating restricted credentials.

**Owner-only actions:**
- D17: ask Vercel Support (blocks deploy).
- D18a: ask GitHub Support (blocks public mode only).
- D6: name the R2 labeler and the R7 reviewer.

---

## 14. Implementation plan (Codex primary)

1. **Lane A: contracts → data plane → brokers → API routes.**
   - Contracts first (§16.1).
   - Migrations: tables, RLS, transitions, idempotency, `admit_run`, modes, counters, capacity snapshots, Storage bucket.
   - Brokers: SQLite → $60, plus the $40 Postgres broker, with the §6.9 tests.
   - Routes: `/api/runs*`, reconcile + ingest, `/api/ops/*`, diagnose (gated).
2. **Lane B: Fernway → worker.**
   - Fernway's three flows.
   - The worker: `tabwise-run.yml` + `scripts/tabwise-run.mjs`, consuming the R1 send gate and `capture.mjs`.
   - Fake-transport tests, then **Claude's independent review**, then the owner's approval of the first dispatch, then 5b measurement.
3. **Lane C: product UI in `web/`.**
   - Shell, tokens, landing, workspace, run/timeline against a genuine bundle (R1 artifacts, labelled, until a Fernway run exists).
   - Then the recorder and the patch/verify view.
   - Then the static snapshot build.

**After that:** probe → owner-mode Spark → patch/verify → reports + snapshots → deploy `owner_only`. The public modes are raised later, by separate approval.

---

## 15. Exact implementation prerequisites

| Lane | Before starting | Before its exit test | Never without |
|---|---|---|---|
| A | Codex's pending `app/` ledger/CODEMAP edits landed; R1 baseline hashes recorded | Supabase dev project reachable through MCP (or local Supabase if Docker happens to be present) | Owner review of the AGENTS.md/PROTOCOLS cap text (D13b) |
| B | Contracts v0.1 merged; Fernway authored | D15 BLOCK cleared by independent review; Claude's PASS on §6.5 | **Owner approval of the first real dispatch**, recorded in DECISIONS.md |
| C | Contracts v0.1 merged; `web/` scaffolded with the D8 set | One genuine evidence bundle | Fabricated speech, runs, costs or verdicts, even as placeholders |
| Hosted | **Via MCP:** Supabase project, migrations, RLS, functions, bucket, verification. **Named exceptions** (account authorization, or no supported MCP operation; see §16.5): fine-grained PAT, Meta hosted key, GitHub OAuth app, Supabase Auth GitHub provider (TO VERIFY with MCP), Vercel project link + env (needs an authorized Vercel connection) | `dispatch_mode=owner_only`, `diagnosis_mode=off` on first deploy | D17 answered; deploy approval; no paid add-ons, branching or upgrades |
| Meta | §6.9 tests green | Probe go-ahead → `qualification_ref` → D7c activation | A broker reservation on every call; key in server env only |
| Public | Claude PASS + 5b | `policy_ref` (D18a) → separate approval per mode | Explicit owner approval |
| Eval | D5, D6, D9 | Frozen PLAN thresholds | Withheld labels in hosted or static output |

**Repository layout:**
```
app/
├─ packages/contracts/       JSON Schemas + palette + constants + fixtures — no runtime deps; own package.json/lockfile (ajv dev only)
├─ supabase/migrations/      SQL; supabase/tests/ SQL tests
├─ fixtures/fernway/         sample app
├─ scripts/tabwise-run.mjs   worker entry (+ scripts/tabwise/ helpers)
├─ .github/workflows/tabwise-run.yml
├─ web/                      Next.js app — own package.json + lockfile
└─ ci/r1-baseline.sha256     hashes of r1.yml, scripts/r1.mjs, root package-lock.json
```

---

## 16. Codex implementation handoff

### 16.1 Exact first engineering task
**Run the step 0 preflight on `main`, then build `packages/contracts` v0.1.**

1. **Preflight (on `main`):**
   - Land the pending `app/` ledger/CODEMAP edits (Codex commits when told; the owner pushes).
   - Write `ci/r1-baseline.sha256` with the hashes of `.github/workflows/r1.yml`, `scripts/r1.mjs` and the root `package-lock.json`. Add `scripts/check-r1-baseline.mjs`, which fails on any mismatch.
   - Create the worktrees `lane-a`, `lane-b` and `lane-c`.
2. **Contracts (lane A):**
   - ESM, Draft 2020-12, `additionalProperties: false` throughout, with `$id`s and a version constant `CONTRACTS_VERSION = "0.1.0"`.
   - **Schemas:**
     - `journey`: fixed journey IDs only;
     - `run-spec`: `run_id`, `journey_id`, `app_hash`, `variant` healthy|broken|patched, optional `patch_ref`, typed text drawn from the palette;
     - `artifact-manifest`: files, sha256, bytes, stage timings, runner identity;
     - `evidence-bundle`: the five lanes (speech, focus, keys, screenshot, axe) with stable `evidence_ref` IDs;
     - `diagnosis-input`;
     - `diagnosis-output`: Meta `text.format` strict subset, every property required, cited `evidence_ref`s, explicit abstention;
     - `patch`;
     - `verdict`: FIXED | NOT FIXED | INCONCLUSIVE.
   - **`palette.mjs`:** the only allowed typed strings, because workflow inputs are public.
   - **`limits.mjs`:**
     - 4 MB per run; 150 KB per screenshot; 65,535 characters of input;
     - storage closes at 60%; 14-day retention;
     - $0.10 hosted per-call cap; $60/$40 ceilings;
     - 2 public runs per user and 5 global per day; 1 public worker; 2 total.
   - **`encodeSpec`/`decodeSpec`:** base64 + sha256, round-trip.
   - **Fixtures:** valid and invalid for each schema.

### 16.2 File ownership and ordering
| Owner | Owns (sole writer) | Reads only |
|---|---|---|
| Integrator (Codex on `main`) | `docs/ledger/**`, `docs/CODEMAP.md`, `AGENTS.md`, `PROTOCOLS*`, `ci/**`, merges | everything |
| Lane A | `packages/contracts/**` (until v0.1 merges; later changes go through the integrator), `supabase/**`, `src/meta/**` broker change, `web/app/api/**`, `web/lib/server/**` | `src/r2/**` |
| Lane B | `fixtures/fernway/**`, `.github/workflows/tabwise-run.yml`, `scripts/tabwise-run.mjs`, `scripts/tabwise/**`, `tests/worker/**`; `src/r2/**` binding work under D15 | contracts |
| Lane C | `web/**` except `web/app/api/**` and `web/lib/server/**`; sole writer of `web/package.json` and its lockfile (install the D8 set once, at scaffold) | contracts, Fernway bundle |
| Nobody | `.github/workflows/r1.yml`, `scripts/r1.mjs`, root `package-lock.json`, R1 evidence | — |

- **No parallel edits to shared files.**
  - Lanes don't touch the ledger. Each lane reports to the integrator, which records the work.
  - Lane A asks Lane C for any dependency it needs in `web/`.
- **Order:**
  1. Preflight.
  2. Contracts v0.1 merged.
  3. A, B and C run in parallel.
  4. A's routes, once the migrations exist.
  5. B's ready-for-review, then Claude's review.
  6. Integration on `main`.

### 16.3 Acceptance tests
- **Contracts:**
  - every valid fixture passes and every invalid one fails for the intended reason;
  - unknown fields and out-of-palette text are rejected;
  - the spec round-trips with a hash match, and an oversized spec is rejected;
  - `diagnosis-output` uses only Meta's strict-subset keywords (keyword allow-list test);
  - the contracts import from `web/` and from `scripts/`;
  - `check-r1-baseline` is green.
- **A:**
  - illegal transition rejected;
  - duplicate idempotency key → same result;
  - 2nd concurrent public run → 429 `no_public_slot`, while the owner slot stays free;
  - overdue run → `timed_out` on admission;
  - lowering the daily limit applies without a redeploy;
  - kill switch → both modes off;
  - all §6.9 exposure tests green offline: concurrent reservations, failure accounting, retry = new reservation, combined ≤ $100;
  - existing broker and R1 tests unchanged and green.
- **B:**
  - Fernway: axe 0 in the healthy states, and offline Playwright journeys pass;
  - the worker on a fake transport produces a hash-valid manifest ≤ 4 MB;
  - a tampered spec, bad hash or non-palette text is refused before any keystroke;
  - non-loopback requests are blocked;
  - cancellation and timeout leave a terminal state;
  - the workflow has `contents: read` only and references no secrets;
  - `check-r1-baseline` is green.
  - **Then:** Claude's PASS on §6.5, then the owner-approved first real run: complete, hash-valid, ≤ 4 MB. Then 5b.
- **C:**
  - keyboard-only golden path;
  - axe 0 on our routes;
  - every displayed number traces to a manifest, row or hash;
  - the static demo builds and renders with the Supabase env removed;
  - the snapshot build fails without a run ID, hash, model provenance and limitations, and fails on any eval-repo source.

### 16.4 Dependencies between lanes
- **B and C → A:** both need contracts v0.1 first; that's the only hard start dependency.
- **A's routes → B:** the dispatch and ingest routes need the manifest schema (from contracts), not the finished worker. An end-to-end owner-mode run needs B's approved dispatch.
- **C → A and B:** C builds on the R1 genuine bundle, then on Fernway bundles from B, then on live routes from A. It never waits on either.
- **Meta diagnosis (A) → §6.9 tests (A):** the probe go-ahead comes after them. Patch/verify needs B's runs.
- **Eval (R2/R3):** reuses B's worker and A's diagnosis modules, and needs D5/D6.

### 16.5 Remaining true blockers
1. **First real dispatch:** blocked on Claude's independent PASS (§6.5), the D15 BLOCK being cleared, and owner approval.
2. **Real Spark:**
   - §6.9 tests green;
   - the owner's go-ahead for the ≤ $0.05 probe;
   - `qualification_ref`;
   - D7c activation.
3. **Restricted credentials (the owner must authorize or create these; agents can't create them through any supported API):**
   - fine-grained PAT (D4b);
   - Meta hosted key (D13c);
   - GitHub OAuth app (client ID/secret).
4. **Possible MCP exceptions (TO VERIFY against the connected tools before raising them):**
   - **Supabase:** enabling the Auth GitHub provider; the session's Supabase MCP shows SQL, migrations, projects, keys and docs, but no auth-provider config tool.
   - **Supabase project creation:** goes through the cost-confirmation step, which must show $0 on Free, and is subject to the 2-active-project limit.
   - **Vercel:** project link and env vars; no Vercel connection is confirmed.
   - **Branching:** avoid Supabase branching, which is not a free feature (INFERENCE; TO VERIFY).
5. **Deploy:** D17 Vercel answer plus deploy approval.
6. **Public mode:** D18a `policy_ref` plus separate approvals.
7. **Eval:** D6 people named.

---

**RECOMMENDED PRODUCT:** A hosted Next.js web app (Vercel + Supabase, GitHub sign-in). It runs real NVDA keyboard journeys on disposable GitHub-hosted Windows VMs, diagnoses barriers with **real** Meta Muse Spark 1.3 inference, and proves the patches it proposes with a real rerun. It ships owner-dispatched and owner-diagnosed, and opens to public runs and diagnosis only through separate, gated approvals.

**WHAT WE WILL BUILD:**
- a keyboard journey recorder and step editor for fixed journeys on Fernway;
- remote NVDA runs with stage progress;
- a five-lane evidence timeline with an axe comparison;
- real, cited Spark diagnoses with abstention, and minimal patches;
- human approval, then a verify rerun with a deterministic verdict;
- atomic admission (no queue, no auto-retry), with modes and automatic downgrade;
- an owner-only limits dashboard and a kill switch;
- immutable reports, and a static demo of verified runs that doesn't depend on Supabase;
- R2/R3 through the same modules, from a private channel.

**WHAT WE WILL NOT BUILD:** arbitrary URLs; customer repos (the BYO Action is the long-term compliant worker); local or desktop NVDA; self-hosted runners; a live-run request list (D22); Wonder; Glimmer; Edge Functions, Realtime, frequent cron or a run queue; keep-alive automation; paid tiers, add-ons, branching or larger runners; conformance claims; auto-PRs.

**WHAT ALREADY WORKS:**
- real NVDA capture on GitHub-hosted Windows (R1 PASS, A15 profile only);
- the guarded send path;
- the budget-guarded Meta client (SQLite);
- the R2 offline contract, preparation and capture adapter (offline; real binding BLOCKED pending independent review);
- an axe baseline of 0 on the development pages;
- the Meta key and $150 of credits (OWNER).

**WHAT MUST BE PROVEN:**
- combined Meta exposure ≤ $100 (tests);
- Claude's independent PASS on the worker;
- a real Fernway run with a hash-valid artifact, plus measured duration and size;
- a real Spark structured-output diagnosis that cites real evidence;
- R3 (FIXED / NOT FIXED on real reruns);
- R2 with an independent labeler;
- R7;
- the static demo without Supabase;
- GitHub's answer on public dispatch (or owner-only).

**WHAT WE SHOULD IMPLEMENT FIRST:** Codex runs the step 0 preflight, then `packages/contracts` v0.1 (§16.1). Lanes A, B and C then run in parallel worktrees under §16.2 ownership.
