# Tabwise hackathon demo — planned 2 minutes 30 seconds

Task F-03/demo-polish. Base: `4ccc54442bdba81febe1cac7f1c97700ead3fe76`.
Local branch: `feat/F-03-demo-polish`. This is a recording plan, not a recording or qualification record.

## Storyboard and narration

All durations below are editorial targets, not measured product performance.

| Planned time | Screen / action | Narration and disclosure |
|---|---|---|
| 0:00–0:10 | `/` → **Open the demo**. | “Tabwise connects a keyboard journey to inspectable screen-reader evidence. I’ll record steps, save a version and inspect an archived transcript.” |
| 0:10–0:45 | `/journeys/fernway-passenger/edit`. In a fresh demo browser context: **Clear steps**, **Record keys**, focus the fixture iframe, press Tab through controls, stop recording. Mark a checkpoint and reorder one step. | “Fernway is an owned synthetic app. The editor records real browser keyboard actions. A checkpoint captures the point we want to inspect, and the step list makes the journey explicit. This records browser steps; it does not launch NVDA.” Keep the changing step list and fixture visible together. |
| 0:45–1:05 | **Save local version**, reload, inspect the saved steps with **View steps**, close preview. | “The local version is hashed and read-only in this preview. Reloading keeps the recorded journey. This is browser storage; account save requires separate sign-in setup.” Show the actual saved outcome and version identity rather than a prepared success graphic. |
| 1:05–1:40 | `/w/demo` → **Read the R1 transcript** → `/runs/r1-20261028T153344Z`. Inspect a key/speech pair, source run, digest and acknowledgement limitations. | “This transcript is from a separate archived sign-up fixture under the NVDA A15 profile. Each displayed step pairs its keys with captured speech. Its source and integrity digests stay inspectable, and acknowledgement limitations stay visible. This page displays text, not audio. The archive does not establish a repaired Fernway journey.” Scroll deliberately between one concrete step and its provenance. |
| 1:40–2:05 | **Diagnostic example: failed R1 run** → `/runs/r1-20261028T134638Z`; inspect the keys, focus and speech lanes, then `/r/r1-diagnostic`. | “The diagnostic timeline distinguishes a requested key from a confirmed action and session speech from action-attributed speech. When capture fails, Tabwise keeps incomplete evidence visible instead of converting it into a finding. The report preserves sources and missing lanes.” This is the older R1 failure, not the newer native diagnostic described below. |
| 2:05–2:15 | Brief separate slate: **Simulated repair sequence · synthetic inputs · L0**; plain text `Proposal → human review → separate rerun`. | “Offline synthetic controls distinguish a correct patch from a wrong one. This repair illustration is simulated; native repaired-journey verification has not passed.” No fake findings or FIXED product screen. |
| 2:15–2:30 | `/status`, then end on the local editor. Optional caption carries the native run ID. | “The latest native diagnostic stopped at NVDA startup before any physical sends. Native qualification remains blocked. Live Muse diagnosis and native repair verification are not demonstrated, and R7 acceptance is incomplete.” Keep unavailable states explicit. End card: Tabwise; local journey recording and archived transcripts. |

Product interaction and technical distinctions occupy the main cut: recording/checkpoints, saved-version persistence, key/speech pairing, inspectable provenance and fail-closed incomplete evidence. Keep the simulated repair to its brief labelled segment. If its slate is not prepared, continue inspecting the real diagnostic report during that segment and describe repair as planned direction; never substitute an unlabelled fake interaction.

## Latest native diagnostic — separate from the R1 archive

MEASURED, owner-reported in the correction request: [GitHub run 41584715963, attempt 2](https://github.com/ANIRUDDH-001/Tabwise/actions/runs/41584715963/attempts/2). Authorization PASS; installation PASS; NVDA startup failed on owner query timeout; zero physical sends; artifact integrity PASS; native qualification BLOCK. These outcomes are recorded from the owner's supplied report, not independently downloaded or rerun in this task. Artifact integrity does not turn the failed startup into native qualification. Do not reuse the historical R1 failure screen as if it depicted this newer run.

## What each segment establishes

| Category | Evidence class / independence | Source and permitted claim |
|---|---|---|
| Available browser functionality | MACHINE / L0, current local engineering checks | Local recorder, checkpoint, save/reload/version preview; `web/test/web-smoke.browser.mjs` and `web/test/recorder.browser.mjs`. Browser keys only; no native executor. |
| Available historical evidence inspection | OBSERVED / L4 as labelled by the existing archive; not a new independent qualification | `web/data/r1-pass.json`, anchored by `web/lib/r1-pass.mjs`; run `r1-20261028T153344Z`. Only the recorded A15 scope. Historical failed run `r1-20261028T134638Z` remains incomplete. |
| Simulated repair illustration | MACHINE / L0; synthetic, same implementation lineage | `test/tabwise-r3-rerun.test.mjs` exercises baseline/correct/wrong source in Chromium. No generated NVDA observations, withheld-task rescue, real model response or live end-to-end acceptance is established. The slate illustrates that sequence; it is not a screenshot of a completed production run. |
| Unqualified native / hosted functionality | No new evidence or independence claimed | R2 capture/attestation, live Spark diagnosis, isolated native source delivery, native patched reruns, real withheld evaluation, hosted authenticated RLS and independent R7 acceptance remain outside this demo task. Refer to integrated STATE and R3 handoff, not the existence of a button or module. |

CITED local sources: `web/lib/feature-states.mjs`, `web/data/r1-pass.json`, `web/data/r1.json`, `docs/engineering/Tabwise-R3-complete-handoff.md`, base commit `docs/ledger/STATE.md`. Current test measurements and limitations: `Tabwise-demo-results.md`. Qualification records and evidence bytes are unchanged.

## Recording preparation

1. Use this isolated worktree and its local production build. Keep credentials and execution approval variables absent. Do not load `.env` files, connect a deployed database, enable model calls or start native input. Reuse installed dependencies; do not install anything for recording.
2. Build with `npm run build --prefix web -- --webpack`; start with `npm run start --prefix web -- --port 3100`. Record the branch, base SHA and local diff alongside the cut. Use a fresh browser context dedicated to the synthetic demo; preserve the user's existing storage.
3. Suggested capture canvas: 1440×1000 CSS pixels at normal browser zoom. Keep status chips, archive source and scope in frame. Let the user select their recording software and operate it; this task does not authorize agent desktop input. Use the browser fixture only for the keyboard segment.
4. Rehearse the exact route order above. Prepare the local saved-version segment in the fresh context. Keep the successful and diagnostic archive routes in separate browser tabs to avoid wasting the cut on scrolling. Never imply an archival result was produced by the newly saved Fernway version.
5. Narrate over the transcript; do not synthesize a voice and present it as NVDA. If actual historical audio is later supplied and authorized, identify its run and profile and keep its provenance intact. No audio was fabricated here.
6. Record distinct takes for recorder, successful archive, failed archive, simulation slate and status. Preserve the available/archived/simulated captions through edits. Cut pauses freely, but do not remove refusals or splice a simulated patch into an apparent native success.
7. Add captions and a credits card: existing synthetic Fernway fixture; archived NVDA R1 evidence; Next.js, React, Tailwind CSS, Playwright and axe-core; consult existing `docs/ledger/PROVENANCE.md` for exact licenses and event new-work attribution. Identify this task as local presentation polish and storyboard work. No Claude co-author attribution.
8. Watch the full rough cut once with sound muted for captions and once for narration. Confirm that every numerical result shown comes from its named archive or the current check report. Do not add accuracy, speed, compliance, repair-success or coverage claims.

## Fallback and stop conditions

- This cut is local by design. Archived evidence inspection is labelled in the main story, not secretly substituted for a live run. If a local action fails, show its actual state or cut that segment with an explicit “recorded earlier” label and timestamp; never imply completion.
- If a proposed shot requires sign-in, hosted data, paid diagnosis, a native worker, a qualification change or real input outside Chromium, stop that shot. Separate authorization and the existing qualification gates still apply.
- Cross-tool Claude review remains required by project governance for demo-visible changes. This task cannot certify that review or native acceptance. Keep this local cut as a review candidate until those reviews are supplied.
