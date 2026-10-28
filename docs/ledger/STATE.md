# STATE — D-53 / A15 configuration-only candidate ready for Claude review
Updated: 2026-10-28T15:00:38Z · by: codex
- HEAD: b7a0bcd53a868c749e331fcc810860885ff16f16; branch fix/D-53-a15-configuration; no commit/push/staging.
- User selected Claude configuration-only design; prior observer/toggle proposals rejected.
- Only runtime delta: steps.json nvda_settings.virtualBuffers.enableOnPageLoad=false; keyboard settings retained.
- Existing start settings and C1 readback unchanged; exact false survives vendored INI build/parse; missing/true rejected before page opens.
- All10 step objects/key sequence/speech expectations unchanged; 3/3 and1000ms ack/foreground/send/evidence rules unchanged.
- A15 verbatim in F-02 outside Day-1 gates; re-lock changes only PLAN#F-02 and steps hashes; full previous lock retained.
- MEASURED RED6 fail/1 pass -> GREEN7/7 A15 tests; full npm test213/213; preflight all12 locks/10 pins/vendor/gates pass.
- R1 #3 remains scored FAIL/no rerun; append-only RUNS row added; no historical evidence changed.
- Prior uncommitted D-53 STATE and LOG preserved in local review evidence; original LOG bytes retained as prefix.
- Earlier investigation found source-supported browse interception; its occurrence in #3 remains INFERENCE; original artifact digest retained.
- Next: owner supplies exact sealed diff + verification evidence to independent Claude; no cross-tool approval claimed yet.
- Live uncertainty: real delivery/speech under A15, especially dialog confirmation/status at step9, needs separately authorized hosted qualification.
- No source/vendor/workflow/fixture HTML/dependency changes, observer, mode-toggle, local NVDA/input, Meta/install/dispatch/commit/push.

## Handoff
Uncommitted: fixtures/r1/steps.json, fixtures/r1/lock.json.
Uncommitted: test/speech.test.mjs — seven new contract tests and approved synthetic-fixture profile updates.
Uncommitted: docs/ledger/PLAN.md, docs/ledger/DECISIONS.md.
Uncommitted: docs/ledger/LOG.jsonl, docs/ledger/STATE.md — includes preceding D-53 work.
Uncommitted: docs/ledger/RUNS.md — scored FAIL appended.
Verified by: npm test ->213/213; node scripts/preflight.mjs ->ok; node scripts/r1.mjs --hashes ->matches.
Proposed commit: none authorized; candidate awaits independent Claude review.
Review needed from: Claude on exact sealed eight-file diff; hosted execution requires separate explicit approval.
