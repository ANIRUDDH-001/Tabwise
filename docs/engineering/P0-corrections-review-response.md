# P0 corrections and qualification checkpoint

Run ID: `p0-corrections`. Classification: **MEASURED, MACHINE/L0**, same-agent engineering. Spark replay remains MODEL/L1. This is a response to the supplied independent findings, not cross-tool approval, native qualification, or R7 acceptance. Supersedes the engineering conclusions of `P0-reliability-checkpoint.md`; historical raw evidence is retained.

## Finding disposition

| Finding | Disposition | Change and evidence |
|---|---|---|
| A1: modified pinned Fernway source | FIXED locally | Original `index.html` restored to its exact HEAD blob; normalized hash remains `5ad4631558cdcc557770ae864957ffc167546cd0af58bd11258808e1c0e523be`. Rich page-authored instrumentation lives separately in `fixtures/fernway/instrumented-v2/` with its own manifest. `p0-fixture-integrity.test.mjs` checks both independently. |
| A2: v1 focus strings could certify FIXED | FIXED locally | Both terminal snapshots must declare v2 and establish connected, consistent node identity. The baseline must actually be body. Rerun restoration requires the connected button with unique ID `choose-seat`, matching node key and active string. Missing, detached, contradictory, ID-less radio and spoofed identities cannot certify repair. Legacy projection/display remains readable; acceptance is INCONCLUSIVE. |
| A3: page overrides could change recorder identity | FIXED within documented boundary | v2 captures native body/localName/connected/parent/closest/labels accessors before page scripts. DOM attributes and names retain explicit `name_trust: page-authored-dom`; they are not an accessibility-tree computation or native speech. Captured primitives do not protect against a page executing before the init script. |
| A3: names, IDs and size limits | FIXED locally | Native event targets never exceed 200 characters. Over-bound identity/name data and ambiguous label references make captures incomplete. Duplicate element IDs remain visible as `id_unique:false`; the oracle refuses duplicate opener identity. Export refuses text over 16,000 characters and targets over 200 without truncating accepted records. Event and full-snapshot byte caps refuse overflow. |
| A3: ordering, detached/missing/duplicate nodes and terminal state | FIXED locally | Existing provider/journal prefix, trust, clock and completeness checks retained. New isolated Chromium tests exercise overrides, caps, stable duplicate node keys, missing/detached related nodes and terminal state. The historical Fernway page drives correct/wrong pure-oracle controls from actual browser snapshots. |
| A4: optional reasoningEffort | FIXED retained | Existing source correction and compile-only default caller remain; typecheck and genuine Turbopack build pass. No live provider call. |
| A4: cwd-dependent raw-source loading | FIXED locally | Reviewed loader first resolves relative to its own raw module and uses explicit source-package candidates for bundled runtime. Policies use that same root. Allowlisted CLI names remain enforced. Unrelated-cwd and missing-source package checks pass; missing files refuse. |
| A4: broad API tracing | FIXED locally, bounded residual breadth disclosed | Exact reviewed source/digest closure retained. Includes narrowed from `/api/**` to admission, run readers/reconciliation/diagnosis and verdict routes. Actual build: 9 of 40 route traces include raw policy sources, zero private cache/.env/.git paths. Next's installed tracer uses `contains:true`, so parent run-route inclusion also covers cancellation/repair-input paths. No whole-project include or ignore workaround added. |
| Hosted Vercel runtime | UNRESOLVED hosted | Connector now sees Tabwise project metadata and its ERROR deployment. Exact deployment-events query still returns404 with and without the reported team ID. No hosted logs or successful deployment can be claimed. Local build/package checks are separate evidence. |
| R2 timing/owner custody | UNRESOLVED native | Existing unfinished diagnostic source preserved, 50 offline tests pass. No hosted timing observation exists for this candidate; no causal diagnosis of the original timeout is established. |
| R3/R7 acceptance | UNRESOLVED | No qualified distinct native rerun, withheld assessment, independent oracle acceptance or independent reviewer PASS. |

## Source and historical binding

The production `/fernway` route, diagnosis source loading, patch review and hosted `apps.fernway.base_sha256` continue to name the original source. The read-only database query returned its original pinned digest. Existing native artifacts and R1 records were not rewritten. The prepared R2 plan remains the existing validation candidate, not a Fernway plan. No plan or artifact was silently rebound to the instrumented fixture.

The instrumented-v2 browser checks explicitly load the new file. Its `__tabwiseFocusSnapshot` remains page-authored display/development instrumentation. A future native run must bind its chosen exact fixture through a newly reviewed plan and artifact identity; merely selecting this file does not grant execution. The runner-owned v2 recorder can observe the original fixture independently of page-authored instrumentation.

Raw historical Fernway behavior matters: a programmatic close while an ID-less radio retains focus can leave that radio as terminal focus. That observation is not body and must remain INCONCLUSIVE under this body-focus oracle. The passing correct/wrong browser controls use actual isolated Chromium button interactions. None are NVDA evidence.

## Acceptance evidence

All outputs are under ignored `cache/p0-corrections/`. Initial Git HEAD/index/worktree patches and STATE were archived before corrections. `acceptance-summary.json` and `source-manifest.json` contain commands, counts, digests and file identities.

| Command/check | Actual result |
|---|---|
| `npm test` at repository root | 1,211 tests; 1,208 PASS, 0 FAIL, 3 database opt-in SKIP |
| `npm test` in web | 151 PASS, 0 FAIL, 0 SKIP |
| `npm run typecheck` in web | exit0 |
| `npm run build --prefix web` | Next.js16.4.3 Turbopack, exit0; no tracing warning |
| Provider + original/new focus browser tests | 184 PASS, 0 FAIL, 0 SKIP |
| Owner-query external/boundary/zero-key/supervisor tests in preserved diagnostic worktree | 50 PASS, 0 FAIL, 0 SKIP |
| Disposable PostgreSQL lifecycle/concurrency tests | 3 PASS; these discharge root's 3 opt-in skips separately |
| Existing SQL regression scripts | 8 PASS |
| Fresh migration replay | 9 migrations on each of 3 fresh databases; 27 applications PASS |
| Atomic four-migration fault/rollback and commit | PASS; failed transaction leaves no new table and restores prior review function; committed transaction has 4 RLS tables |
| Production-module recorded Spark/SQL/browser replay | 13 checks PASS, explicitly SIMULATION/REPLAY; incomplete native result retained |
| Frozen R1, project preflight | PASS |
| Deployment trace-only raw imports + exact R2/qualification digests | PASS |
| Unrelated cwd, missing raw source, built admission refusal | PASS; built HTTP503 `r2_admission_disabled` |
| Whitespace/diff | See final summary; no threshold or approval/status promotion |

RED evidence precedes oracle, export, fixture and cwd fixes. Recorder adversarial reproduction initially had 6 failing cases and one already-passing cap case. A syntax error in the first test draft was corrected before recording that reproduction; it was not treated as a defect reproduction. All failed/intermediate logs remain local.

Test policy changes are explicit: the earlier newly staged legacy-v1 test incorrectly expected FIXED; its expectation is strengthened to INCONCLUSIVE. The existing lifecycle positive fixture now supplies complete v2 identity and its wrong-rerun fixture updates identity consistently. The browser long-name test now tests the exact 256-character display bound, with a separate 1,024-character refusal test. No original security negative, acceptance threshold or frozen R1 test was removed or weakened.

## Product and next boundary

Read `P0-hosted-and-probe-readiness.md` for the disconnected workflow path, exact hosted migration/configuration requirements, diagnostic probe binding and failure limitations. Read `P0-R7-review-package.md` for the independent-assessment handoff. Corrected source is a local candidate only. Publication, workflow registration, native execution, hosted migration/configuration and fresh Meta evaluation remain separately gated.

A truthful complete saved-journey → admitted native run → persisted diagnosis → approved repair → qualified rerun demonstration is **not possible yet**. A labelled browser/replay engineering demonstration is possible; no video production was started.
