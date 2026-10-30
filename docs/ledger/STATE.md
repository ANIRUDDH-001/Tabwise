# STATE - R2-L2 S3 + S4 + C-1 implemented offline; PR pending
Updated: 2026-10-30T14:12:18Z
Branch: feat/tabwise-r2-l2-s3-evidence-offline (HEAD 91744678, S1+S2 merged)
## Now / next / blocked
- Now: S3 evidence verifier, S4 approval policy and C-1 key semantics integrated offline; R2 remains disabled/BLOCK.
  H1 completeness, H2 captureJourney contract, H3 mutation-backed state, M1 intent VKs/Shift prefixes, M2 cap tests.
- Next: owner PR and hosted CI; then C-3, S5a/S5b, S6 and S7. Windows NVDA qualification remains blocked.
- Blocked: R2 qualification, live NVDA, physical input. P-1 was provisionally exercised in real Chromium 153
  via a separate Cloud session (not this session); pinned Chromium 156 and Windows NVDA remain unverified;
  P-1 is NOT fully qualified. P-2/P-3 unmeasured. genuine-unqualified/qualified unreachable until S5b/S6.
## Last verification (MEASURED, owner Windows Node v24.22.1)
- R2 regression: 421/421 PASS; exit 0.
- Ordinary offline profile: 48/48 selected files PASS, 9 excluded; exit 0.
- Frozen R1 baseline: ok true, errors []; exit 0.
- Git diff --check: exit 0; informational LF-to-CRLF warnings only.
- S4 CRLF test corrected; R2_FILES includes the S3 evidence writer.
- Chromium 153 P-1 provisional; pinned Chromium 156 and Windows NVDA unverified.
- R2 qualification remains disabled/BLOCK.

## Review fixes (review these)
- H1: no accepted page read -> reason; no capture.json -> reason; intents/keys/records short of the step map
  -> reasons. Empty writer seals incomplete (S3-N20).
- H2: capture.json checked against the real src/r2/capture.mjs shape; positive tests now run the real
  captureJourney on a fake Node clock. Completed capture needs COMPLETE outcome, success statuses, judgeKeys
  acknowledgement, exact ack_seq, contiguous associated events, >=2 samples, no reasons/invalidation/gate_stop,
  and exactly one unrecorded boundary read. Incomplete captures keep diagnostics as reasons (S3-N8, N21, N22).
- H3: a changed state needs a mutation event in the same read; an app event alone is refused (S3-N12, N23).
- M1: intents exactly {action, keys} with the press VKs; wrong key/shift -> reason; Shift outside Shift+Tab or
  not followed by shifted Tab -> error; trailing Shift -> reason; shift_prefix recomputed exactly (S3-P9, N24, N25).
- M2: 12 MB unchanged. 3 and 4 actions at pollMs 20 fit; 3 and 4 at pollMs 10 refused (S3-P10, N1).
  Note: captureJourney's default pollMs is 10, so a caller must pass pollMs >= 15 (3 actions) / 20 (4).
## Residual risks
- A forger rewriting every delta, hash, lane and capture consistently is undetectable offline: class synthetic.
- Shift+Tab coverage uses a test-only approved task over the validation fixture bytes (no Shift+Tab pair exists).
- S1/S2, capture.mjs and frozen R1 source unchanged; timeout/ack semantics unchanged.
## Handoff
- Files: scripts/tabwise/r2-evidence.mjs, test/r2-evidence.test.mjs (untracked), ci/offline-tests.json,
  docs/CODEMAP.md, docs/ledger/{STATE.md,LOG.jsonl}. Frozen R1, vendor, workflows, statuses unchanged.
- Suggested owner commit: "feat(r2): R2-L2 S3 evidence writer and independent verifier (offline)".
