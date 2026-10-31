# STATE - R2 S7 A-1..A-3: --verify-run + hosted tabwise-r2 workflow (F-03/R2-L2, D-86)
Updated: 2026-10-31T06:09:00Z
Branch: feat/tabwise-r2-s7 (owner worktree app-r2-s7); base 8dac551 (O-12/O-10). Uncommitted; R2 disabled/BLOCK.
## Now
- A-3 DONE (offline): --verify-run = all gates, then verifyR2Run from r2RunDir; exit 0 only ok+digest+complete. Read-only.
- A-1 DONE: .github/workflows/tabwise-r2.yml (r2 windows no-OIDC -> attest ubuntu OIDC); not dispatched.
- A-2 DONE: attest 1e69f48a..., download-artifact 9000827c... pinned; PROVENANCE row.
- Measured step-body defects fixed: PS -ne $true accepted "true"/1; $ anchors took trailing newline; bundle digest path.
- S3 additive: verifyR2Run returns manifest_sha256 (exact verified bytes; null on refusal).
## Next / blocked
- Owner reviews and commits (proposed units below); Claude made no git writes, no gh, no dispatch, no status change.
- R-S7-1 DONE (owner "Yes, add it"): tabwise-r2.yml in R2_FILES; a workflow edit now invalidates reviewed_sha256.
- Pending: A-4 O-11, A-5 run plan, A-6 activation (new r2Digest), A-7 first authentic run + O-10 verify.
- Cloud Claude Windows cleanup untouched (insertion point after "R2 run" in job r2).
## Verification (Windows Node 24.22.1, 2026-10-31)
- r2-review 64/64; r2-evidence 57/57; R2 664/664 (S7-W4 RED first); source mutations 23/23 killed; workflow mutations 38/38 refused.
- Step-body harness 45/45 (1 symlink case not exercised: EPERM); frozen R1 ok:true; git diff --check exit 0.
- After npm ci --ignore-scripts (owner-approved): 3 env-failing files 28/28; ordinary 48/48 files 938/938.
- Stress seed 426136: 8 profiles x 48/48 files, 938/938 tests each, exit 0 (cache/s7-stress2)
- After R-S7-1: ordinary 48/48 files, 939/939 tests, exit 0 (cache/s7-ordinary3); stress 8 profiles x 48/48 files, 939/939 tests each, exit 0 (cache/s7-stress3).
- r2Digest 8dac551 3c884482...5fea -> now 979fcac6...1a69 (17 files incl. workflow).
## Handoff
Uncommitted: scripts/tabwise-r2.mjs, scripts/tabwise/r2-run.mjs, scripts/tabwise/r2-evidence.mjs, scripts/tabwise/r2-policy.mjs (M).
Uncommitted: .github/workflows/tabwise-r2.yml (new); test/r2-review.test.mjs, test/r2-evidence.test.mjs (M, S7 rows).
Uncommitted: docs/engineering/R2-S7-handoff.md (new); docs/CODEMAP.md; docs/ledger/{DECISIONS,PLAN,PROVENANCE,STATE,LOG}.
Not in repo: node_modules/ (ignored, from npm ci); cache/ logs (ignored); ../R2-S7/ design package.
Verified by: PLAN.md F-03 S7 acceptance commands; results above and in the handoff section 3.
Proposed commit 1: feat(F-03): R2 --verify-run read-only re-verification (S7 A-3)
Proposed commit 2: ci(F-03): tabwise-r2 hosted workflow with gated attestation and pins (S7 A-1, A-2)
Push: safe after owner review (no secrets; workflow is dispatch-only and refuses under BLOCK). Review needed from: user
Disclosure: prior session ran `gh pr view 13` once (AGENTS.md breach); not repeated.
