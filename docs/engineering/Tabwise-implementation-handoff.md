# Tabwise implementation checkpoint — TW-01 / D-59

Status: **PARTIAL implementation. No live worker, Spark result or verified Fernway repair is claimed.**

Authority: owner's pasted October 29 implementation request, local `TABWISE-PRODUCT-DIRECTION.md`, D-59 through D-63. Implementation proceeds sequentially on `feat/TW-01-contracts`; inherited work remains uncommitted. Supabase operations are restricted to **ueobjrtvsgvkigmjxkks**, the dedicated Tabwise project in Mumbai. The selected Portfolio organization reports Free. No other project's configuration or data was accessed.

## Implemented

- Preflight preservation: original 31 modified/untracked files copied and hash-checked outside Git; source direction document mirrored from its parent location and its authorization introduction corrected. Recovery path is recorded in `%TEMP%/tabwise-implementation-backup.txt`.
- R1 baseline anchored to successful A15 revision `0c93fa73e0c111a2df65302adfe0006d63f50a39`, workflow run `40716824856`. `ci/r1-baseline.sha256` records Git blob hashes; the checker allows only Git's text CRLF conversion. A separate raw-byte seal covers 65 pre-existing frozen files and reports zero changes. R1 source, settings, fixtures, thresholds, original tests, root lockfile and historical evidence remain unchanged.
- Contracts v0.1: eight Draft 2020-12 schemas, strict unknown-field validation, palette, resource limits, encoded workflow envelope bounds, SHA256 spec round-trip and artifact validation. Timeline lanes are keys/focus/speech/app events/screenshots; axe is separate. Four verification verdicts. Meta's narrow strict schema is separately derived and keyword-tested; provider acceptance awaits the approved probe.
- Lane A: four migrations applied through MCP; RLS and server-role-only mutations; atomic admission/idempotency, owner slot, deadlines, leases, capacity gates, kill switch, immutable versions/reports and a hosted reservation broker. The private evidence bucket has a 4,000,000-byte object limit. Server code includes auth/OAuth boundaries, ownership checks, dispatch/cancel/status/diagnose and ops routes, bounded ZIP reading, artifact identity/hash checks and reconciliation. These live adapters have **not** been exercised against GitHub or Meta.
- SQLite cap defaults to $60. Legacy explicit `$100` callers safely saturate to $60 for original-test compatibility; intermediate values above $60 are refused. Settlement above reservation retains exposure and persists an alarm blocking further local reservations. The hosted hard cap is $40 and the per-call cap is $0.10.
- The existing Meta wrapper now supports async brokers, bounded request bytes/time and `text.format`; diagnosis uses `muse-spark-1.3`, evidence references and explicit abstention. All inference tests use fake HTTP. There are no genuine Spark outputs yet.
- Lane B: newly authored Fernway passenger, seat and search flows; healthy/broken variants; pinned source hash. Offline worker contract composition, exact-context bounded patch applier, loopback predicate and deterministic verdict helper. The new workflow is a **refusal scaffold**. It is not a completed live worker or a review-ready real binding.
- Lane C: Next.js UI, local palette-only recorder/version saving, static workspace, genuine historical R1 trace/report, five lanes, honest missing evidence, model/patch/verify pending states, live-status shell and owner controls. Independent `web/` lockfile; builds without Supabase environment variables. R1 source bytes and hashes are included in a validated build snapshot.

## Measured verification

MEASURED / MACHINE-L3, run_id `tw-impl-20261029`:

| Command or check | Result |
|---|---|
| `npm test` | 331 passed, zero failed |
| `npm --prefix packages/contracts test` | 21 passed, zero failed |
| `npm --prefix web test` | 18 passed, zero failed |
| `npm --prefix web run build` with Supabase environment removed | Passed, including TypeScript and static demo/report generation |
| `node scripts/tabwise/check-web.mjs` against production server | 13 routes, zero axe violations; palette-only local save and four mobile views passed |
| Fernway test, included in root suite | Three flows × healthy/broken; keyboard paths and axe initial/final states passed; no NVDA |
| `node scripts/check-r1-baseline.mjs`; `node scripts/preflight.mjs` | Passed |
| Private `verify-private.mjs` | Seal `682dd9c80b85a0eba487dbf6eb1d571a88bb756a2d8b83d678f1c333151a40f9`; reproduction/export byte-identical |
| Frozen raw-byte seal | 65 files checked, zero mismatches |
| Local concurrency test | 50 competing processes; no cap overshoot |
| Hosted concurrency through MCP | 50 concurrent reservations against a temporary synthetic ceiling; ten admitted, total reserved exactly at that ceiling; no Meta sends |
| Hosted failure accounting | Missing usage retained; above-reservation settlement rejected/alarmed; retry allocated a distinct reservation |
| SQL tests in `supabase/tests/` | Admission, idempotency, owner slot, deadlines, dynamic limit, kill switch, RLS isolation, browser/RPC denial, immutable report and disabled diagnosis passed, test data rolled back |
| Client bundle secret-name scan | No `SUPABASE_SERVICE_ROLE_KEY`, `GH_PAT`, `MODEL_API_KEY` or Meta approval reference |
| `npm run spend` | Local spent $0, reserved $0, cap $60 |
| Dedicated hosted ledger after test cleanup | Ceiling 40,000,000,000 nano-USD; spent/reserved zero; no run or reservation rows |

Hosted concurrency used one explicitly synthetic failed-run row. Admission and settlement calls never sent inference. Cleanup removed only that test's reservations/run and restored the $40 ceiling. Production diagnosis remains off, dispatch is owner_only and worker review is PENDING.

The initial browser checks found heading, landmark-name and contrast defects, and a recorder start-message race; these were corrected before the final passing check. Newly authored test initialization was corrected to use the explicit browser context required by axe. The four-verdict fixture was strengthened to supply consistent checks. No inherited test was edited or weakened.

Supabase security advisory: seven server-only tables intentionally have RLS enabled with no browser policy, and browser grants revoked (INFO level). This is default deny, not missing access for an intended browser path. [Supabase advisory explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). No other security advisory was returned in this check.

## What remains blocked or unfinished

1. **Real binding:** the frozen key/character mapper and queued speech collection conflict with a naive R2 provider. See `Tabwise-worker-binding-blocker.md`. No guard deadline or frozen source was relaxed. Claude's conditional architecture review against the sealed88-file snapshot is preserved. All seven findings are reconciled in Tabwise-Claude-reconciliation.md; newer corrections still need independent safety review.
2. **Worker completion and qualification:** real provider/loader, screenshots/axe collection, persisted journals and teardown need implementation/review; then Claude PASS and separate owner approval of the first dispatch. Current workflow intentionally refuses. No A15 Fernway claim exists.
3. **Credentials/auth:** fine-grained PAT, restricted hosted Meta key and GitHub OAuth client remain owner-gated. The exposed Supabase MCP has no Auth-provider configuration tool; this is the named unsupported configuration exception. Existing publishable keys may be read through MCP, but none was created or copied here. No Vercel deployment or environment configuration was performed.
4. **Repair integration:** patch approval/transport into a public spec, applying the approved patch in the real worker, genuine before/after verification and verified Fernway report publication remain unfinished. Offline patch/verdict functions are not substitutes for these runs.
5. **Live integration:** server reconciliation/ingest/diagnose adapters and owner controls need authenticated end-to-end qualification. Partial failed-run artifact ingestion and sustained cleanup/retention need completion before live exposure. Broker and demo/verifier code still require independent review under project policy.
6. **Meta:** probe authorization, actual credit applicability record and allocation activation still gate every real call. Mandatory real Spark P0 has not been waived or replaced by synthetic output.

No commits, push, deployment, live dispatch, Meta API call, credential creation or paid upgrade occurred. FEATURES entries and frozen evaluation thresholds were not changed.

## D-63 checkpoint update

See [finding reconciliation](Tabwise-Claude-reconciliation.md) for every F-1 through F-7 and [narrow observer preparation](Tabwise-observer-qualification.md) for the blocked qualification protocol. Input/provenance/integrity/review/attempt refusals, observer and press-only executor candidates, in-memory network isolation, source-bound atomic diagnosis/patch persistence and complete archived-source coverage are implemented and regression-tested. Worker typing and all live execution remain refused. Baseten stays a separate deferred resource; no key was accessed and no expense was incurred.

Latest MEASURED checkpoint: root331/331; contracts21/21; web18/18; production build passes;13 browser routes have zero axe violations; keyboard-only local save/mobile pass. The observer tests use fakes. The network browser test uses only owned loopback pages and its sink receives zero requests. Frozen65/private/preflight checks pass. Current source hash is5ad4631558cdcc557770ae864957ffc167546cd0af58bd11258808e1c0e523be, also pinned only in the dedicated Tabwise DB. Four local migration names now match their remote versions. Hosted ledger40cap/0spent/0reserved; no run, diagnosis or patch rows; modes owner_only/off/PENDING.

## Later D-63 continuation

Current checkpoint: [Tabwise-checkpoint-D63.md](Tabwise-checkpoint-D63.md). Root333/contracts21/web21 pass; five migrations now applied only to dedicated Tabwise. Patch decision UI/API/RPC and failed diagnostic retention/display are implemented with unit, rollback-only SQL and synthetic keyboard/axe/mobile coverage. Real authentication/worker/model/repair qualification remains blocked. The155-file Claude follow-up remains sealed and excludes these later changes.
