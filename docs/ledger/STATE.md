# STATE — D-73 consumed (FAILED pre-runtime); CRLF lockfile fix local, uncommitted; qualification BLOCK
Updated: 2026-10-29T13:13:06Z · Claude (Opus 5.5) · run_id tw-d73-crlf-20261029

- Canonical D:/Projects/Meta AI/app; feat/TW-01-contracts at 0d1eefc (D-73 activation). No commit/push/dispatch/variable/NVDA/API call by Claude.
- D-73 run 40849425253 (job 123364901929): admitted, variable revoked after 35 s, `--check-only` refused: `BLOCK: R1 baseline mismatch: package-lock.json`. No NVDA/browser/observer step, no artifact. Local evidence cache/d73/execution/20261029T092429Z: 25/25 hashes match, hashes.json sha256 0a5901d3…29ecd5, unchanged.
- Root cause MEASURED: package-lock.json blob 29eab6cf… identical at R1 0c93fa7 and 0d1eefc; LF blob sha256 2f4a4e9f… (= manifest); same blob with autocrlf=true checkout = 2306bb99… . `git -c core.autocrlf=true checkout 0d1eefc` reproduces the exact hosted message (exit 2); LF checkout passes all of `--check-only`. check-r1-baseline.mjs compared the lockfile raw while normalizing the other files.
- Escaped locally (MEASURED): dev worktree lockfile is LF (`git ls-files --eol`: i/lf w/lf) though core.autocrlf=true; tests copied those LF bytes. INFERENCE: npm rewrote it LF locally; windows-2025 Git has autocrlf=true.
- Fix: scripts/check-r1-baseline.mjs undoes only a uniform CRLF conversion of package-lock.json (lone CR/LF or mixed endings still mismatch); trusted hashes and manifest unchanged. New test/r1-baseline-eol.test.mjs (7 tests).
- scripts/tabwise/qualification-status.json reset to disabled/BLOCK with D-73 retirement reason. D-73 never reused. Full worker BLOCKED.
- Last verification: `npm test` 393/393 pass exit 0; check-r1-baseline exit 0; preflight exit 0; observer --check-only refuses disabled (exit 2).

## Handoff
Next: independent review of check-r1-baseline.mjs diff + new test; owner commits and publishes by exact SHA (runbook step 2). New attempt needs new D-number, recomputed reviewed_sha256 (check-r1-baseline.mjs is in reviewed scope; D67 digest a639387a… no longer matches), status-only activation commit, owner dispatch script. A local PASS is not hosted qualification.
