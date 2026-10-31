# R2-L2 O-12 + O-10 handoff

Task: F-03 / R2-L2, D-85. Implementer: Claude, with the owner's 2026-10-31 decision designating Claude as primary implementer. Cost: $0. There are no model calls, no paid services and no network calls. R2 stays disabled/BLOCK, and `scripts/tabwise/r2-status.json` is unchanged.

## Status

| Item | Status |
|---|---|
| O-12 `nonce-redact/2` | Implemented and offline-tested |
| O-10 offline verifier (adapter + policy) | Implemented and offline-tested with an in-memory fake only |
| O-10 authentic signed-artifact verification | **PENDING**. No real gh, bundle or attestation has been run (D-85) |
| S7 workflow attestation step | **PENDING OWNER APPROVAL**. Proposal is outside the repo: `../R2-S7-attest-workflow-proposal.md` |
| Live R2 qualification | **BLOCKED** |

## O-12: `nonce-redact/2` (`src/r2/speech-payload.mjs`)

**Detection.**
- Detection runs on a copy that is never written back. Each code point is lowercased, NFKD-decomposed, stripped of marks, format and default-ignorable characters, then lowercased again. Mathematical and squared capitals have no lowercase mapping until they are decomposed; the adversarial review found this.
- A token that spells a digit word ("three") counts as one unit; any other token gives one unit per hex character.
- Separators, observer phrase boundaries (`\n`) and record boundaries are transparent, so chunked speech such as `24b 3a 9b 5` joins back into the nonce.
- An occurrence must start at a token start and end at a token end, so a nonce glued to letters or digits is never cut out silently.

**Refusals.** Each refusal is `nonce-sanitization-ambiguous` and forwards nothing. The text is refused when:
- the nonce crosses a record or phrase boundary;
- occurrences overlap;
- there are more than 256 occurrences;
- a marker (NFKC form) is already present;
- after redaction the complete nonce remains anywhere, including as digit words or glued to letters;
- after redaction any run of 4 or more consecutive nonce characters remains.

**Record.**
- The record is `{version:'nonce-redact/2', edits:[{seq,start,end}]}`, with raw UTF-16 offsets only.
- It carries no plaintext original and no `sha256(nonce)`, which is reversible for a 32-bit nonce.
- Raw capture is never modified, and edits replay exactly.
- A supplied record with any other version, including `nonce-redact/1`, is refused as "not re-verified or migrated".
- `BUILDER_VERSION` is `tabwise-r2-speech-payload/2` and `ARM_INPUT_SCHEMA` is `tabwise-r2-speech-arm-input/2`.

**Disclosed contract-driven test changes** (`test/r2-payload-context.test.mjs`):
- P4, P5 and P7 expect the v2 record shape.
- Supplied-record negatives now cover v0 and v1 refusal and an extra `nonce_sha256` key.
- The `3 ,, f 9 a 0 c 1 b` ambiguity row moved to an O12-R redaction row.
- The contiguous record-boundary split is now refused. v1 had disclosed it as an eligible limitation.
- The mixed-form test expects offsets.

**Evidence** (all MEASURED, this session):
- RED: 39 of 128 tests failed. GREEN: 130/130 after the added rows.
- Review fix: RED 2/132, because bold and squared capitals let `deadbeef` through unchanged. GREEN: 132/132.
- Mutation testing: 15/15 mutants killed, including M15 "no lowercase after NFKD", and source restored. Script: scratchpad `o12-mutate.cjs`.
- Runtime: ASCII 400k code units 397 ms; fullwidth 200k 428 ms; zero-width 200k 131 ms; hex run 400k 487 ms.
- False refusals: 277 of 1,600,000 (0.0173%) over ordinary strings × random nonces. In-test bound: ≤0.1% over 3000 nonces.

## O-10: offline hosted-provenance verifier (`src/r2/provenance.mjs`)

**Hybrid split (D-85).** GitHub's `gh attestation verify` does all of the cryptography: bundle, certificate chain, transparency log and timestamps, checked against an owner-supplied trusted root. This module contains no X.509, Sigstore or Rekor code and adds no dependency.

**Adapter.**
- The gh binary is pinned by owner-policy absolute path and SHA-256. Shell wrappers (`.cmd`, `.bat`, `.ps1`, `.sh`) are refused.
- The `--custom-trusted-root` file is pinned by owner-policy `trusted_root_sha256`. It is checked before gh runs, re-read afterwards, and refused if changed. A caller-chosen root would let anyone issue a matching certificate; the adversarial review rated this critical.
- gh runs via `spawn(file, argv, {shell:false, cwd: dirname(gh)})` with a minimal environment: no `GH_TOKEN`, `GITHUB_TOKEN`, `GH_HOST` or `GH_REPO`. `spawn` is captured at module load, so rebinding `child_process.spawn` later still counts as simulated.
- The timeout is ≤60 s and stdout+stderr are capped at ≤4 MiB. The run must exit 0 with no signal.
- Argv: `attestation verify <run>/run-manifest.json --bundle= --custom-trusted-root= --repo= --signer-workflow= --source-digest= --source-ref= --cert-oidc-issuer= --predicate-type= --deny-self-hosted-runners --format=json`.

**Policy.** The policy is owner-controlled (`tabwise-r2-provenance-policy/1`) and never read from the artifact. The verifier checks:
- **Subject:** the sha256 of `run-manifest.json` is recomputed from disk and must match `run-manifest.sha256`. The file is re-read after gh runs, and any change is refused.
- **Output structure:**
  - exactly one result, with allowlisted keys at every level;
  - the `mediaType`;
  - in-toto Statement v1 and the `predicateType`;
  - exactly one subject named `run-manifest.json`, carrying only a sha256 equal to the recomputed digest.
- **Certificate:** every sigstore-go summary field must equal the value derived from policy:
  - SAN, `buildSignerURI` and `buildConfigURI` equal the workflow at the ref;
  - the three digests equal the SHA;
  - repository URI, ref, numeric repository ID and owner ID;
  - `github-hosted`, the trigger, and the run invocation URI including the attempt.

  Missing, mistyped or unknown fields are refused. Deprecated GitHub fields, if present, must be consistent.
- **Timestamps:** 1–8 verified timestamps, all inside the owner window.
- **Predicate:** ignored. It never gains authority and never reaches the claims.

**Output.** The result is a frozen `tabwise-r2-workflow-origin/1` claim with `runtime_attested:false`, `physical_input_attested:false` and `actor_bound:false`. It also carries `trusted_root_sha256` and `policy_sha256` (from `r2ProvenancePolicyDigest`); the production caller must compare these with the committed owner policy. The certificate has no actor, so the S4 approval guard remains the actor check.

**Handles.**
- Only a real `node:child_process` spawn mints an authentic WeakMap handle.
- An injected `spawnImpl` marks the result `simulated`, and `readVerifiedHostedProvenance` refuses it.
- The verifier is not wired into the S3 class or the C-3 gate. Nothing assigns `genuine-unqualified` or `qualified`.

**Evidence** (all MEASURED, this session):
- RED: the test file failed to import because the module was missing.
- GREEN: `test/r2-evidence.test.mjs` passes 51/51.
- Review hardening: RED, because the import of `r2ProvenancePolicyDigest` was missing. GREEN: 53/53, of which 14 are O-10 tests.
- Mutation testing: 28/28 killed and source restored; P24–P28 cover the review hardening. The first pass killed 19/23. The four survivors exposed test gaps: a weak oversize regex, no attempt≠1 case, a vacuous environment-leak check, and a pattern typo in the mutation script. Those tests were strengthened before acceptance.
- **Disclosed fixture fix to a new test:** the first O10-11 cap (1024 B) was smaller than a valid result, so the cap refused it first. The cap was raised to 8192 and the oversize payload to 16384.

**Not tested by design:**
- The real spawn path. Running a process would violate the `offline` CI classification and D-85 ("Do not execute the actual GitHub CLI").
- gh's real JSON. The expected shape is CITED from cli.github.com and the sigstore-go `certificate.Summary` source, not MEASURED.

## Residual risks

- **R-1 (O-10).** gh's actual `--format json` field names, exit codes and environment needs (whether it requires auth or config offline) are unconfirmed until the first authentic run. Any mismatch fails closed.
- **R-2 (O-10).** The trusted root has no expiry and offline verification cannot detect revocation (CITED, GitHub docs).
- **R-3 (O-10).** There is a small TOCTOU window between hashing the gh binary and spawning it. The owner controls the machine.
- **R-4 (O-10).** `JSON.parse` keeps the last value of a duplicate key. gh is the trusted producer.
- **R-5 (O-10).** `certificateIssuer` and repository visibility are required or allowed but not pinned.
- **R-6 (O-12).** Other script digits (for example Arabic-Indic), cross-script homoglyphs and phonetic letter names ("eff") are not folded. NVDA reads the ASCII nonce from our own fixture title, so this is INFERENCE: low likelihood.
- **R-7 (O-12, MEASURED by the review subagent).** Non-hex letters break runs, so these pass unchanged:
  - chunks interleaved with words (`de go ad go be go ef`);
  - NATO-style spelling (`d Delta e Echo …`).

  NVDA does not do this with our ASCII fixture title (INFERENCE). Refusing isolated hex chunks between letters would raise false refusals.
- **R-8 (O-12, MEASURED by the review subagent).** Number-heavy UI speech (dates, prices, phone and card numbers) was refused 0.635% of the time over 20,000 random nonces, every time because a 4-character run remained. This fails closed, so the cost is availability. The in-test ≤0.1% bound used a lighter ordinary set (measured at 0.0173%).
- **R-9 (O-10).** In-process checks cannot stop either of these:
  - in-process code that rebinds modules before this one loads;
  - an owner policy that pins a non-gh binary.

  The policy must come from a committed owner file.

## Acceptance commands (PLAN.md F-03 / O-12 + O-10)

- `node --test --test-timeout=20000 test/r2-payload-context.test.mjs`
- `node --test --test-timeout=20000 test/r2-evidence.test.mjs`
- `node --test --test-timeout=20000 test/r2*.test.mjs`
- `node scripts/offline-tests.mjs --profile ordinary --seed 1 --out cache/o10-ordinary`
- `node scripts/offline-tests.mjs --profile stress --seed 426136 --out cache/o10-stress`
- `node scripts/check-r1-baseline.mjs`
- `git diff --check`
