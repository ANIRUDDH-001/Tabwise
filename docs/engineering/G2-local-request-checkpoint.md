# G2 local request/API/SQL/UI checkpoint — not accepted or native-qualified

MEASURED engineering, MACHINE/L0; evidence directory `cache/g2-local/`. Local checkpoint permission: owner explicitly waived pre-commit review for local checkpoints only; independent review remains required before publication or execution. No hosted migration, dispatch, NVDA, paid model call or deployment was performed.

## Delivered source

- `20261103040000_native_product_requests.sql`: immutable private spec/plan/fixture/request records, ownership RLS, service-only preparation/state RPCs, exact source/step digests, row-lock concurrency, unique execution correlation and audit trail. States PREPARED → DISPATCH_INTENT → DISPATCH_UNKNOWN/DISPATCH_ACCEPTED → RUN_BOUND are metadata only; no native authority is issued.
- `/api/runs/[id]/native-request`: real signed-in owner and same-origin boundaries, trusted server-side candidate context and persisted preparation/readback. It operates on an already admitted owned run; it does not bypass admission or create an executable approved plan. Missing migration/configuration refuses.
- `native-request.mjs`: persistence adapter and a controlled-send coordinator retaining GitHub200 run details. One intent wins; uncertain outcomes never automatically resend. No live route calls the sender.
- `native-binding.mjs`: signature-verified GitHub OIDC/source/actor/run/attempt/plan/fixture matching for a previously correlated execution, then service-only RUN_BOUND persistence. Invalid callers are refused before privileged client construction. This handler is tested locally but is not mounted as a production worker endpoint.
- `request-package.mjs`: exclusive candidate source/spec/plan materialization from persisted bytes and validation through the existing worker fixture loader. It cannot change approval/status files or launch a runtime.
- `NativeRequestPanel`/`LiveRun`: preparation versus uncertain/bound states, explicit evidence warning, no native-dispatch button and no automatic resubmission. Primary status no longer presents A15 jargon. Account/API state is separate from evidence qualification.
- `product-dispatch.mjs`: CLI parser now loads via the reviewed raw-source loader, avoiding a reproducible static-import Turbopack tracing failure.

## Actual verification

| Check | Result |
|---|---|
| Root `npm test` |1211 total;1208 PASS/0 FAIL/3 existing DB opt-in SKIP |
| Web `npm test` |172 total;171 PASS/0 FAIL/1 new DB opt-in SKIP |
| New DB integration opt-in |1 test PASS separately, with multiple assertions described below |
| Focused dispatch/bridge service tests |18 PASS |
| Signed binding unit tests |2 PASS; generated fixture signing keys, not production credentials |
| Fresh PostgreSQL18 |10 migrations and8 existing SQL regression suites PASS; cluster stopped exit0 |
| Typecheck / Next16.4.3 Turbopack |PASS; corrected final build has no whole-project tracing warning |
| Isolated Chromium against production Next server |4 controlled-API UI scenarios PASS; not real account/native evidence |
| Trace-only deployment package |Exact raw imports/digests, unrelated cwd, missing-source refusal and built admission HTTP503 PASS;41 route traces/10 raw-source routes/0 private paths |
| Frozen R1 / preflight / whitespace |PASS; no new R1 execution |

The HTTP→PostgreSQL integration uses controlled fixture authentication, real SQL transactions/permissions and generated OIDC signatures. It covers six simultaneous preparations converging on one mapping; foreign user and unsigned caller refusal; changed request conflict; lost-response state with no resend; accepted-ID idempotency/conflict; cross-request unique run IDs; authenticated-role RLS and RPC denial; RPC execution as service_role (BYPASSRLS fixture matching the hosted role model); signed worker claim and duplicate recovery; exact candidate delivery through the worker's loader; tampered source and overwrite refusal. It does not validate deployed Supabase cookie/provider authentication.

Root's three legacy DB opt-ins were not rerun in this slice. Web's new opt-in was executed separately. Do not sum overlapping suites or call the test envelopes genuine native observations.

## Failures encountered and corrected

1. Initial missing API module/export tests were RED before the corresponding implementation.
2. Local HTTP test adapter omitted its ephemeral port, causing legitimate same-origin403; adapter corrected rather than relaxing origin checks.
3. PostgreSQL preparation failed on an ambiguous `n` row/index variable; qualified the action ordinal as `t.n`, then reran the same integration.
4. Web regression found missing human copy for new method/error codes; copy added, negative test retained.
5. Turbopack failed resolving direct CLI imports and warned about whole-project tracing; changed the import boundary to the existing allowlisted reviewed loader, preserving narrow tracing. No ignore workaround.
6. A package check started before its copied source tree existed; verification orchestration was made sequential. Final package check passed. This was a local harness dependency error, not hosted evidence.

## Deliberately unresolved before production use

- G2 is not complete/accepted: saved-version admission→native dispatch wiring, authenticated production worker endpoint, native artifact discovery/attestation/ingestion and full durable storage lifecycle remain to be independently reviewed and completed.
- Normal run-ID response correlation is implemented as a controlled seam. Recovery from a lost response still requires reviewed request-delivery/worker-correlation authorization; absent that association, it fails closed. There is no exactly-once external-job promise or lease-based automatic retry.
- Candidate plan path/bytes are unapproved development output. The native reviewed source scope must include all new adapters/SQL/claim code before any execution approval; existing native status and W5 gates remain disabled.
- RUN_BOUND means identity metadata matched, not input custody, native evidence, accessibility verification or repair acceptance. GitHub-origin and native qualified attestation checks remain distinct.
- The SQL is new and local-only. Hosted migration/RLS/provider/runtime behavior has not been measured. Service-role use must remain server-only; token/body/error bounds require independent security review.
- Client tests use controlled API responses; the deployed account flow and Vercel Node26/runtime package remain separate acceptance checks. Original localhost3100 output was restored and HTTP200 confirmed.
- Historical R1 A15 PASS is retained. Genuine R2, distinct native R3 repair rerun and independent R7 remain unevaluated by this slice.

Publication, hosted SQL/config changes, workflow dispatch/native input, new spending and acceptance claims remain separately gated despite permission for local checkpoint commits.
