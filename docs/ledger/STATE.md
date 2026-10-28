# STATE — F-02 engineering handoff

Updated: 2026-10-28T03:43:52Z · by: codex

- Now (D-47): T16 clears read-only only on its own temporary vendor copy; all five drift assertions are unchanged. The user authorizes Codex to commit/push exactly six files to main. No execution is authorized. This correction is based directly on 918c8f5; the publication SHA is identified by Git history.
- Previous: reviewed R1 safety bundle a628cd1 published to main under D-46. Manual workflow available; not triggered.
- Publication: main only (D-44). Earlier records commits e09a068 and0932f68; final engineering records accompany this handoff.
- Completed software repair: conservative request-start freshness, mandatory before hook, strict ack class/reasons and exact ack deadline.
- Completed transport/lifecycle repair: framing, unexpected-loss failure, bounded owned reset/start and relay PID equality.
- Completed evidence repair: intent persistence before dispatch, terminal check after raw capture, retained failure/cleanup diagnostics.
- Last verification (D-47): original T16 fails EPERM in a CRLF read-only export; corrected full suite191 pass,0 fail,0 cancelled. All405 protected source files remain read-only. Pure integrity audit:23 entries,0 mismatches; frozen gates unchanged.
- Historical D-43 mutations:32/32 detected; individual cancellations disclosed in the D-43 report. Not re-run for this temp-copy-only correction.
- Integrity:12 normalized file/spec hashes,10 upstream pins,40 vendor files; no mismatch. Frozen gates ca0c9feb...3362 unchanged.
- Independent technical review: APPROVE;61manifest matches and all60staged files checked (vendor exact, text EOL-normalized).
- Remaining material send-boundary/false-PASS blockers: none found by final independent review; this is not native execution evidence.
- R1 remains NOT RUN/NOT PASS; FEATURES passes=false. No live three-attempt run performed here.
- Next: after publication verify remote SHA,parent,full read-only suite and lock integrity; real R1 requires a separate named-commit approval.
- Blocked by explicit boundary: user approved publishing, explicitly said do not run it. No execution authority inferred.
- No NVDA, desktop keystrokes, Actions run, Meta calls or dependency installation during this engineering session.
- Native PID/foreground mapping, hosted desktop/audio/VBScript and cleanup behavior remain unmeasured.
- Residual: launched OS input cannot be recalled; an identical foreign key inside the send window is indistinguishable.
- Historical I-01 and D39/D42 BLOCK reports preserved unchanged.

## Handoff
- Active engineering checkout: this managed worktree; original D:/Projects/Meta AI/app mixed checkout preserved, no baseline file drift.
- Records: docs/reviews/R1-D43-review-independent.md; docs/engineering/F-02-{operations,ownership-plan,experiments}.md.
- Machine evidence: F-02-verification.json, F-02-mutation-results.json, F-02-source-manifest.json.
- Reproducible offline fault harness: node docs/engineering/F-02-mutations.mjs from repo root; creates only unique scratch copies.
- Raw artifacts: D-47 %TEMP%/tabwise-d47-76730bc4; older D-43 %TEMP%/tabwise-owner-4563fa9d.
- Never run npm run r1 locally, trigger Actions or make Meta calls without the applicable separate approval.
