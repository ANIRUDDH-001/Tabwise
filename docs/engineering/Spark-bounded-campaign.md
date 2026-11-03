# Spark bounded campaign — spark-campaign-20261103T130346Z
MEASURED 2026-11-03T13:20:18Z. Sole-agent engineering campaign; all claims below are scoped to owned synthetic fixtures. Browser ground truth MACHINE/L0; model responses MODEL/L1. No blind/independent/NVDA/R2/R3/R7 qualification is claimed.

## Changes and validation
- Optional validated Spark reasoning effort and diagnosis output/per-call caps preserve existing default request settings. Incomplete provider status is explicitly surfaced and cannot yield accepted findings even if its JSON parses. Known usage settles; unknown usage retains reservations.
- Credential-safe bounded nested cause/error-code/syscall diagnostics distinguish DNS/TLS/socket/connection-timeout failures; endpoint strips credentials/query/fragment; request elapsed/header timing captured, unavailable connection timing explicitly null. Free-text messages/headers/socket objects are excluded.
- Explicit complete unified-diff instructions were added after three real proposals failed the unchanged production patch validator. Original schema and patch safety validator are unchanged.
- Test-first transport failures reproduced before implementation. Final affected regressions52/52 PASS; controller3/3 PASS; frozen R1 PASS; preflight PASS. Added offline test registration includes new tests without changing thresholds, native gates or workflow configuration. No dependencies installed.

## Actual campaign results
All six responses were HTTP200/completed at medium effort, max6000 output tokens. All six passed schema/evidence-reference validation; semantic quality differs substantially. No retries. Sixth request was a prespecified adaptive patch-format hypothesis, not an uncertain-attempt retry.

| Case | Completion / quality | Input / output / reasoning tokens | Provider latency ms | Settled USD |
|---|---|---|---:|---:|
| 01-dialog-defect | Complete but wrong dialog-open diagnosis; unsupported announcement claim; malformed hunk | 2771 / 2464 / 2147 | 23239 | 0.01393575 |
| 02-dialog-control | False positive on healthy; unsupported announcement claim; malformed hunk | 2775 / 4627 / 4289 | 41368 | 0.02313350 |
| 03-neutral-rich | Correct step5/line40 on branch-free source with unambiguous DOM focus; patch missing headers refused | 3197 / 2332 / 2086 | 22154 | 0.01390725 |
| 04-no-evidence | Appropriate complete abstention with no evidence/source | 494 / 546 / 485 | 5978 | 0.00293800 |
| 05-status-feedback | Safe abstention: input lacks active variant/live-region snapshot; no actual speech supplied; target not localized | 2113 / 1619 / 1548 | 16133 | 0.00911610 |
| 06-patch-format | Correct mechanism and citations; complete one-line patch accepted by production validator; syntax and isolated Close/Confirm paths pass | 3267 / 2500 / 2228 | 20123 | 0.01470875 |

Campaign settled total **$0.07773935**, zero campaign reservations outstanding. A prior historical ambiguous reservation remains untouched and outside campaign accounting. Detailed original-project reconciliation is retained locally, not published. Exposure/controller ceilings were enforced before every transport invocation. Six-request authorization is exhausted.

## Diagnosis and repair
Cases1/2 expose false confidence: the existing fixture's `id || body` event label conflates an ID-less radio with the actual body. Fresh browser inspection shows the initial focus is INPUT/radio inside the dialog; claims of focus behind the dialog and measured non-announcement were unsupported. Both patches failed exact hunk counts and were not applied.

Case3 uses a separately hashed source with no healthy/broken conditional and fresh DOM focus observations (including actual body identity, tag/type and dialog containment). It correctly identifies terminal body focus after final Enter on Close and points to line40. Its bare +/- patch is refused. Cases3/6 still have source-visible defects and same-lineage development data; removing the conditional is leakage control, not independent defect discovery.

The sixth case keeps case3's source/observations, changes the run identity and adds explicit patch-format requirements to the production prompt. It cites the supplied transient opener-focus, terminal dialog-close/body and DOM state5 observations and localizes line40. A minimal exact one-line change replaces `opener.blur()` with `opener.focus()`. The unchanged production patch validator accepts it; JavaScript syntax passes. Isolated Chromium Close and Confirm both restore opener focus, retain initial radio focus and preserve Window seat selection. Both URL variant values were exercised, but this branch-free source ignores variant: four checks represent two distinct interaction paths, not four independent repairs. Other passenger/search paths are not reachable in this fixed-seat isolated variant and are not claimed tested. No original fixture was edited.

Expected speech strings are model predictions only. No screen-reader speech was supplied or observed; assertions about future user navigation remain inferred consequences. A healthy-control false positive prevents general model qualification despite the final successful narrow repair.

## Root causes and next task
The output-completion issue is addressed for these six cases with explicit medium effort/6000 output; all completed. Historical `fetch failed` cannot be reconstructed into a DNS/TLS cause because its old wrapper discarded the nested cause. Current non-metered DNS and verified TLS1.3 handshake succeeded; new diagnostics preserve future cause metadata. No network workaround/security weakening was used.

The highest-value next task is to fix production focus telemetry so an ID-less control can never be labelled document.body, with real DOM identity/role/type containment regressions and source-bound observations. Keep native worker custody/startup/attestation, genuine repaired NVDA journeys and independent R7 acceptance BLOCKED.

Raw responses/payloads/traces, provider identifiers, detailed hashes/controller and private budget state remain only under ignored `cache/spark-campaign-20261103T130346Z/`. This report contains aggregate engineering measurements, not raw provider output or account information. Publication/CI status is reported separately; no automatic merge.
