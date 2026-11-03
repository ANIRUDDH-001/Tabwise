# G2 focused corrections — independent re-review required

MEASURED MACHINE/L0, local engineering only. The corrected candidate is uncommitted against `5e28cf2f667c6282dc6d6a987304db83290b733c`; both reviewed checkpoint commits remain intact. No G2 functional acceptance or native qualification is asserted.

## Review dispositions

1. Exact page identity: `product-dispatch.mjs` and preparation RPC now require the exact Fernway flow/variant query, including on SQL replay. Missing, empty, wrong-flow and wrong-variant tuples refuse. JS negatives and direct real PostgreSQL RPC negatives execute independently of client validation.
2. Saved-run bridge: the existing authenticated `/api/runs` admission route prepares baseline native requests using the existing preparation handler. It does not activate a sender. The saved version must match the admitted run. A preparation interruption returns the persisted run ID; the same admission key recovers that run. Native request records bypass legacy workflow reconciliation. Existing dispatch-unknown/no-resend invariants remain in force.
3. Stored variant: the live context builder validates the stored run-spec and selects healthy/broken from it. Patched, unknown and missing variants refuse. Existing timing, plan path, fixture source and repair dispatch branch remain unchanged.
4. UI eligibility: API exposes explicit can_prepare only for eligible admitted baseline runs without a native request. The panel requires this permission and resets stale state on refresh. Terminal/ineligible runs refuse before context construction.
5. Candidate recovery: exclusive creation writes an exact reservation; explicit recovery validates reservation, tree, existing file bytes and worker fixture loading before the final marker. No overwrite of corrupt partial bytes; missing reservation requires a fresh destination. Injected failures at all five writes and corrupt-byte refusal pass. This is process-interruption recovery, not an fsync/power-loss durability claim.

## Measured verification

Evidence: `cache/g2-corrections/` (raw logs, JSON and scripts), packaged in `cache/g2-correction-review/`.

- Focused command: `node --test web/test/g2-query-correction.test.mjs web/test/native-request-api.test.mjs web/test/package-recovery.test.mjs`: 25 PASS, 0 FAIL.
- One final full acceptance pass, production candidate settled: root `npm test`: 1211 total, 1208 PASS, 3 existing database opt-in skips; web `npm test`: 193 total, 192 PASS, 1 database opt-in skip. Zero failures. Skipped G2 database test subsequently executed against disposable PostgreSQL.
- `npm run typecheck` and `npm run build --prefix web`: PASS. Frozen integrity and preflight: ok=true. Original pinned Fernway and frozen R1 remain unchanged.
- `python cache/g2-corrections/postgres.py`: PostgreSQL18, 10 migrations, 8 SQL suites, G2 integration test PASS, cluster stopped cleanly. Latest targeted rerun includes the preparation-interruption recovery scenario.
- `node web/test/native-route.production.mjs` (via driver): 5 production route scenarios PASS. Real built Next routes and real Supabase client/cookie handling; synthetic provider boundary backed by real disposable PostgreSQL. Foreign-owner refusal, admitted/preparation interruption recovery, same-key replay, persisted readback and terminal refusal. Run ID: `0e6dcf63-e9ed-4a5f-8772-68aeed4b3c09`; measured outbound attempts 0 / GitHub dispatches 0. Not a hosted Supabase authentication test.
- `node cache/g2-corrections/browser.mjs`: isolated Chromium, 5 production UI scenarios PASS with controlled API responses. This is separate from the real route/database integration.
- `node web/test/deployment-trace.check.mjs cache/g2-corrections/turbopack-output` and `node cache/g2-corrections/hosted-package-check.mjs`: PASS. 41 traces, 10 raw-source routes, 0 private paths; unrelated-cwd imports, missing-source refusal, built admission HTTP503. Narrow tracing config unchanged. Hosted Vercel runtime remains unverified.
- Full suites were not repeated after test-only provider auditing/failure injection. Targeted PostgreSQL/production-route tests were rerun. No production source changed afterward.
- Existing localhost3100 build restored, HTTP200; checked build retained separately.

## Failures corrected during this cycle

New query/context assertions exposed the old permissive query and hardcoded variant behavior. Package-write injection exposed absent recovery. The route harness additionally failed on Windows file import URLs, Unicode SQL transport and mismatched localhost/127.0.0.1 Origin; corrected test harness uses file URLs, UTF8 stdin and the actual server origin, preserving production origin checks. Frozen returned request objects required cloning before negative mutation. These harness corrections did not lower production gates or test thresholds.

## G1 custody refinement — separate worktree

Preserved worktree: `C:/Users/ANIRUDDH/.codex/worktrees/tabwise-owner-query-trace/app`. New candidate only: `diagnostics/r2-native/candidates/abort-correction-20261103/`. Six synthetic cancellation/path-custody tests PASS; no native process or read-only OS probe launched. Candidate handles pre-abort, abort during launch/running, absent close and throwing kill with one termination request and bounded cleanup. A new path-custody test failed before fixing the nested candidate's reference to the original preserved PowerShell script. Original diagnostic implementation and source inventory are unchanged; candidate is unreviewed and not integrated.

Direct-child close cannot establish descendant containment or physical quiescence. The candidate always reports physical_quiescence_verified=false. No-close/kill-throw outcomes retain containment_required=true. Exact owner-query call/return and clean owned-PID result on an authorized isolated runner are still missing. Existing failed artifact and all unfinished worktrees remain intact. No timeout increase, retry, native ownership relaxation or raw-stderr custody claim is made.

## Remaining blockers and next authorization

Independent ChatGPT review of this exact source/diff is next. No new execution authority is requested by this packet. Hosted migration/auth and hosted Vercel runtime checks remain separate owner-controlled work; no hosted migration or deployment occurred. Worker-binding endpoint, exact published workflow/revision/run/attempt correlation, dispatch sender activation and complete artifact ingestion remain outstanding. No workflow identity substitution or second producer was introduced.

R1 historical acceptance remains frozen. R2 needs independently cleared source plus an owner-authorized exact read-only diagnostic execution and measured custody/owner-query outcome before any native qualification. R3 depends on qualified R2 source-bound baseline/repair evidence and owner oracle. R7 depends on independent source/artifact review and those qualified R2/R3 results. Local green checks establish engineering behavior, not end-to-end native acceptance.
