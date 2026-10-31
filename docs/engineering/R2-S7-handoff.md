# R2 S7 handoff — `--verify-run` and the hosted `tabwise-r2` workflow (A-1..A-3, D-86)

Branch `feat/tabwise-r2-s7` (owner-created worktree `app-r2-s7`), base `8dac551` (O-12/O-10). Uncommitted; Claude made no git writes. **R2 stays disabled/BLOCK.** No hosted dispatch, no gh, no NVDA, no browser, no model call, no install. Cost: $0.

## 1. Scope (owner authorization, D-86)
| Approval | Delivered |
|---|---|
| A-1 workflow | `.github/workflows/tabwise-r2.yml` (new), two jobs `r2` (windows-2025, `contents: read`, no OIDC) and `attest` (ubuntu-24.04, `id-token`/`attestations`/`artifact-metadata: write`) |
| A-2 pins | `actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6` (v4.2.2), `actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333` (v8.0.2); PROVENANCE.md row |
| A-3 entry | `--verify-run --plan <p>`: all `checkR2Entry` gates, then `verifyR2Run` from `r2RunDir` only. No loader, session, child, seal, write, NVDA, browser, input, model or repair |

Not done (not authorized): status change, dispatch, real attestation or `gh attestation verify`, O-11 (A-4), plan file (A-5), activation (A-6), first authentic run (A-7). Windows process cleanup (Cloud Claude) untouched; insertion point stays after `R2 run` in job `r2`.

## 2. Changes
| File | Change |
|---|---|
| `scripts/tabwise/r2-run.mjs` | `parseR2Args` accepts `--verify-run`; new `VERIFY_SCHEMA`, `r2RunInputs(gate)` (moved from `runAll`), `r2VerifyRun(gate, runDir)`, `r2VerifyOutcome(v)` |
| `scripts/tabwise-r2.mjs` | `verifyRun(gate)` prints one `tabwise-r2-verify/1` line, returns its code; dispatched before `page`; `runAll` uses `r2RunInputs` (same values) |
| `scripts/tabwise/r2-evidence.mjs` (S3, **additive contract change**) | `verifyR2Run` also returns `manifest_sha256`: sha256 of the exact `run-manifest.json` bytes it verified, `null` whenever it refused. No other S3 behaviour changed |
| `.github/workflows/tabwise-r2.yml` | New (from `../R2-S7/tabwise-r2.yml.proposed`) with the hardening in §4 |
| `test/r2-review.test.mjs` | S7-A1, S7-G1, S7-E1, S7-S1, S7-W1..W4 (static policy W1–W14 + named mutations; W4: workflow bound by `r2Digest`) |
| `scripts/tabwise/r2-policy.mjs` | `R2_FILES` gains `R2_WORKFLOW` (`.github/workflows/tabwise-r2.yml`), owner decision R-S7-1 |
| `test/r2-evidence.test.mjs` | S7-V1..V4 (synthetic sealed runs only) |

`--verify-run` exit 0 requires: `verifyR2Run.ok === true`, a 64-hex digest, a manifest with ≥1 page, no `stopped_after`, every page `exit_code === 0` with a sealed page digest. Summary keys: `schema, ok, complete, run_class, errors (≤64 × ≤512), run_manifest_sha256, genuine_evidence:false`. A refused verification reports `run_class:'incomplete'` and no digest.

## 3. Verification
MEASURED 2026-10-31 (Windows, Node 24.22.1, worktree `app-r2-s7`; logs under `cache/`, git-ignored):
| Check | Result |
|---|---|
| RED (`cache/s7-red-*.txt`) | 10 new rows failed before implementation (S7-A1, G1, E1, S1, W1, W2; V1–V4); S7-W3 passed (pins an existing constant) |
| `node --test --test-timeout=20000 test/r2-review.test.mjs` | 63/63 |
| `node --test --test-timeout=20000 test/r2-evidence.test.mjs` | 57/57 |
| `node --test --test-timeout=20000 test/r2*.test.mjs` | 663/663 (base 652 + 11 S7 rows); after R-S7-1: 664/664 (+ S7-W4; RED first: `cache/s7-w4-red.txt`) |
| Source mutations (`<scratchpad>/s7-mutate.cjs`, `cache/s7-mutations.txt`) | 23/23 killed; sources restored, sha256 re-checked OK |
| Workflow mutations (S7-W2, in suite) | 38/38 refused; unmutated workflow 0 errors (S7-W1) |
| Step-body harness (`cache/s7-steps-harness.txt`) | 45/45 as expected after the §4 fixes; 1 not exercised (symlink, EPERM) |
| `node scripts/check-r1-baseline.mjs` | `ok:true`, errors `[]` |
| `git diff --check` | exit 0 |
| Ordinary preflight seed 1 (`cache/s7-ordinary`) | 48 files, 45 PASS; 938 tests, 933 pass, 5 fail |
| Stress seed 426136 (`cache/s7-stress`), 8 profiles | each 48 files, 45 PASS; 933/938 |
| BLOCK bypass (S7-G1, S7-E1) | real entry `--verify-run` under shipped status: `R2 refused: BLOCK`, exit 2, empty stdout, no runtime import |

**Re-run after `npm ci --ignore-scripts` in the worktree (owner instruction "install and run those specifically to confirm", 2026-10-31T05:42:04Z; lockfile unchanged, 58 packages, guidepup 0.36.4, 0 vulnerabilities):** the three files 28/28 (`cache/s7-three.txt`); ordinary seed 1 48/48 files, 938/938 tests, exit 0 (`cache/s7-ordinary2`); stress: 8 profiles x 48/48 files, 938/938 tests each, exit 0 (cache/s7-stress2).

**First run, before the install — the 5 failures were environmental (MEASURED):** the owner-created worktree has no `node_modules/`, so `vendor.test.mjs` (T11, T16 ×2), `tabwise-qualification-loader.test.mjs` and `tabwise-review-integrity.test.mjs` fail with `ENOENT … node_modules\@guidepup\guidepup\package.json` / `Cannot find module … @guidepup\guidepup\lib\windows\Key.js`. None of those files or their code paths is in this diff. A full green preflight here needs `npm ci --ignore-scripts` in the worktree (owner approval; same lockfile, no new dependency) or a run in a checkout with `node_modules`.

**Reviewed-source digest (`r2Digest`):** base `8dac551` = `3c8844828a90e7fc75fb1893cd7345acbe9dcd2c86c97982abf4d25877e35fea`; A-1..A-3 with base scope = `86608d89cb7154d0ca33465c6a59bc7573f59bc70a570b2fcedb49755aca91ad`; final (17 files, workflow added, R-S7-1) = `979fcac68f8d00c987adaa835adeeed23fdcf299591d7a02af56a9d7a0dc1a69`.

**After R-S7-1 (2026-10-31T06:09:00Z):** ordinary 48/48 files, 939/939 tests, exit 0 (cache/s7-ordinary3); stress 8 profiles x 48/48 files, 939/939 tests each, exit 0 (cache/s7-stress3); frozen R1 `ok:true`; `git diff --check` exit 0. Any future status must name the digest of the committed revision it approves; recompute after commit.

## 4. Defects found by measuring the workflow's own step bodies (fixed before handoff)
The harness (`<scratchpad>/s7-steps-harness.mjs`, output `cache/s7-steps-harness.txt`) extracts the `run:` bodies from the committed workflow and runs them: bash steps under Git Bash, `pwsh` steps under Windows PowerShell 5.1 with GitHub's `$ErrorActionPreference='stop'` wrapper and `node` replaced by a function printing a fixed summary. MEASURED on the reviewed proposal:
1. `$v.ok -ne $true` **accepted** `"ok":"true"` (and `1`): PowerShell converts the right operand. Now `-isnot [bool] -or -not`, also for `complete`; `schema` and the digest must be `[string]` (an array would otherwise filter through `-cne`/`-cnotmatch`).
2. `-cnotmatch '^…$'` **accepted** a trailing newline (`.NET $`). All five shape checks now end with `\z`.
3. `bundle.sha256` held an absolute runner path and the platform's `sha256sum` mode marker. Now exactly `<hex>  run-manifest.sigstore.jsonl`, the same layout as `run-manifest.sha256`.
Static rows W10/W12/W14 and mutations pin each fix.

## 5. Residual risks / owner follow-ups
- **R-S7-1 (CLOSED, owner "Yes, add it"):** `tabwise-r2.yml` is now in `R2_FILES`, so `reviewed_sha256` binds the workflow text (CRLF-normalized like every R2 file). A workflow edit after review makes `checkR2Entry` refuse with `R2 content changed after approval`. S7-W4 pins this.
- **R-S7-2:** pwsh 7 is not installed locally; `pwsh` steps were measured under 5.1. Differences that matter here (UTF-8 vs UTF-16 for `>>`; comparison semantics are the same) are INFERENCE until the first hosted run. Installing would be `winget install --id Microsoft.PowerShell --exact --version 7.4.x` (adds a system tool; not requested).
- **R-S7-3:** the symlinked-subject case was not exercised (Windows file symlinks need privilege, EPERM). On ubuntu-24.04 `test ! -L` is standard; INFERENCE.
- **R-S7-4:** the entry's print-and-return in `verifyRun` is pinned statically (S7-S1); no offline test can run the entry past BLOCK.
- **R-S7-5 (carried, INFERENCE):** subject name, bundle format and upload-v7/download-v8 interoperability are confirmed only by the first authentic run; each fails closed.

## 6. Remaining approvals
A-4 O-11 (`../R2-S7/O11-arm-input-custody-plan.md`), A-5 committed run plan + `plan_sha256`, A-6 status activation after independent review (needs the new `r2Digest`, §3), A-7 one dispatch + one offline `gh attestation verify` through `src/r2/provenance.mjs`.
