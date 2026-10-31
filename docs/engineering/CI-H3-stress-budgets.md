# CI-H3-S: registered offline stress scheduling budgets

Owner decision D-90; base 9f8d48c760ba42d78cdff8e2a2dc29d20a417ae9; branch fix/F-03-ci-h3-diagnostics. Scheduling amendment is uncommitted and awaits independent review. This is not stress acceptance, an exception to per-test failure, or execution/activation approval.

## Registered limits
| Item | Before | D-90 |
|---|---:|---:|
| stall-40 profile | 180000 ms | 240000 ms |
| mixed profile | 180000 ms | 240000 ms |
| Other profile budgets | 180000 ms | unchanged |
| stall-40/speech.test.mjs watchdog | 60000 ms | 120000 ms |
| mixed/speech.test.mjs watchdog | 120000 ms | unchanged |
| Other file watchdogs | 60000 ms | unchanged |
| Node per-test limit | 10000 ms | unchanged |
| Exit/output confirmation ceiling | 1000 ms | unchanged |

These are explicitly owner-approved CI scheduling acceptance changes. PLAN and D-90 were registered before implementation and old threshold-assertion edits. profileBudgetMs is the single policy helper for allocation, profile telemetry, headers and partial/final reports. Each file allowance remains min(nominal cap, profile remainder), rounded down; remainder below 1 ms launches no file. F1-F4 process-exit/stdio-close tracking, strict confirmation, complete unexecuted accounting and fail-closed classifications are unchanged. No functional assertion, fault intensity/order/seed/selection, physical deadline, frozen R1/R2 boundary, dependency, workflow or status change.

## Contradictory evidence retained
- Codex isolated fault-injection calibration: 80.031 s; tests 122, pass 119, fail 1, cancelled 2. Its JSON does not independently record the injector environment. The 120000 ms independent diagnostic parent watchdog differed from the then-current 60000 ms stall-40 speech harness cap; this was not an official stress run. T12 completion and D39-M01 had Node10000ms per-test timeouts; serveDir separately failed to connect. Evidence:C:/projects/tabwise/cache/ci-h3-diagnosis/20261031T165239Z/speech.test.mjs.{json,tap,stderr}.
- Owner native Windows stall-40 run: TAP 122/122 PASS,zero failed/cancelled/skipped; duration69263.5308ms (69.264s rounded). The owner transcript explicitly sets R1T_STALL_MS=40 and R1T_STALL_EVERY_MS=50. TAP does not independently attest environment variables. Printed process exit code was blank, not captured as0. It used --test, unlike the direct-file harness. Evidence:C:/projects/tabwise/cache/ci-h3-owner-speech-final/speech.tap and speech.err (empty).
- Earlier parent watchdog/profile clipping and per-test failures remain historical, not replaced by the owner pass. Primary-checkout handoff J/J.1 and cache/manual-review/r2-c2-stress* retain those reports. Later host serveDir 1/1 PASS, approximately 772 ms, supports treating Codex EACCES as environment-specific, not a proven source defect. The full speech TAP says only fetch failed; EACCES is recorded in C:/projects/tabwise/cache/ci-h3-worktree/cache/ci-h3-evidence/server.trace.jsonl.
- Per-test failures are unresolved. No scheduling increase excuses, suppresses or reclassifies them as PASS. Further aggregate execution must still reject any test failure/cancellation/incomplete totals.

## Rationale and limits of estimates
The owner speech TAP exceeds 60 s by9.2635308s. Reusing the existing120s speech cap adds headroom without changing the 10 s test limit. Final stall logged completed files outside speech/vendor110.2800712s; combining these with host speech 69.2635308s and isolated vendor 6.516 s estimates 186.059602s before overhead. Final mixed consumed at least 115.4072258s before speech; adding prior passing mixed speech 66.3196441s already reaches 181.7268699s before the remaining files. These combine different runs: INFERENCE, not measured aggregate duration or a guarantee 240 s passes.
Six 180 s plus two 240 s stress ceilings total 1560 s (26 min), nominally 240 s below the unchanged 30 min hosted stress step. Logging, process startup and confirmation overhead remain unqualified; no hard real-time guarantee.

## RED/GREEN and current result
Portable Node 24.22.1; command: node --test --test-timeout=10000 test/ci-offline-selection.test.mjs.
- RED cache/ci-h3-evidence/scheduling-red.txt:20 tests,15pass/5fail,exit1,0cancelled/skipped.
- GREEN cache/ci-h3-evidence/scheduling-green.txt:20/20 PASS,exit0,0cancelled/skipped;1117.5111ms.
- Regressions cover exact amended and unchanged profile/file ceilings,1560s sum,240s exhaustion accounting, remaining/fractional clipping, unchanged faults/10s limit, existing TAP and F1-F4 guarantees. Main reporting uses the selected helper result for headers and partial/final JSON.
- No full speech or official eight-profile stress run performed. Stress acceptance remains UNSATISFIED. git diff --check, exact nine-file scope and C2 byte identity are final read-only checks, not functional tests.

## Integration and rollback (plan only; no Git integration authorized)
1. Preserve the exact primary C2 patch/export and its hash. Do not edit that checkout or mix scheduling changes into its unreviewed acceptance decision.
2. Owner resolves C2 acceptance/commit separately. Instrumentation9f8d48c changes two non-C2 files; the scheduling code changes those same two files atop that commit. C2 producer policy and R2 tests must retain their exact bytes.
3. Combine only in an owner-authorized integration worktree after independent scheduling review. Apply/merge the reviewed code changes with before/after C2 source/test hash checks. Do not replay the nine-file scheduling patch blindly: CODEMAP and four ledgers overlap C2.
4. Shared documentation requires explicit owner-approved reconciliation. Preserve C2 decision/log/PLAN/handoff text verbatim; reconcile current STATE under40lines. Whole shared files cannot remain byte-identical while also gaining scheduling records; until reconciliation is approved, leave C2's files unchanged and retain this separate review packet.
5. Only after integration/review and separate execution authorization: one official stress run seed426136, all8 profiles/all49 selected files executed and passing, exit0, no incomplete TAP, unknown exit/output or per-test failure. No retries that erase failures.
Rollback: discard/revert only this scheduling diff; retain9f8d48c instrumentation, C2 and historical logs. No commit, push, merge, activation or spend authorized here.

## Integrated candidate documentation reconciliation
Independent CI-H3-S source review PASS is owner-supplied; it is not stress acceptance. Review clarifications applied here only: Codex calibration environment/parent-cap caveat; exact EACCES trace citation; table row formatting; distinction between tested runProfile reports and inspected main headers/partial JSON. Three existing scheduling tests changed, including the nominal/granted fixture clock 130000->190000 and matching elapsed assertion to retain the 50000 ms remainder. No reviewed code byte changed during integration. Historical ledger quotations remain verbatim; compact source notation is retained where part of historical records, with clarified units in the current handoff.
