# R3 bounded completion pass

Updated: 2026-11-03T10:56:52Z. This is the current handoff; earlier R3 reports remain historical evidence.

## Identity and stop boundary
Worktree `D:/Projects/Meta AI/app-r3-executable`; branch `feat/F-03-r3-executable-lifecycle`; base and unchanged HEAD `4ccc54442bdba81febe1cac7f1c97700ead3fe76`.
One implementation session only: no agents, reviewers, Claude Code, installs, paid model/API calls, native worker/NVDA/physical input, hosted operations, workflow runs, deployments, commits, pushes, merges or branch movement in this pass. Other worktrees were not modified.
This pass ends with this report. No automatic continuation is authorized.

## Prior sessions and owned resources (MEASURED)
- Session 14462 returned exit 0. Saved targeted tests 82/82; root 1191 registered, 1189 passed, zero failed, two database skips.
- Session 66582 returned exit 0. Saved web, typecheck and build status codes were all zero.
- No matching worktree process command line was found at initial inspection. Prior local PostgreSQL log ends with database shutdown; no unrelated process was terminated.
- This pass's PostgreSQL cluster stopped in the runner's finally block; its server log confirms shutdown. Its path is retained in `postgres.txt`. Ordinary profile confirms child exit and stdio closure for all 63 selected files. Both local production servers created for browser checks were stopped through their owned sessions; no cache or evidence was deleted.

## Complete functional diff against the requested base
- Exact base/evidence-bound repair consumption and staged-source cleanup; sole guarded native entry receives detached admitted bytes.
- Strict approved-plan repair packet and flow query bind owner, product run, source revision, worker ID/attempt, candidate source, patch, tasks and native URL. Evidence writer/verifier reconstruct the same approved query. All activation policies remain unchanged and blocked.
- Explicit immutable owner oracle registration, owned patch endpoint, source/step/digest validation, UI review reference and readback. Rerun stays disabled without confirmed supported registration. A lost response requires readback; missing and unavailable states remain distinct.
- Admission migration requires the full oracle tuple before admitting/caching any rerun. Existing idempotent recovery and default worker/capacity/source gates are retained.
- Qualified sealed baseline/rerun evidence is read through the production native-attestation reader, then independently recomputed into a narrow MACHINE/L3 result and persisted immutably with exact replay and atomic audit. Focus uses recorder-owned dialog/final-focus state. Native validation/status checks explicitly abstain.
- Verification API/UI expose stored results without converting predictions into repair proof. JSON write parsing is bounded. Human-readable refusal reasons, CI registration and exact reviewed-source membership are included.

## Confirmed defect corrected in this bounded pass
The admission-only oracle guard did not protect historical admitted rows: `run_transition(admitted, dispatching)` could succeed without an oracle. A real PostgreSQL RED reproduction failed with “Missing expected rejection.”
Added `guard_repair_dispatch` in `20261103030000_repair_oracle_admission.sql`. It guards live repair status transitions at the shared database dispatch claim, requiring the immutable owner/reviewer/baseline/source/patch/finding-step tuple and exact admitted candidate/spec. Missing, malformed or stale bindings refuse before the application can issue a dispatch POST. Baseline paths and terminal cleanup transitions remain available.
The following exact cases passed on real local PostgreSQL:
- Two concurrent oracle-free admissions create no verify run or cached admission.
- Foreign-owner and wrong-step registration refuse; rejected patches refuse admission.
- Service-inserted oracle rows with foreign owner, wrong baseline, stale source hash or wrong step cannot satisfy admission.
- A historical admitted oracle-free row cannot claim dispatch and remains admitted. This probe is rollback-only, preserving the existing fail-closed policy on historical cancelled/started attempts.
- Concurrent registration/admission either refuses pending registration or admits one bound rerun after the immutable oracle becomes visible; retry recovers one binding.
- Registered review is immutable; conflicting registration refuses; exact registration replay after dispatch adds no second audit.
- Request replay after source drift/gate closure recovers the original run ID without authorizing another dispatch; stale source blocks the next live transition.

## UI/API verification
`web/test/repair-oracle.browser.mjs` uses explicitly synthetic, local mocked API records; it creates no real owner approval or native observation. It proves explicit selection/reference are required, no request occurs while disabled, a lost registration response leaves rerun disabled, owned GET readback enables it, execution gates still refuse the request, and stale readback disables it again.
Its first probe matched both the application alert and Next's route announcer. The regression locator was scoped to the review region/application message, preserving the content assertions. No production workaround was added.
Credential-disabled production API checks cover the oracle and verification write endpoints' origin/auth refusals. PostgreSQL verifies persistence/concurrency; hosted auth/RLS remains unqualified.

## Final acceptance on one stable source snapshot (MEASURED)
Source snapshot: 444 non-document repository files; no changed or added source files between snapshot and acceptance. `source-snapshot.json` and `integrity.json` provide mechanical hashes. Documentation/ledger updates after testing are identified separately.

| Check | Result | Evidence in cache/r3-bounded |
|---|---|---|
| Complete root suite | 1192 registered; 1189 PASS; 0 FAIL; 3 opt-in DB skips | root.txt, root-checks.json |
| Real PostgreSQL | All 9 migrations, seed and rollback SQL PASS; all 3 opt-in tests PASS | postgres.txt |
| Web unit tests | 128/128 PASS | web.txt, web-checks.json |
| Contracts | 21/21 PASS | contracts.txt |
| Production browser/API | 16/16 PASS | browser.txt, browser-checks.json |
| Typecheck and production webpack build | exit 0 each | typecheck.txt, build.txt |
| Frozen R1 and preflight | exit 0; preflight ok true | baseline.txt, preflight.json |
| Ordinary offline profile | 63/63 files PASS; every child exit and stdio close confirmed | ordinary/results-ordinary.json |
| Source stability, STATE prefix and diff integrity | PASS | integrity.json, state-preservation.json, patch-check.txt |

Exact commands are recorded in `commands.json`. No assertion was removed or weakened and no threshold/budget was lowered. Stress profiles were outside this bounded pass. No final test is failing.

## STATE history preservation
The complete original integrated `docs/ledger/STATE.md` Git blob is the exact 2298-byte prefix of the final file, SHA-256 `ffdbacccfd82f0b27b86e5cd8109e7a513dee5a3c35ad901b4ecf6f552c6a727`. Previous worktree R3 text is also retained. New bounded-pass status is appended. This deliberately exceeds the ordinary 40-line preference to obey the user's explicit preservation requirement. Mechanical equality is checked after final writes.

## Remaining blockers and review readiness
- **Stable for independent review: yes**, subject to the final mechanical checks recorded in `integrity.json` and `artifact-manifest.json`. All work is uncommitted. Same-source hashes and the exact diff permit independent reproduction; no additional reviewer was launched.
- Genuine R2 startup/attestation/physical-quiescence qualification remains blocked. No genuine native repair success or R3/R7 acceptance was measured.
- Hosted packet/plan provisioning, worker-ID assignment versus approval ordering, and the default API's currently blocked legacy-worker dispatch path still require separate owner-authorized qualification. This patch grants no dispatch clearance.
- The 9th local migration and other R3 migrations were not applied remotely. Hosted ownership/RLS and operational delivery remain unverified.
- Native validation/status checks are INCONCLUSIVE. The focus check is a narrow symptom/speech-preservation check, not full withheld-task rescue or absence of all regressions.
- Cross-tool review, fresh withheld correct/wrong native controls and user-assigned non-runner R7 review remain required. FEATURES R3/R7 and activation-policy bytes are unchanged.

Next action requires explicit user authorization: independently review this stable diff. No further implementation, tests or review cycles will start automatically.
