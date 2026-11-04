# Tabwise UX implementation brief for the next design pass

Evidence: MACHINE/L0, `p0-reliability-20261103T152120Z`. Fresh isolated Chromium against localhost passed18 actions after asset recovery. This is a UX implementation brief; no UI redesign was implemented in the reliability pass.

## Priority 0 — make the available workflow explicit

Keep browser recording, local drafts, local versions and historical transcript exploration as the actions users can complete now. The tested flow is homepage → journey picker → editor → keyboard recording in Fernway → checkpoint/reorder → save local version → reload/inspect version. Account save correctly reports unavailable sign-in. The demo workspace and historical successful/failed transcripts open; keyboard navigation among historical run tabs works.

Show one plain-language current-state line near each live action: sign-in unavailable, worker not qualified, diagnosis disabled, or repair verification unavailable. A stored browser recording is a journey specification, not screen-reader evidence. It currently does not produce a native capture or an actual persisted Spark diagnosis. Do not describe a locally saved journey as a run or a verified test.

Replace technical provenance dominating the homepage with a clear label such as “Example screen-reader recording” and a short disclosure that it is an archived, separately recorded sign-up fixture. Move R1, A15, run IDs, L-levels, acknowledgment counts, hashes and per-attempt protocol detail into an expandable “Evidence details” section and the transcript/report views. Retain the visible scope disclosure: the example is not the Fernway journey and it does not establish repaired-journey verification. Keep genuine disabled/gated state visible outside the expander.

## Priority 0 — connect states before promoting actions

Account workspace needs configured auth and an actual owned saved journey/version. Native execution needs an independently reviewed exact worker, required owner authorization, sound startup/custody/foreground/input acknowledgments, sealed source-bound artifacts and the independent native attester. Spark needs admitted, re-read native evidence and approved broker allocation; output must appear as a persisted diagnosis with reference links and rejected-patch reasons. Owner review must show the exact source/patch hashes and state that approval only materializes a private candidate. Rerun needs the separately registered owner oracle and current-source binding. Final verification must remain unavailable until a distinct qualified rerun and independent acceptance exist.

The hosted database lacks the four repair migrations, despite those modules existing in the repository. Do not make the new controls appear usable merely because their pages render. The private evidence bucket exists. Hosted diagnosis is off, worker review pending, no approved worker SHA/qualification reference. Keep those blockers visible without exposing keys or private infrastructure details.

## Priority 1 — help users recover and understand results

Preserve an explicit local/account distinction for saved journeys. Make recording-stop, unsaved draft, local save, account save and restore outcomes readable in the editor. Retain the existing keyboard and narrow-screen behavior validated by the recorder regression tests. Display the next available action after a failure, with local work preserved.

For diagnoses, separate the observed event, the model's interpretation, and the proposed patch. Rich DOM focus is a machine observation, and DOM-derived naming is not a complete accessibility-name computation. Model predictions about speech are not observed speech. Keep earlier transient focus visible in the timeline, but use the later sealed snapshot for terminal focus. Historical ambiguous labels should have a legacy-identity disclosure; never rewrite their archived bytes.

For repair, show “Awaiting owner check”, “Awaiting qualified rerun”, or “Inconclusive” until the required transition exists. Expose duplicate-request recovery and immutable prior decisions in plain language. Never turn missing evidence, a model assertion or an earlier focus event into a successful repair badge.

## Priority 2 — progressive technical detail

Put provenance, environment/profile, source bindings, raw event origin, collection completeness and acceptance independence behind an evidence detail control. Keep stable deep links into the corresponding transcript, source line, patch and report. Technical detail remains accessible for reviewers while the primary path uses action/result language.

Design may proceed using these truthful states. Final end-to-end repair demo recording should wait for native readiness, hosted schema/auth/worker integration and separate R7 acceptance. A browser-recording/historical-transcript demo can be explicitly scoped to those working functions.
