# STATE - R2-L2 C-3 + S5a: Windows accepted; integration PR pending
Updated: 2026-10-30T18:22:15Z
Base: main 015128ba (PR #11 merge). Owner Windows acceptance complete; integration PR pending.
## Now / next / blocked
- Now: independent review returned CHANGES REQUIRED on patch 320430eb...6e38; both corrections applied:
  A (C-3): redactNonce refuses nonce-sanitization-ambiguous when any sanitized record still holds the complete
    nonce (any case), e.g. prefix3f9a0c1bsuffix, account-3f9a0c1bZ, hello 3f9a0c1b7 next. Old test that allowed it replaced.
  B (S5a): the final jsonOnly(result) is inside a fail-closed boundary: failure stops the gate (protocol,
    "R2 compose result refused: ...") and throws; no result escapes.
- Next: owner commit/push and hosted Windows CI; then S5b/S6 (handoff §12). S7 remains owner-gated.
- Blocked: genuine C-3 positive (S3 class never genuine-unqualified until S5b/S6). R2 qualification, live
  NVDA, physical input. R2 disabled/BLOCK; FEATURES.json and thresholds unchanged.
## Verification (MEASURED; Cloud Linux Node 22 and owner Windows Node 24.22.1)
- RED: payload-context + binding 154 tests, 10 fail (all new/corrected tests); GREEN 154/154.
- Mutations M24-M29: 6/6 killed, hash-verified restore (total 29/29 meaningful killed).
- node --test --test-timeout=20000 test/r2*.test.mjs: 561/561 PASS, exit 0.
- offline-tests ordinary seed 1: 45/48; 3 FAIL environmental (qualification-loader, review-integrity,
  vendor: no node_modules/@guidepup), identical at baseline.
- offline-tests stress seed 113262: 7 profiles 45/48 each (same 3); random-113262 cannot run on Node 22
  (bad option --test-randomize). No R2 file failed anywhere.
- check-r1-baseline: ok true, errors [], exit 0. git diff --check: exit 0.
- Owner Windows Node 24.22.1: R2 561/561; ordinary 48/48; stress 8 profiles x 48/48.
- Frozen R1 ok true, errors []; git diff --check exit 0; R2 disabled/BLOCK.
## Review focus
- speech-payload.mjs redactNonce complete-nonce check; r2-compose.mjs final try/catch.
- Residual (disclosed, O-12): contiguous partial (3f9a) or nonce split across records/phrases unspaced.
## Handoff
- Record: docs/engineering/R2-L2-C3-S5a-handoff.md (§2, §3, §6, §7, §8, §9, §11, §14 updated).
- New patch in Claude scratchpad (R2-L2-C3-S5a-r2.patch); old checksum superseded.
- Owner action: review, Windows run, commit per handoff §15; R2 BLOCKED.
