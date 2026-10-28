# Read-only review: A14 spoken-title nonce correction (D-49)

Reviewer: a separate Claude agent, read-only on the repository, with tests and fault injection run only in its own scratch copy. It is the same model vendor as the implementer (Claude), so this is not a cross-vendor review. Date: 2026-10-28. Base: `5a5d864b165aecf56074a790ba61a30bfa06e88e`, uncommitted working tree.

Verdict: **APPROVE WITH NOTES**. No blocking findings.

## Bytes reviewed (sha256, all matched the request)

| File | sha256 |
|---|---|
| `src/speech/validate.mjs` | `dbcba82abf27ae5ec8eadcc022964cae8e550154b2ef002ce85bdbcbb8bcb88a` |
| `src/speech/capture.mjs` | `39b3b01ff369393848b21732a83f373904a93bf0a0c855b5a429c73ca0114d23` |
| `test/speech.test.mjs` | `2e0236f59f03bc40ddc090682f086e6ec6886af5687b06bdde678b207a0f3619` |
| `fixtures/r1/lock.json` | `cf7644b8bf1270758c6446f90b8bc26db7b66028824120931bff66c8155f9002` |
| `docs/ledger/PLAN.md` | `6b37ce39c695efe150f680df9b1b1444b01f2a50f2e5f2b5182deb81b2315e69` |
| `docs/ledger/DECISIONS.md` | `889881e6863743e43cca0d40be45f5d419cfaaef6f910da5b95f57ab210bcbac` |

## Findings

1. Scope (note, MEASURED). The source changes are only the shared `spokenTitleHasNonce`, the rejection-only `speechHasSpacedNonce` and the `judgeAttempt` call in `validate.mjs`, plus the import and one call site in `capture.mjs`. The test diff is one appended hunk with 0 removed lines. `foreground.mjs`, `sendguard.mjs`, `runguard.mjs`, `browser.mjs`, `vendortree.mjs`, `scripts/`, `.github/`, `signup.html`, `steps.json` and `vendor/` are byte-unchanged.
2. Regex soundness (note, MEASURED).
   - Every UTF-16 code unit from U+0080 to U+FFFF was tested against `[0-9a-f]` with `/i`: 0 matches, including the Kelvin sign, long s and fullwidth digits.
   - 35 crafted cases behaved correctly. Rejected: tab, NBSP, zero-width space, CR, LF, leading or trailing space, 7 or 9 hex characters, extra text, an unknown suffix, `R11` and `sign up`. Accepted: the observed title, the plain title, the Chromium suffix and uppercase.
   - A 200,000-case fuzz run produced 106,403 accepts, and none decoded to anything other than the expected nonce.
3. Spec wording (non-blocking). `' *'` allows zero or more spaces between nonce characters, but A14 said only "only ASCII spaces".
4. D-49 impact (non-blocking). D-49 described the widening but not the tightening: a title with the contiguous nonce and other wrapper text was accepted before and is now a setup failure. That cannot admit a wrong window, but on attempt 2 or 3 it would make the run FAIL with no rerun. A14 and the D-49 quote were byte-identical.
5. False rejection by the foreign-nonce check (note, INFERENCE). The fixture speech has no run of 8 space-separated hex characters, and even if it did, the chance of matching a random other nonce is about 16^-8 per position.
6. Native identity (note, CITED and MEASURED). `foregroundMismatch` still requires this attempt's Chromium PID and the contiguous nonce in the native window title. The file is byte-unchanged and its lock hash is unchanged.
7. Raw evidence (note, CITED). `title_phrase` and raw speech are stored verbatim, and the historical R1 #1 replay stays FAIL.
8. Lock (note, MEASURED).
   - `supersedes` deep-equals the 5a5d864 lock, and the decisions list gains only D-49.
   - Only PLAN#F-02, `validate.mjs` and `capture.mjs` changed.
   - `node scripts/r1.mjs --hashes` gave 23 entries with 0 mismatches.
   - The Day-1 gates hash is `ca0c9feb…3362`.
9. Fault injection (non-blocking). 10 injections were tried and 8 were caught. Two were not:
   - removing the `^` anchor alone, which is still guarded by the full-length check;
   - dropping the `i` flag from the spaced foreign-nonce pattern. This is a real test gap: nothing tested an uppercase, spaced foreign nonce.

Runs (MEASURED, in the reviewer's own copy): `npm test` 205 pass, 0 fail; the N1 tests 14 pass, 0 fail.

## Limitations

- Everything was offline, using fakes. Nothing ran against real NVDA, Chromium or GitHub Actions.
- The real R1 #1 artifact was not re-judged; the review relied on the N1 replay tests.
- The reviewer is the same vendor as the implementer.
- Only the nonce, title and raw-evidence parts of `capture.mjs` were read.

## Disposition (implementer, after the review)

- 3: A14 now says "zero or more ASCII spaces (U+0020), and nothing else, between them". The D-49 quote was updated identically, and PLAN#F-02 was re-locked.
- 4: D-49's frozen-spec impact now records the tightening and its FAIL/no-rerun consequence on attempts 2 and 3.
- 9: an uppercase spaced foreign nonce case (`2B 11A 7F 2`) was added to the N1 stale-detection test, and a matching mutant was added to the mutation set.
- Because of these changes, the bytes reviewed above are not the final bytes. The final hashes and the re-run results are in `docs/ledger/LOG.jsonl`.
