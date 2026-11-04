# Hosted release packet — F-03

Status: local qualification PASS; hosted migration/publication NOT EXECUTED; hosted end-to-end acceptance BLOCKED.
Evidence class: MEASURED engineering/local (L0, synthetic independent owners), not native qualification or real hosted OAuth. No R2/NVDA acceptance promotion.

Source checkpoint: `bcc3a619183675c9f6cb165a1f051f0dc905be65`.
Production and release parent: `45901889c94d5ef35923b073f414a525021cfd77` (read-only fetch of origin/main).
Release branch: `feat/F-03-hosted-release`. Candidate revision: `git rev-parse feat/F-03-hosted-release` (local release commit).
Only web/src/scripts-tabwise/fixtures/supabase/test product changes were selected from the checkpoint; upstream CI, governance and G1 V1/V2 registration files were preserved. No dependency manifest/version changes. PRODUCT-DIFF.txt records exact path/status comparison to production; use `git diff 4590188 feat/F-03-hosted-release` for exact bytes.

## Migration qualification and ordered hashes

MEASURED read-only hosted inspection: five exact expected versions, all existing public tables RLS-enabled, existing public RPCs invoker/empty search path/service-only. Repair/native tables absent; duplicate non-null verification run IDs zero; saved versions two; runs zero. Worker review PENDING, diagnosis off, actions policy false. These are point-in-time observations, not a lock on production.

Hashes distinguish canonical Git LF bytes from this Windows CRLF checkout. All files normalize byte-for-byte to checkpoint blobs. Owner packet exports canonical bytes; do not compare canonical hashes against CRLF without using the checkout column.

| Ordered migration | Canonical SHA-256 | Windows checkout SHA-256 |
|---|---|---|
| `supabase/migrations/20261103000000_repair_application.sql` | `314a0b647a4da15c63c11f8f78f312058edd920dbe88f1b9050be5e4097782a1` | `16ef737ccb7f824775f55dfc36f0367b4a47367abc654c5c6573bf58bf9d21e0` |
| `supabase/migrations/20261103010000_repair_rerun.sql` | `0c9bfe1afe17d95f96415b6ec49f7d9465ab99c98e2236bdfbe3db3c0d7149ac` | `6efe0fba8e849f6785cad7cdfa93853093ab142acfd560ec294e9537a4226f26` |
| `supabase/migrations/20261103020000_repair_verdict.sql` | `ef08b1c8f97c77a8dc5797528ddbc220b458df9074c7e61b9e534003c30e9f4a` | `0578ed400c5d6ef31b12728d5617ddecfbb26581980b97d4f4d30eb16525cdca` |
| `supabase/migrations/20261103030000_repair_oracle_admission.sql` | `77a0cf83329b73e7a0ecc6b9eaaac39d9adad264465389a702096a5012aad3ca` | `8e6e9d13ce6ec915232c97a2067e23aadc5922da7f0b40ffd536d9a22ec0e943` |
| `supabase/migrations/20261103040000_native_product_requests.sql` | `b002a9ed06ce709bc9c18dbf663e5514dfbe45513725ffeb181968aebf36d17b` | `8d3fa7072a4da619c0556c6776d6f79a6664b4b78b14ef3150a0286bc9167b61` |
| `supabase/migrations/20261103181501_native_integration_custody.sql` | `2ebbab7bc5957141ee5bb0cdbe264f4358f2b57eb1e0199408ec9b16c85d8039` | `e38d58eb5636e644a084255cd3d661cc36cdb18ac61e772a186671e1b607d0b6` |
| `supabase/migrations/20261103190318_native_claim_recovery.sql` | `aaa4238b99025d18c2ce98476c8445fadabf1b93baadb69b791849092bd62abf` | `7fcb733d020d331cd6a862f9c9cb2d704497149ad917a8682d4624aa382e7c03` |

Compatibility verdict: QUALIFIED LOCALLY, conditional on fresh production preflight and backup. The first five migrations are prerequisites. 000000 adds immutable applications/audit/patch decisions; 010000 adds saved base and reruns; 020000 adds oracle/verdict and unique verification index; 030000 adds pre-admission oracle and shared dispatch trigger; 040000 adds native requests; 181501 adds producer/nonce/claim/ingestion custody; 190318 adds claim recovery. No old table/column removal, user data deletion or journey rewrite. New immutability triggers intentionally prevent rewriting finalized review, findings, diagnoses, audits and verification projections. Historic patched/verify runs cannot newly dispatch without oracle/source binding. Baseline save/read/auth routes keep their old schema. Existing production has no runs affected by that tightening.

## Measured local results

Durable logs and hash index: `docs/release/evidence/` and `VALIDATION.json`. Run evidence: `cache/hosted-release/final-qualified/` (latest exact owner packet and forced precommit rollback), `qualified-db/`, `final-db/` (prior complete passes).
- PostgreSQL 18.3, fresh loopback-only trust cluster, isolated auth.uid()/Storage stand-ins; first five then seven migrations in order.
- Eight real SQL suites on each of two databases: admission, budget, immutable, patch-review, persist-diagnosis, repair-application, repair-verdict, RLS. Two-owner RLS is real PostgreSQL, not a mocked policy.
- Opt-in native request/integration/recovery and repair materialization/rerun concurrency suites run without skips; immutable replay, conflicting request hashes/worker IDs, nonce binding, unknown dispatch recovery, STAGING/COMPLETE idempotency and wrong-owner RPC refusal covered.
- Pre-upgrade saved journey sentinel survives upgrade. Read-only post-migration permission/search-path/gate assertions pass. Exact atomic owner SQL also tested against a clone at the five-migration state. A forced precommit division-by-zero failure rolls back all seven schema changes and ledger additions; the five-version history and saved journey remain.
- Focused root product tests: 23 passed, zero failures/skips.
- Web tests: 274 registered / 271 passed / 3 opt-in DB skips / zero failures; those DB suites pass separately above.
- `npm run build --prefix web`, typecheck, deployment-only raw-source import/digest check PASS. Six API packaging traces have no missing reviewed source files.
- Actual built production-route harness: nine checks PASS, synthetic auth provider + real local SQL, same-key interruption recovery, persisted native preparation, terminal refusal and zero external attempts/GitHub dispatch. Controlled production-native-chain replay PASS; synthetic dispatch/artifacts are explicitly not native evidence.
- Turbopack dynamic tracing issue did not reproduce after proper local package copy. Default build remains Turbopack; explicit trace includes/package closure pass. Only Recorder palette import changed to the established relative source pattern to resolve missing package type declarations.
- Failed evidence retained: initial dependency-junction resolution build, missing package type build, inherited-pipe startup hang, and SQL assertion variable/alias collision. Corrected runs are separately named; no failed evidence overwritten/deleted.

## Security and permission findings

No new definer functions. All public functions use empty search_path and deny anon/authenticated execute. New repair tables are service-only; native tables permit owner SELECT under RLS only. Service role bypasses RLS by design and must stay server-only; RPC p_user is trusted server input, not browser authority. Trigger invoker functions need no browser execute grants. Existing globally readable reports are a pre-existing intentional share surface; this sprint does not broaden it. Local auth/storage stand-ins do not test hosted storage policies or genuine JWT validation.

The source contains disabled native/transport/qualification policies; environment variables cannot override committed false native integration policy. Keep GH_PAT, Meta keys and receipt-signing keys absent from Preview; keep execution approval variables absent. Native metadata COMPLETE is not independent evidence qualification. No RLS/threshold/test weakening.

Independent same-model read-only review found no inspected runtime security blocker. Its two coverage findings are retained: hosted suite tests invalid/missing repair refusal, not a real patch ownership fixture; it tests preparation on an existing admitted run, not hosted integrated admission. It is not the cross-tool Claude review required for final acceptance.

## Owner migration rollout — one atomic plan

1. Review the local release diff and hashes. Confirm project `ueobjrtvsgvkigmjxkks`; obtain a restorable DB backup/PITR point and export existing saved-version IDs/digests. Confirm no concurrent schema writer, keep execution/native/paid calls disabled. Re-run read-only production counts, duplicate verification check and migration history; stop on drift.
2. Run `python scripts/release/prepare-rollout.py <new-empty-output-directory>`. It refuses an existing directory, verifies canonical checkpoint hashes, exports seven exact files and generates `owner-rollout.sql`. No database connection occurs. Existing prepared packet is `cache/hosted-release/owner-rollout/`.
3. Owner opens a dedicated session with the production DB owner connection (credentials only in .env, never echoed). Run `psql -X -v ON_ERROR_STOP=1 -f <output-directory>/owner-rollout.sql` with connection settings loaded privately. Never execute the test SQL suites against hosted production. Packet checks exact five migration versions, uses one transaction, locks with a five-second timeout, applies the seven ordered files, records version/name/statements in the observed migration ledger schema, checks saved version retention and permissions, requests PostgREST schema reload and commits.
4. Owner runs `psql -X -v ON_ERROR_STOP=1 -f scripts/release/post-migration.sql`; confirm exactly twelve migration versions and unchanged saved-version IDs/n/steps/digests, diagnosis off and worker review PENDING. Verify OAuth/workspace/version readback in current production before publishing preview. New repair/native tables should be empty; no native requests/claims/ingestions or paid reservations should be created merely by migration.
5. Stop on any error. Before COMMIT the atomic packet rolls back all seven migrations AND ledger rows; a disconnected session rolls back. Reconnect and inspect history, never assume success after a lost commit response and never blindly rerun. After successful COMMIT retain additive schema and roll back only the preview source if needed. Do not drop tables, delete history, reverse immutable triggers or manually decrement migration history. Restore from backup only through a separate owner-reviewed recovery plan accounting for new writes.

## Vercel preview and OAuth checklist

MEASURED connector inspection still returns 404 for tabwise/team slug, request `iad1:bom1:iad1:sfo1::prnm9-1793769918188-d8efe1de6e94`. Dashboard project/root/Git/env configuration was not independently revalidated in this sprint. Production READY and login visibility are owner-provided checkpoint facts.

Owner checks dashboard team `algominds-projects-68a5e35a`, project `tabwise`, repository `ANIRUDDH-001/Tabwise`, production branch main, root directory web, allow sources outside root (packages/src/scripts/fixtures), Node 24.x (local v24.22.1), build `npm run build`, lockfile install and no output-directory override. Preview deployment must use the exact release SHA; no production promotion.

Preview env: NEXT_PUBLIC_SUPABASE_URL=https://ueobjrtvsgvkigmjxkks.supabase.co and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are browser-public; SUPABASE_SERVICE_ROLE_KEY is server-only. TABWISE_OAUTH_CONFIGURED=1 only when actual provider configuration exists. GH_PAT_OWNER is the owner login used in request source identity (not a token). VERCEL_GIT_COMMIT_SHA is platform-provided; TABWISE_NATIVE_CANDIDATE_REVISION only for local tests. Do not expose service keys through NEXT_PUBLIC names.

Keep TABWISE_EXECUTION_APPROVAL_REF, TABWISE_REPAIR_EXECUTION_APPROVAL_REF, GH_PAT, provider/Meta API credentials, TABWISE_R2_RECEIPT_PRIVATE_KEY absent from preview. Check inherited Production/Preview env scopes; not just branch overrides. Native integration/sender/recovery and R2 policies remain committed false.

OAuth: GitHub provider callback is the Supabase project auth callback; Supabase redirect allowlist must permit the exact selected preview /auth/callback. App login constructs redirect from request origin; callback must exchange code and set session cookies on that preview. Owner configures only after review. Test GitHub consent, callback and refresh in a real browser with two distinct accounts. The suite cookies cannot establish that OAuth itself works.

## Hosted acceptance and explicit blockers

Run `node scripts/release/hosted-acceptance.mjs` only after owner publishes preview and completes real OAuth with two accounts. Supply TABWISE_E2E_URL, TABWISE_E2E_OWNER_COOKIE, TABWISE_E2E_OTHER_COOKIE and TABWISE_E2E_ADMITTED_RUN privately. Do not commit/log session cookies. It saves two test journey versions intentionally and leaves immutable history intact. It verifies readback/version increment/hash stability, wrong-owner 404, PREPARED readback/can_dispatch=false/native_qualified=false and safe invalid/missing repair refusals. It refuses the production hostname.

BLOCKER: production has zero runs; integrated POST /api/runs and admit_version require execution approval/worker review. Do not set those to manufacture an admitted hosted fixture. Therefore hosted preparation and the full integrated hosted journey cannot currently be qualified under disabled execution gates. A separately reviewed preparation-only admission design or an authentic eligible admitted fixture is needed. Local synthetic approval in the existing isolated harness proves only route logic. Real existing-patch two-owner refusal additionally needs a valid owned patch fixture; the current hosted script does not claim it.

No-dispatch/no-paid assertions require owner read-only before/after run producers/native requests/claims/ingestions, GitHub Actions history and hosted_budget/budget_reservations/COSTS reconciliation. The hosted script never calls dispatch, diagnosis, ingestion or paid providers, but cannot prove server egress absence by client observation. Record actual hosted results, failed evidence and OAuth observations; do not mark hosted E2E PASS based on local replay.

## Publication and smallest next steps

Owner reviews commit/diff and cross-tool review, executes reviewed DB plan, then runs `scripts/release/publish-preview.ps1 -Commit <exact-release-SHA>`. This script atomically creates a restricted preview branch using an empty expected ref lease; any existing remote branch fails. It never merges, changes main, creates a PR or promotes a deployment. Open a draft preview PR using PREVIEW-PR.md. Owner must inspect preview Git/env/root and genuine OAuth, then run hosted acceptance where prerequisites exist. Source for a login/save/readback preview is ready for owner publication and hosted validation; full hosted native preparation acceptance remains explicitly blocked as above.

CITED references: Next tracing/--webpack docs fetched through Context7 (/vercel/next.js); Supabase CLI db push/history docs fetched through Context7 (/supabase/cli). Direct owner connection packet is used to make the seven-file transaction and ledger writes reviewable; no CLI link, vault, seed or hosted command was run.

## Repeatable local commands

From repository root, with installed dependencies and PostgreSQL 18.3 available:
```powershell
python scripts/release/prepare-rollout.py
python scripts/release/qualify-local.py cache/hosted-release/new-run-id
npm run build --prefix web
npm run typecheck --prefix web
npm test --prefix web
node scripts/release/hosted-acceptance.mjs
```
The rollout exporter is create-only; an already prepared owner-rollout directory is reused by qualification, not overwritten. Choose a new qualification output directory each run. Ports 55442/55439 must be free; the local harness never stops another cluster. The final hosted command requires privately supplied preview URL/two real session cookies/an admitted run and is currently blocked as documented.
