# D-63 — narrow observer qualification preparation

Status: **PREPARED OFFLINE; BLOCKED FOR DISPATCH.** This document grants no execution permission. The owner explicitly requires both separate owner authorization and independent safety clearance. Current review status stays BLOCK; current workflow stays a refusal scaffold. No desktop NVDA/input, API key, inference or private fixture is involved in preparation.

Candidate: instantiate a second `NVDAClient` from the same cached frozen vendored module after the unchanged singleton gate is installed. Connect with literal `{capture:false, deadlineMs}` and subscribe to public `speak` events. Never reconnect or replace the module/prototype; never use its queued action speech log for the observer. Relay strings already normalize whitespace and combine string sequence members; the artifact must disclose that normalization and cannot claim raw audio/protocol preservation.

## Entry requirements before a separately authorized run

- Independent review of the actual complete qualification loader and exact content seal; the original architecture review is conditional, not clearance for this newer code.
- Owner approval names the exact reviewed revision, narrow purpose and one manual hosted Windows qualification. Existing D-54 R1 authorization does not authorize this test.
- Verify frozen R1 lock/spec/source, upstream pins and full vendor tree before importing guarded modules. Use the cached frozen module; persist intent before any physical send.
- Main/manual/owned GitHub-hosted Windows guard, A15 settings readback, fresh owned NVDA process/reset receipt and matching relay PID. Never run on the development machine.
- Owned synthetic nonce-titled fixture only; exact browser foreground PID/title freshness and independent original R1 page acknowledgement reader. No private R2 fixtures.
- Isolated fixture context with no upstream request path, bounded journal/artifacts and teardown. Optional stop-speech remains deferred.

The loader is not yet complete. In particular it must preserve the original R1 guarded report-title wrapper and its `capture:true` primary operation while the second client uses `capture:false`. General journey presses remain restricted to the four approved presses. The setup-only report-title operation is not permission to broaden the journey palette.

## Minimal observation and artifact

1. Before adding the observer, record owned process/relay identity and foreground/settings evidence. No journey or diagnosis is run.
2. Attach exactly one observer. Recheck relay ownership. Preserve any speech/join side effects; unexpected pre-action speech fails this narrow candidate assessment. Do not clear, rewrite or backdate its journal.
3. Through the unchanged guarded primary freshness wrapper, request the nonce-bearing owned page title once. Record executor request time and the primary returned title phrase. Record each observer `speak` event separately with sequence and Node monotonic timestamp.
4. Recheck relay PID, session continuity, foreground and complete page/speech boundaries. Feed those original observations to `assessObserverQualification`. It requires verbatim primary-phrase inclusion, no pre-action speech, stable ownership and ordered complete observations. It records observed first-match lag without inventing a latency result or broad equivalence claim.
5. Disarm; quiesce. A non-quiet result causes sticky timeout. Read final boundaries; disconnect the observer; close the browser only when quiet; stop NVDA last. Retain partial evidence and errors. Never equate promise settlement/cancellation with physical quiescence.

Artifact includes reviewed revision/scope digest, owner authorization reference, startup/reset/settings/foreground receipts, original primary title result, observer before/after snapshots and append-only journal, page/focus/action journals, timings and teardown state. Hash every artifact. Reconcile run ID, attempt, actor, workflow, event and SHA against authenticated GitHub metadata. No speech/model output can attest to its own safety.

Even a candidate PASS is scoped to that controlled title observation. Actual broadcast coverage, absence of NVDA/earcon/focus/settings side effects, key echo behavior, timing distributions and full R2 continuity still need independent assessment. Failure, missing evidence, interference or changed ownership means BLOCK/INCONCLUSIVE; no automatic rerun or P0 dispatch.

## Available offline code

- `scripts/tabwise/observer.mjs`: injected candidate, no loader or physical input exports.
- `scripts/tabwise/observer-qualification.mjs`: pure assessment and idempotent teardown helper; no dispatch/process/browser/NVDA imports.
- `test/tabwise-observer.test.mjs`: fake client/state/ownership/cap/teardown regressions.
- `test/tabwise-review-{input,integrity,approval,network}.test.mjs` and headless network test: supporting refusals and isolation checks.

A press-only executor candidate now exists in `scripts/tabwise/executor.mjs`; the production loader/binding and all typing remain absent. Four fake-boundary tests cover whole-journey refusal, literal capture:false, persisted intent/foreground refusal, abort stopping once while the underlying send remains unsettled, and late executor settlement failing the independent R2 deadline. They do not qualify the actual frozen transport. Production tests must still establish exact guard ownership and separate real R1/R2 acknowledgement readers. Frozen R1 behavior and the R2 1000 ms observation cap remain unchanged.

## D-65 superseding implementation status

The narrow observer qualification loader/providers/title core/writer/workflow now exist and are offline-tested; see [D-65 review map](Tabwise-D65-review-map.md). This supersedes the earlier missing-loader preparation status above. Both qualification status and manual input remain default-disabled/BLOCK. No actual NVDA session or dispatch took place. All complete-worker/typing/real Spark qualifications remain open.
