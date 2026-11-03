# R3 + Demo final integration qualification

Run ID: `final-integration-20261103`. Updated: 2026-11-03T11:41:56Z. MEASURED results below were run in `D:/Projects/Meta AI/app-final-integration` on the combined snapshot, Node24.22.1 / Windows. This is engineering qualification; genuine R2/R3/R7 acceptance remains BLOCKED.

## Merge and preservation audit
- Branch `feat/F-03-final-integration`; existing HEAD/R3 `04f632f1294fdcb0753f6669fa2a8b44c1d490d0`, MERGE_HEAD/Demo `8e790b6fdebb690cd6eea848dd86a7de48c56883`, common foundation `4ccc54442bdba81febe1cac7f1c97700ead3fe76`. The existing merge was neither aborted nor restarted.
- Initial staged inventory was exactly11 files; no unmerged index entries; cached whitespace check passed. Demo presentation files equal their Demo parent. All original lines from both conflicted ledger histories survive in order; the foundation STATE is the exact original prefix. Subsequent current status is appended, deliberately retaining history beyond the usual40-line limit.
- All188 original LOG records parse and are unique. Five historical adjacent timestamp reversals (record indices115,138,168,175,184) reflect preserved parent history, including branch-appended Demo records; no chronology was silently rewritten and no historical measurements are counted as fresh.
- Frozen R1/vendor/source/evidence/FEATURES and activation status files exactly match the foundation. No integration test assertion, acceptance threshold, runtime source or workflow was edited by this task. Existing R3 reviewed-source membership expands coverage; activation remains disabled/BLOCK.
- Fresh fetched `origin/main` was `9bb994c335c2af716f727c519bc9853d5cd80dd0`, an ancestor of R3 HEAD. GitHub protection endpoint returned404 "Branch not protected"; applicable branch rules returned an empty list. No protection was changed.

## Integrated changes and corrections
R3 brings source-bound repair packet/plan/query delivery into the sole guarded R2 entry; exact-source staging and cleanup; immutable owner oracle registration and readback; admission and shared dispatch refusal without that oracle; native-attestation reread and independent narrow MACHINE/L3 verdict persistence. Validation/status verdicts abstain. Demo adds screen styling and truthful archived transcript labels, explicitly distinguishing Fernway recording from historical R1 evidence.

No production integration defect required a code change. Dependency setup required physical root/web/contracts copies whose manifests/locks matched by SHA256. The local `file:../packages/contracts` reference is a junction to this integration worktree's own contracts (never the source worktree); all other dependency trees are physical. Two copied extra optional packages and the initial physical local-package copy were preserved under ignored cache, yielding clean offline npm dependency audits at all three roots. No tracked dependency or lock changed. Initial typecheck/build failures from the physical local-package layout were corrected; final checks passed.

The initial browser run at127.0.0.1 had15 PASS/1 FAIL because NextURL normalizes loopback origins to localhost. The installed Next16.4.3 source and Context7 `/vercel/next.js` source documentation confirm this. Final unchanged tests used the repository-prescribed canonical localhost URL and passed16/16. The strict origin guard was retained; numeric loopback-origin writes remain refused (an existing local alias limitation). Source: [NextURL source](https://github.com/vercel/next.js/blob/canary/packages/next/src/server/web/next-url.ts).

## Fresh combined-snapshot matrix
| Check | PASS | FAIL | SKIP/excluded | Evidence / exact command |
|---|---:|---:|---:|---|
| Full root, including R2/R3 lifecycle, security and oracle regressions |1189|0|3 opt-in DB tests|`node --test --test-concurrency=1 --test-timeout=20000 test/*.test.mjs`; root.txt |
| Classified ordinary, seed1 |1122 tests /63 files|0|13 files excluded by policy|`node scripts/offline-tests.mjs --profile ordinary --seed 1 --out cache/final-integration/ordinary` |
| Web unit |128|0|0|`node --test test/*.test.mjs` from web; web.txt |
| Contracts |21|0|0|`node --test --test-timeout=10000 test/*.test.mjs` from packages/contracts; contracts.txt |
| Production browser/API |16|0|0|`TABWISE_SMOKE_URL=http://localhost:3100 node --test web/test/product-integration.browser.mjs web/test/web-smoke.browser.mjs web/test/recorder.browser.mjs web/test/repair-oracle.browser.mjs`; browser.txt |
| Fresh PostgreSQL concurrent tests |3|0|0|`python cache/final-integration/postgres.py`; postgres.txt |
| SQL rollback suites |8|0|0|admission, budget, immutable, patch-review, persist-diagnosis, repair-application, repair-verdict, rls |
| Migrations |18 applications|0|0|All9 migrations applied to each of2 isolated databases; seeds applied |
| Typecheck / production webpack build |2 commands|0|0|From web: `node node_modules/typescript/bin/tsc --noEmit`; `node node_modules/next/dist/bin/next build --webpack`; *-final.txt |
| Visual accessibility / responsive |30 scans /45 layouts|0 violations/overflow|0|`node cache/final-integration/visual.mjs`; audit.json; keyboard skip/focus and print checks passed |
| Frozen R1 / preflight |2 commands|0|0|`node scripts/check-r1-baseline.mjs`; `node scripts/preflight.mjs --out cache/final-integration/preflight.json` |
| Dependency audits |3|0|0|`npm [--prefix web / packages/contracts] ls --offline --all --json`; deps-*.json |

The ordinary profile is explicitly partial:13 exclusions are listed in `ordinary/results-ordinary.json`. Their real-process/browser checks ran in the full root suite; the two DB files contain the3 opt-in tests passed separately. Exclusions are never counted as ordinary passes. Stress profiles were not repeated locally; remote preflight runs its registered profiles. Native/NVDA and live Meta tests were deliberately NOT RUN, as authorized. Hosted auth/RLS/storage/dispatch and remote migrations are NOT QUALIFIED by these local tests.

PostgreSQL18 used a fresh loopback-only temporary cluster, no existing database. All8 SQL suites used rollback; concurrency DBs were isolated. Cluster shutdown exit0 is recorded in postgres-results.json. Browser156.0.8078.4 used a credential-disabled loopback production server; it was stopped. Synthetic fixtures/mocks exercise local repair and oracle UI behavior, never real owner approval or native verification. Expected503 configuration errors were observed; no uncaught page errors occurred.

## Stable source and remaining barriers
All444 non-document source files retain the exact SHA256 snapshot taken before validation. Full results, commands, hashes, excluded inventory, logs and local screenshots are under ignored `cache/final-integration/`; the committed report carries the concise measurements. Historical reports were not rewritten. No protected evidence was touched and no new product acceptance was asserted.

The unfinished `fix/F-03-owner-query-trace` worktree was inspected read-only and preserved, with its uncommitted/untracked changes excluded. Its read-only PowerShell probe has timeout-triggered child.kill but no cancellation signal contract in probe-entry/probe-runner; close/termination and containment under parent cancellation remain unresolved qualification work. This is not promoted into the release. Authentic startup, independent attester, custody/quiescence, hosted packet/plan provisioning, source-bound worker-ID authorization, correct/wrong withheld native controls and independent R7 review remain blocked. Real Muse behavior is unqualified; no model request occurred.

To begin ONE real Spark request requires a separate explicit owner authorization naming one public/licensed/synthetic input packet and its digest, `muse-spark-1.3`, a fresh run ID, the existing standard mode, and a per-call ceiling at most$0.10 through `src/meta/diagnosis.mjs` -> `src/meta/client.mjs` with the existing broker/cache/cost ledger. Before sending, reconcile billing against COSTS (gap over$2 stops), confirm budget headroom/reservation and key configured locally without printing it. This request must be diagnosis-only MODEL/L1 and cannot activate native dispatch or grant R2/R3/R7 acceptance. Native evidence is not required for a separately authorized synthetic API smoke, but that smoke cannot be presented as native qualification.

## Publication status at this checkpoint
Local acceptance is complete; the existing merge is ready to commit with both original parents. Push/PR and remote CI results will be reported separately. Main must remain unchanged unless every requested delivery gate is met, including the normal protected-merge condition. Current branch protection is absent; do not bypass it or enable it without authorization.


## GitHub delivery — 2026-11-03T11:44:56Z
- Completed the original merge as `702fc9cd8f6a0e1744083014b8550ea2a98ca40f`, with parents `04f632f1294fdcb0753f6669fa2a8b44c1d490d0` and `8e790b6fdebb690cd6eea848dd86a7de48c56883`.
- Pushed `feat/F-03-final-integration` normally; opened [PR21](https://github.com/ANIRUDDH-001/Tabwise/pull/21). Main-to-head inventory includes194 paths from the inherited product foundation and final R3/Demo; the full local list is `cache/final-integration/main-to-integration-files.txt`.
- Committed clean-checkout preflight passed. GitHub confirmed branch HEAD exactly matches the pushed merge commit and remote main remains `9bb994c335c2af716f727c519bc9853d5cd80dd0`.
- [Hosted offline preflight](https://github.com/ANIRUDDH-001/Tabwise/actions/runs/41629795781) was IN_PROGRESS: install/source locks/read-only setup passed; classified suite/stress/final source checks not yet complete at inspection. Subsequent documentation closeout will produce a new PR-head check; consult PR21 for its current state. No remote pass is claimed.
- GitHub reported Vercel preview checks SUCCESS automatically on the authorized push; this agent issued no deployment command or hosted configuration/database mutation.
- **PR remains OPEN, not merged.** GitHub currently reports no main protection or applicable branch rules, so the specifically requested normal protected-merge gate is unavailable. It also reported merge state UNSTABLE while preflight ran. No protection bypass, admin merge, auto-merge or direct main push was attempted.
- Next publication action: an authorized repository owner must supply branch protection meeting the intended check/review requirements, or explicitly revise the protected-merge condition. Then wait for and inspect all CI on the exact final head, re-fetch main and repeat ancestry/source-integrity checks before a normal PR merge. Missing checks and native qualification are never inferred from green preview status.
