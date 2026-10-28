# STATE — R1 #1 nonce correction (D-49)

Updated: 2026-10-28T05:03:38Z · by: claude

- Now: D-49 approved A14 (PLAN F-02): one shared spoken-title recognizer accepts the nonce with ASCII spaces between its characters.
- R1 #1 (workflow 40629513668 at 5a5d864) stays a recorded FAIL, setup-failed before step 1. Evidence and RUNS row unchanged.
- Root cause: capture.mjs (initial NVDA+T check) and validate.mjs (freshness) needed a contiguous nonce; NVDA spoke "1b 11a 7f 2".
- Change: `spokenTitleHasNonce` (exact fixture label, 8 hex, U+0020 only, two known suffixes) used by both callers; spaced foreign nonce rejected per utterance.
- Unchanged: native foreground PID + contiguous window-title nonce, send gates, steps, expected speech, 3/3, thresholds, fixture, pins, vendor tree.
- Lock: re-locked 2026-10-28T04:59:09Z with D-49 (after review wording fix); only PLAN#F-02, validate.mjs, capture.mjs changed; old lock under `supersedes`.
- Tests: 205/205 in the worktree and in a read-only CRLF export (12 N1 regressions + 2 end-to-end; uppercase spaced foreign case added). Gates hash ca0c9feb…3362 unchanged.
- Mutants on the final bytes: 16/16 meaningful detected (the 8 from D-48 plus 8 added); 1 equivalent excluded. N1 baseline 14/14.
- Review: separate read-only Claude agent (same vendor): APPROVE WITH NOTES, no blockers; notes fixed and re-reviewed (docs/reviews/R1-spoken-nonce-review-d49.md).
- Next: user commits and pushes to main. A second (setup-only) R1 run needs the user's separate approval.
- No NVDA, desktop input, Actions dispatch, R1 retry, Meta calls, installs, commits or pushes in this work.

## Handoff
Uncommitted: docs/CODEMAP.md, docs/ledger/{DECISIONS,LOG.jsonl,PLAN,RUNS,STATE}.md, fixtures/r1/lock.json
Uncommitted: src/speech/{validate,capture}.mjs, test/speech.test.mjs
Uncommitted (new): docs/reviews/R1-run1-analysis-codex.md, R1-run1-offline-results.json, R1-spoken-nonce-proposed.patch, R1-spoken-nonce-review-independent.md, R1-spoken-nonce-review-d49.md
The .patch is the D-48 proposal as reviewed; applied under D-49 with two comment edits, so it no longer reverse-applies.
Publication: main only (D-44). A rerun is eligible (attempt-1 setup failure) but not approved.
