# R1 #1: spoken nonce failure and proposed correction

**Finding:** the captured title contains the correct eight hexadecimal characters, separated by ASCII spaces. Both the initial title check and the final freshness validator demand a contiguous substring. This explains the recorded setup failure. The correction below is an offline proposal, independently reviewed, requiring approval of the frozen spoken-title rule before activation.

**Historical result remains FAIL / setup-failed before step 1. No new execution is authorized.**

## Evidence identity and preservation

MEASURED, run `r1-20261028T035811Z`: [workflow 40629513668](https://github.com/ANIRUDDH-001/Tabwise/actions/runs/40629513668), job `122622360284`, source commit `5a5d864b165aecf56074a790ba61a30bfa06e88e`. The job's offline tests passed; its R1 step failed; diagnostic, upload and evidence-contract steps succeeded.

The complete artifact is [r1-evidence-40629513668-1](https://github.com/ANIRUDDH-001/Tabwise/actions/runs/40629513668/artifacts/12790378634), artifact ID `12790378634`. Its downloaded ZIP SHA-256 is `91cb57c122f92879e534a99f87e61e21848a8fd2c9d3b40e40a04b99e037a1f6`, matching both the GitHub artifact metadata and the job's upload log. All seven files were inspected: empty `attempt-1.jsonl`, `focus-1.jsonl`, `raw-1.json`, `sends-1.jsonl`, `summary.json`, `_runner/job.json`, and `_runner/nvda.log`. The complete decoded job log was also preserved. Signed download URLs and credentials are not included in these records.

The archive and extracted evidence are kept read-only in a new investigation copy under `%TEMP%/tabwise-r1-40629513668-7e0841f2/`. Each evidence file was hashed before analysis and checked afterward; no byte changed. Nothing under historical `docs/evidence/` was edited, and the remote artifact was not changed. The companion `R1-run1-offline-results.json` contains the seven file hashes, source identity, measurements and prototype hashes.

## Root cause

The summary, raw speech and action journal agree on:

```text
Expected nonce: 1b11a7f2
Captured title: R 1 sign-up 1b 11a 7f 2 - Google Chrome for Testing
```

MEASURED: the source at the executed commit matches the current published checkout, all 12 file/spec hashes, 10 upstream pins, vendor-tree hash and seven reported test hashes. The relevant predicates are:

- Initial decision: [capture.mjs:323-325](https://github.com/ANIRUDDH-001/Tabwise/blob/5a5d864b165aecf56074a790ba61a30bfa06e88e/src/speech/capture.mjs#L323-L325) records the title unchanged, then evaluates `a.title_phrase.toLowerCase().includes(nonce)`.
- Final freshness: [validate.mjs:79-81](https://github.com/ANIRUDDH-001/Tabwise/blob/5a5d864b165aecf56074a790ba61a30bfa06e88e/src/speech/validate.mjs#L79-L81) repeats the contiguous title comparison and searches for other attempt nonces as contiguous substrings.

Both own-title predicates return false for the captured text. The grouped field consists of `1b`, `11a`, `7f`, `2`; its eight characters in order are exactly `1b11a7f2`. This is a representation mismatch, not a missing or incorrect character. The captured representation alone does not determine which speech/relay formatting layer introduced each space; no pronunciation or audio claim is needed to establish the code failure.

Replay through the actual original validator reproduces all four recorded reasons: title lacks this attempt's nonce, no step 1 record, setup-failed status, and zero of ten steps. The initial return precedes `clearSpokenPhraseLog()` and the ten-step loop, explaining why the raw log contains only the title and the attempt journal is empty.

The other hypotheses were checked against the full artifact:

| Hypothesis | Evidence and conclusion |
|---|---|
| Wrong window or nonce caused this comparison to fail | Eight checks report `ok`, `pid_ok` and `nonce_ok` true. The captured title has the expected ordered characters and fixture label. These records support the formatting diagnosis, subject to the native-reading limit below. |
| Stale/mixed speech caused this observed failure | There is one attempt and one raw phrase, identical to the action journal and summary title. No second attempt nonce is present in this evidence. |
| Transport, cleanup or evidence damage caused the stop | The summary records no interference, write error, evidence-check finding, cleanup error, refused send, missing acknowledgement or unsettled send. The attempt error is explicitly `reported title lacks the nonce`. |

MEASURED LIMIT: the passing focus records contain booleans and timing, not successful raw foreground PID/title values. The artifact cannot independently reconstruct those native readings or prove exclusive window ownership. NVDA PID and relay PID are both recorded as `8960`; that is separate from the unlogged browser PID. This diagnosis establishes the deterministic comparison failure and the software's reported checks, not general native-input safety.

Three step-0 send intents are recorded: two Control sends and one Insert+T, all within NVDA-T. Their acknowledgements are consumed/unconfirmable, as designed. No form-step send or step record is present. The recorded `rerun_allowed: true` is setup eligibility, not permission to dispatch. An empty top-level `result_reasons` does not mean there was no error: the attempt's error and reasons contain it. Nothing in this proposal suppresses those fields.

## Proposed patch and boundaries

`R1-spoken-nonce-proposed.patch` applies cleanly to the executed commit and changes only:

1. `src/speech/validate.mjs`: shared `spokenTitleHasNonce()` and rejection of known spaced foreign nonces within individual original phrases.
2. `src/speech/capture.mjs`: use the shared title predicate at the initial check.
3. `test/speech.test.mjs`: append 12 regression tests; preserve the entire existing test file and its assertions.

Positive matching is a strict, case-insensitive, whole-title grammar: `R1` or the observed `R 1`, the unchanged literal `sign-up` label, exactly eight hex characters with only ASCII U+0020 spaces between them, and either no trailer or the known ` - Chromium` / ` - Google Chrome for Testing` trailer. The derived eight-character field must equal the unchanged expected nonce. Punctuation removal, number-word or letter-word conversion, substitutions, fuzzy matching, Unicode whitespace and extra title content are excluded. The original phrase is never rewritten.

The same predicate controls initial acceptance and final freshness. Applying a fix at only one caller leaves the other failure intact.

A related OFFLINE defect also needs closure: otherwise healthy evidence currently passes freshness when a known other attempt's nonce appears with spaces. The proposal preserves the original literal rejection and adds a rejection-only matcher for that known nonce's exact characters with ASCII spaces inside one original title/raw/step phrase. It catches mixed and duplicate stale titles. It never joins separate utterances and is never used to accept the current window. A coincidental known foreign sequence is conservatively rejected rather than treated as positive identity evidence.

Unrelated speech such as `Notepad 1b11a7f2`, nonce-only strings, URLs containing the nonce, incorrect fixture labels, mixed titles and unknown trailers fails the positive grammar. Wrong PID or a native title containing only the spaced nonce still fails before title-report input: `foregroundMismatch()` is unchanged and still requires the expected PID plus the contiguous nonce in the native title. Text cannot distinguish an exact forged copy of an expected title; native process checks remain an independent requirement. No stronger identity guarantee is claimed from normalization.

Raw title, raw speech, action journal values, errors and historical outcome are preserved. The fixture, expected step speech, step count, 3/3 requirement, reset/ownership checks, send gate, 100 ms freshness bound, acknowledgements, timing/cost ceilings, workflow and dependencies are unchanged.

## Offline verification and independent review

Before running tests, the vendor-test isolation was inspected: process and socket sends are blocked before vendored code loads, and speech tests inject fake NVDA/browser/foreground boundaries. No real NVDA, browser, foreground helper or desktop input was used in this investigation.

| Check | Result |
|---|---|
| First 10 new behavioral tests against original source | 7 fail, 3 pass; both observed-title callers fail for the expected reason |
| Expanded 12 tests against original source | 8 fail, 4 pass |
| Restored proposal focused suite | 12 pass, 0 fail/cancelled |
| Proposal full `npm test` | 203 pass, 0 fail/cancelled |
| CRLF/read-only proposal full `npm test` | 203 pass, 0 fail/cancelled; all 407 protected source files remain read-only |
| Targeted fault injection | Eight meaningful mutants detected; restored suite 12/12 |
| Published baseline integrity | All 23 lock entries match; frozen gates unchanged |
| Proposal integrity | Only capture/validate intentionally differ from the existing source lock; other pinned files, dependencies, vendor tree and frozen gates match |
| Historical preservation | ZIP and all seven evidence-file hashes unchanged; historical replay remains FAIL |

The eight faults restore either old caller, disable spaced-foreign rejection, globally strip title characters, permit multiline identity, ignore the final nonce character, join foreign phrase boundaries, or generalize whitespace. One additional length-guard-only mutation is equivalent under the actual non-multiline regex flags and is excluded from the detection count. The Node runtime check and that qualification are retained in the evidence; there was no syntax-error or timeout-based mutant claim. The older D-43 32-mutation set was not rerun for this pure text proposal.

The appended tests cover the observed title, case folding, all space partitions of the eight characters, incorrect/missing/extra digits, substitutions, punctuation and spoken-word ambiguity, duplicate/mixed and unrelated titles, tabs/NBSP/zero-width/newline cases, stale identifiers in raw/step speech, phrase boundaries, native PID/title refusal, error retention, reused nonces and historical FAIL preservation.

Independent verdict: **APPROVE THE PROPOSAL FOR USER REVIEW; no blocking defect found.** See `R1-spoken-nonce-review-independent.md` for its exact candidate hashes and separate adversarial probes. This is a separate same-vendor/model source review with scoped offline measurements, not R7 completion or independent native execution. No new R1 run was performed.

## Frozen-rule approval is required

**Yes: explicit approval is required before activating this correction.** It changes the frozen A4 spoken-title interpretation: a representation previously rejected would now be accepted. Stronger context and exact-character checks do not make that acceptance change disappear. The general engineering delegation does not silently amend the frozen spoken-title rule.

Suggested prospective amendment for approval:

> The initial NVDA+T title check and final spoken-title freshness check use one shared, case-insensitive, whole-title recognizer for the unchanged fixture label: R1 or R 1, sign-up, an exact eight-hex nonce field allowing only ASCII spaces between its characters, and an absent or explicitly recognized Chromium/Google Chrome for Testing trailer. The decoded field must equal the expected nonce. Known other attempt nonces remain forbidden, including their exact ASCII-spaced representation within a single original utterance; utterances are never joined for that added recognition. Native PID and contiguous native-title nonce checks, all send safety checks and all other acceptance thresholds remain unchanged. Original speech and errors are preserved.

After approval, apply the reviewed three-file patch, record the approved interpretation inside PLAN's F-02 spec, and re-lock both source files plus the amended spec. Recheck the exact final bytes, full tests and integrity before any publication/execution decision. The prototype deliberately does not satisfy the current lock on its two changed source files and is not ready to execute as real R1 under that lock.

Only then may a separate request name a newly reviewed/published commit for a setup rerun under the existing eligibility rule. This report does not request or authorize that execution. The original FAIL and evidence remain unchanged. No prototype source was applied to the live checkout, no lock was regenerated, and nothing was committed or pushed during this investigation.
