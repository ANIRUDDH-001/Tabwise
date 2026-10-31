# STATE - O-12 nonce-redact/2 + O-10 offline provenance verifier (F-03/R2-L2, D-85)
Updated: 2026-10-31T04:29:11Z
Branch: feat/tabwise-r2-o12-o10; base HEAD 3388107 (PR13 merge). Work uncommitted; R2 disabled/BLOCK.
## Now
- O-12 READY (offline): nonce-redact/2, builder/arm-input /2, v1 refused; review leak (bold/squared capitals) fixed.
- O-10 OFFLINE READY: src/r2/provenance.mjs runs owner-pinned gh (argv, no shell) + owner policy; fake spawn only.
- Review hardening: trusted root pinned by sha256, child cwd pinned, spawn captured at load, policy digest in claims.
- O-10 authentic signed-artifact verification PENDING; S7 workflow PENDING OWNER APPROVAL; live R2 BLOCKED.
## Next / blocked
- Owner reviews diff and commits; Claude made no git writes, no gh, no workflow/CI/status edits.
- Owner: remove stray untracked app/fx-wPC4q4/ (review subagent scratch; its own delete was blocked).
- Owner: approve S7 (../R2-S7-attest-workflow-proposal.md), pin actions/attest SHA, authorize 1 authentic gh run.
- Residual risks R-1..R-9 in docs/engineering/R2-O12-O10-handoff.md (gh JSON shape unconfirmed; R-8 0.635% numeric FP).
## Verification (Windows Node 24.22.1, 2026-10-31)
- payload-context 132/132; r2-evidence 53/53; mutations O-12 15/15, O-10 28/28 killed (source restored).
- Full R2 652/652; ordinary 48/48 files, 927/927 tests; frozen R1 ok:true errors:[]; git diff --check exit 0.
- Stress seed 426136 final (cache/o10-stress2.txt): 8 profiles x 48/48 files PASS, 0 FAIL, exit 0.
## Handoff
Uncommitted: src/r2/speech-payload.mjs (M) - nonce-redact/2, /2 schemas, historical-version refusal.
Uncommitted: src/r2/provenance.mjs (new) - O-10 offline hybrid verifier.
Uncommitted: test/r2-payload-context.test.mjs (M) - O12-* rows + disclosed v1->v2 contract changes.
Uncommitted: test/r2-evidence.test.mjs (M) - O10-1..O10-14 (in-memory spawn fake; no process run).
Uncommitted: docs/engineering/R2-O12-O10-handoff.md (new); docs/CODEMAP.md (M).
Uncommitted: docs/ledger/{DECISIONS,PLAN,STATE,LOG}.md/.jsonl (M) - D-85, plan section, checkpoint.
Outside repo: ../R2-S7-attest-workflow-proposal.md, ../R2-O12-O10-implementation-plan.md (option C superseded by D-85).
Verified by: commands in PLAN.md F-03 O-12+O-10 section; results above.
Proposed commit 1: fix(F-03): nonce-redact/2 for chunked and compatibility-form nonce speech (O-12)
Proposed commit 2: feat(F-03): offline hosted-provenance verifier over gh attestation verify (O-10)
Push: safe after owner review (no secrets, no workflow/CI/status change). Review needed from: user
Disclosure: prior session ran `gh pr view 13` once (AGENTS.md breach); not repeated.
