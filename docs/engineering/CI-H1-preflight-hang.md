# CI-H1 — hanging offline preflight

Run ID: CI-H1-20261029. Evidence is MACHINE/L3 unless explicitly marked INFERENCE. Scope: local offline reliability correction only; R2 qualification remains BLOCKED.

## Baseline and diagnosis

MEASURED: exact HEAD bb8008b0857f2148c5c808e951fac2a64fc2647b, branch review/tabwise-m2b-m2c, clean working tree and ten recent commits inspected before edits. Created fix/tabwise-ci-preflight-hang from that HEAD. Node v24.22.1 and dependencies were already installed. No install was run.

CITED (repository source): package.json selects every root test/*.test.mjs. The previous preflight workflow used npm test followed by the same unrestricted glob in all eight stress profiles. That selection included three real Chromium tests although this workflow neither installs Chromium nor authorizes browser execution.

MEASURED: both fernway.test.mjs and tabwise-network-browser.test.mjs leaked a loopback listener when the actual browser import was substituted with an immediately rejecting launch promise. In the original ordering, listen precedes launch and the try/finally follows launch. Both regression children reached the 3000 ms watchdog (ETIMEDOUT). After moving resource acquisition into try and placing server shutdown in an inner finally, both exited naturally with status 1, reported the synthetic launch failure and emitted listener-close events. The regression failure is still a failure; no test assertions or evidence thresholds were relaxed.

MEASURED: a separate minimal original-pattern reproduction printed "listener still open=true" after launch rejection and required a 1500 ms parent timeout. Another synthetic node:test callback timed out at 20 ms while an unrelated open listener kept the process alive until the 500 ms process watchdog killed it. A per-test timeout cancels/reports the test; it cannot close arbitrary resources or forcibly cancel all JavaScript work. A supervisor outside the test process is needed for a hard process boundary. Reference: [Node test runner](https://nodejs.org/docs/latest-v24.x/api/test.html), [child processes](https://nodejs.org/docs/latest-v24.x/api/child_process.html); Node 24 documentation fetched using Context7 with the cached CLI (no install).

INFERENCE: a missing/unavailable Chromium executable is a plausible launch-rejection trigger in the cancelled hosted run. The listener leak is demonstrated, but the original hosted trigger is NOT established. No diagnostic artifact was downloaded and no claim is made that the last visible successful D43 test caused the hang. No real browser was launched to determine browser availability. Other launch failures produce the same leak.

CITED (source inspection): qualification-providers.mjs already catches connect/context/page/navigation setup failures and attempts context/browser/server cleanup; its ordinary close path uses nested finally. The qualification-browser test has no listener before provider.open. network.mjs also closes its acquired context after routing setup failure. These protected qualification sources are unchanged.

## Correction

- Move listener setup and browser launch inside the two existing browser-test cleanup regions. Optional browser close and nested server close cover launch, context/page creation, navigation and assertion failures, including a rejected browser.close. closeAllConnections prevents fixture sockets from retaining shutdown.
- ci/offline-tests.json explicitly classifies every file selected by the root npm test glob, including excluded coverage. Added/removed/unclassified or invalid entries refuse execution before any test runs. No name-based one-off skip.
- scripts/offline-tests.mjs uses the identical selection for ordinary, repeat-1, repeat-2, serial, seeded random and four fault profiles. Ordinary and repeat profiles now also run serially by file; this deliberately removes file-level parallel scheduling coverage. Random still shuffles both files and test order. No full-suite claim.
- Each file runs directly in its own Node process, without a shell or an additional --test runner parent. The 10000 ms default test timeout is preserved; existing explicit test timeouts stay unchanged. A separate 60000 ms file watchdog uses SIGKILL. A 180000 ms profile budget bounds aggregate stalled files. TIMEOUT/PROFILE_TIMEOUT/FAIL are failures, with the profile/file named.
- The supervisor is outside fault injection; faults are imported only into test children. Controlled CI-harness children are separately reviewed and bounded. Other process-bearing files remain excluded.
- Logs and incremental JSON results plus selection.json are written outside the checkout in CI. Ordinary/stress steps additionally have 6/30 minute limits; the existing 40 minute job limit remains. Before/after source checks, read-only checkout and always-upload diagnostics are retained. Forced cancellation can still prevent cleanup/upload, as with any Actions job.

## Coverage inventory

The initial npm test inventory contained 54 files. After adding two CI harness files, the classified inventory has 56: 45 offline, 2 controlled CI harness, 3 browser, 6 other process-bearing. All 47 admitted files are listed explicitly below; no file requires real NVDA, physical input or external services. Fake API tests inject fetch and write only disposable local ledgers. Existing speech HTTP requests target an owned loopback fixture. The six process-bearing exclusions are conservative; this task does not certify them unsafe.

| File | Class | Basis / coverage not exercised |
|---|---|---|
| test/broker.test.mjs | process | spawns real Node workers for SQLite contention |
| test/browser.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/ci-browser-cleanup.test.mjs | harness | controlled Node children only; fake browser module substitution or synthetic handle; bounded cleanup |
| test/ci-offline-selection.test.mjs | harness | controlled Node children only; fake browser module substitution or synthetic handle; bounded cleanup |
| test/client.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/engineering.test.mjs | offline | sandbox imported first; OS/process/network boundaries denied and replaced with fakes |
| test/fernway.test.mjs | browser | real Chromium execution; separately authorized browser coverage required |
| test/r1-baseline-eol.test.mjs | process | spawns Git, Node digest workers and observer check-only entry |
| test/r1-baseline.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/r2-binding.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/r2-capture-boundaries.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/r2-capture-corrections.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/r2-capture-receipts-failclosed.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/r2-capture-receipts.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/r2-capture.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/r2-page-provider.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/r2-payload-context.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/r2-preparation-hardening.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/r2-preparation.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/r2-review.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/r2-send-receipt.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/r2.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/sendguard.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/speech.test.mjs | offline | fake providers and loopback HTTP fixture only; no external execution |
| test/tabwise-budget-alarm.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-budget.test.mjs | process | spawns 50 real Node workers |
| test/tabwise-d65-executor.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-d65-network.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-d65-observer.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-d67-crash.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-d67-executor.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-d67-integrity.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-d67-timing.test.mjs | process | spawns Git and loads runtime closure in a disposable repository |
| test/tabwise-d73-admission.test.mjs | process | spawns PowerShell with shimmed dispatch commands; uncertain external effects |
| test/tabwise-diagnosis-persistence.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-diagnosis.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-executor.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-meta.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-network-browser.test.mjs | browser | real Chromium execution; separately authorized browser coverage required |
| test/tabwise-observer.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-patch-review.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-patch-validation.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-qualification-browser.test.mjs | browser | real Chromium execution; separately authorized browser coverage required |
| test/tabwise-qualification-core.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-qualification-evidence.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-qualification-loader.test.mjs | offline | sandbox imported first; OS/process/network boundaries denied and replaced with fakes |
| test/tabwise-qualification-policy.test.mjs | process | spawns observer check-only entry (default-disabled refusal) |
| test/tabwise-qualification-providers.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-review-approval.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-review-input.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-review-integrity.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-review-network.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-verdict-integrity.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-verdict.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/tabwise-worker.test.mjs | offline | local files, pure contracts or injected fake providers; no physical runtime call |
| test/vendor.test.mjs | offline | sandbox imported first; OS/process/network boundaries denied and replaced with fakes |

Browser execution and the excluded process suites need separate owner-approved verification. This task adds no executable browser workflow and installs no browser. npm test and frozen r1.yml remain unchanged and still include browser tests; do not invoke them under this task's offline authorization.

## Verification

MEASURED: node --test test/ci-browser-cleanup.test.mjs: RED 0/2, both ETIMEDOUT before the cleanup patch; GREEN 2/2 afterward. Engine/axe modules are substituted before resolution using registerHooks, so these regressions cannot import or launch real Chromium.

MEASURED: node --test test/ci-offline-selection.test.mjs: 4/4 PASS, covering identical profile membership, browser/process exclusions, unknown/missing file refusal, hung listener termination, nonzero-child classification, and workflow wiring. Before workflow correction, its dedicated workflow assertion failed.

MEASURED: node scripts/offline-tests.mjs --profile ordinary --out cache/ci-h1: 47/47 admitted files, 478/478 tests, zero skipped/cancelled/failing tests. Of these, all 205 R2 tests passed. This is partial root-suite coverage, not complete npm test. Raw logs, selection and per-file outcomes: cache/ci-h1/.

MEASURED (2026-10-29T17:31:30Z): node scripts/offline-tests.mjs --profile stress --seed 172785 --out cache/ci-h1 exited 0. All eight stress profiles completed all 47 selected files with 478/478 tests each, zero failures/skips/cancellations: repeat-1, repeat-2, serial, random-172785, slow-fs-30, slow-fs-100, stall-40, mixed. Aggregate checked results are in cache/ci-h1/verification-summary.json. This repeats the same partial coverage; it does not add the nine excluded files.

MEASURED: final node scripts/check-r1-baseline.mjs and node scripts/preflight.mjs --out cache/ci-h1/after.json both exited 0; checkFrozenIntegrity returned ok:true. Qualification digest before/after: 6972c311a6e9302856ff9bb9195aa73cf106a15da8caf91ac32b781f8909f328. Vendor-tree digest: d80eb577e272dd7c16135ebfeaa9e3dc9162308b0ea1323a9b158dcafb774e1d. Day-1 gate digest: ca0c9feb568e7c9c4ea41832607f510af0cbf5548242adcd77f729e039af3362. Protected-path git diff is empty. Local preflight deliberately omits --clean because this reviewable task diff is uncommitted; initial working tree was clean and CI retains --clean before/after. git diff --check and PowerShell parsing of the changed workflow block passed.

## Exact changed-file inventory

Modified: .github/workflows/preflight.yml; test/fernway.test.mjs; test/tabwise-network-browser.test.mjs; docs/CODEMAP.md; docs/ledger/DECISIONS.md; docs/ledger/PLAN.md; docs/ledger/PROVENANCE.md; docs/ledger/STATE.md; docs/ledger/LOG.jsonl.
New: ci/offline-tests.json; scripts/offline-tests.mjs; test/ci-browser-cleanup.test.mjs; test/ci-offline-selection.test.mjs; test/helpers/reject-browser.mjs; docs/engineering/CI-H1-preflight-hang.md.

No product source, frozen R1 source/workflow/fixture, vendor, dependency manifest/lock, qualification policy/provider/status or FEATURES entry changed. Appended PLAN material is outside the locked Day-1/F-02 sections. No API, browser, NVDA, physical input, spending, deployment, Actions operation or third-party write was performed.

## Handoff

Review the local diff and this report. No push, merge, PR update or hosted rerun was performed. An owner-run offline-preflight on the reviewed/published fix is justified to test Windows-2025 and Actions integration; merely rerunning the unchanged baseline is not a repair. Do not run the full npm test or browser/physical workflows under this authorization. Separate full browser verification requires an approved execution environment/browser install and explicit owner authorization. Independent cross-tool diff review remains outstanding; changes are left uncommitted. Stop after CI-H1.

## Independent review correction (2026-10-29; local owner verification still required)

An independent reviewer reproduced a fail-open coverage-accounting case in the original CI-H1 supervisor: a Node test file with no registered tests, or with all tests skipped, exits with code 0 and was incorrectly classified PASS. A narrow correction to `scripts/offline-tests.mjs` now requests TAP output and requires complete nonzero per-file test totals with zero failures, cancellations, skips and TODOs before marking PASS. `test/ci-offline-selection.test.mjs` adds zero-test/skipped/passing regressions.

These probes passed 5/5 in an isolated Node 22.16.0 sandbox with synthetic files; **this does not establish Node 24.22.1 Windows or full 47-file profile qualification**. The earlier 478/478 profile results are historical, prior to this correction. Re-run ordinary and stress profiles locally on the pinned Node 24.22.1 to refresh the counts and handoff before publication.

## CI-H2 proposed follow-up — hosted mixed stress watchdog (pending owner approval/verification)

MEASURED: PR #4 run `40927125615` at CI-H1 revision `f59bb5550d31bbbc42d829627c20b1e863e0cd95` completed ordinary and early stress profiles. The `mixed/speech.test.mjs` child was terminated by the 60,000 ms process watchdog after 79/122 passing subtests. The same file completed 122/122 under `stall-40` and `slow-fs-100`; subsequent mixed files also passed. Final source locks and clean checkout passed. Artifact: `offline-preflight-40927125615-1`, ID `12922400064`. Cause of the previous CI-H1 browser hang remains independently unproven.

PROPOSED: grant **only** `mixed/speech.test.mjs` a 120,000 ms process watchdog, still capped by the remaining 180,000 ms whole-profile budget. All other file watchdogs remain 60,000 ms. The existing `--test-timeout=10000` (per-test) and frozen R1 timings are unchanged. Test `ci-offline-selection` asserts the exact exception, unchanged defaults, and remaining-profile cap. A slower genuine hang must still be reported as TIMEOUT/PROFILE_TIMEOUT/FAIL.

Do not claim CI-H2 PASS based on the local CI-H1 run. Owner approval of this follow-up, pinned Node 24 local regressions/stress, frozen checks and another hosted PR #4 preflight are required before clearance.
