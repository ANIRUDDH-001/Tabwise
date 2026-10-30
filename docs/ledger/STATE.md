# STATE - R2-L2 S3 review fixes (H1-H3, M1-M3) applied offline; uncommitted
Updated: 2026-10-30T13:42:01Z
Branch: feat/tabwise-r2-l2-s3-evidence-offline (HEAD 91744678, S1+S2 merged)
## Now / next / blocked
- Now: S3 r2-evidence.mjs + test/r2-evidence.test.mjs (untracked) revised for the independent review:
  H1 completeness, H2 captureJourney contract, H3 mutation-backed state, M1 intent VKs/Shift prefixes, M2 cap tests.
- Next: re-review of the revised S3; owner commit/PR. Then S4, S5a/S5b, S6, C-1, C-3.
- Blocked: R2 qualification, live NVDA, physical input. P-1 was provisionally exercised in real Chromium 153
  via a separate Cloud session (not this session); pinned Chromium 156 and Windows NVDA remain unverified;
  P-1 is NOT fully qualified. P-2/P-3 unmeasured. genuine-unqualified/qualified unreachable until S5b/S6.
## Last verification (MEASURED, this session, Node v24.22.1)
- node --test test/r2-evidence.test.mjs: tests 36 (10 positive, 26 negative), pass 36, fail 0.
- Before concurrent S4 edits: r2*.test.mjs 408/408; ordinary offline exit 0, 48/48 files PASS.
- After concurrent S4 edits (another session, ~13:38Z: capture.mjs, contract.mjs, r2-review/r2 tests,
  r2-policy.mjs, r2-status.json): r2*.test.mjs 420/421, the 1 fail is S4 "CRLF checkout is the same text"
  in r2-review.test.mjs; ordinary offline exit 1, 47/48 (r2-review FAIL). Not S3; S3 did not touch them.
- node scripts/check-r1-baseline.mjs: ok true, errors []. git diff --check: clean (LF->CRLF warnings only).
- Mutations: 63 one-at-a-time edits of r2-evidence.mjs (32 Phase 1 + 35 review, 4 superseded), 62 fail
  >=1 test; survivor = lane-cap backstop (encodeBounded enforces it first). Restored, sha256 d7688804.
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
