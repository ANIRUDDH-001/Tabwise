# STATE — CI-H1 offline preflight repair complete locally; R2 BLOCKED
Updated: 2026-10-29T17:31:30Z · Codex · fix/tabwise-ci-preflight-hang · HEAD bb8008b0857f2148c5c808e951fac2a64fc2647b

- Now: demonstrated listener leak fixed in two browser tests; explicit partial selection and bounded per-file/profile runner wired into preflight.
- MEASURED CI-H1-20261029: ordinary plus all8 stress profiles each478/478 across47 files; all205 R2 tests PASS. Nine browser/process files excluded with reasons.
- Last verification: node scripts/offline-tests.mjs --profile stress --seed 172785 --out cache/ci-h1 → exit0; baseline/preflight/frozen/digests/diff-check PASS.
- Protected R1/vendor/locks/qualification status unchanged; no real browser, NVDA, physical input, install, API spend, dispatch or publication.
- Next: independent diff review; owner commit/publication and offline-preflight on reviewed revision. Full npm test/browser coverage requires separate authorization.
- Blocked: original hosted trigger unconfirmed; excluded coverage and cross-tool review outstanding; R2 qualification remains BLOCKED.
- Report: docs/engineering/CI-H1-preflight-hang.md. Raw evidence: cache/ci-h1/. Stop after CI-H1; no M2D.

## Handoff
Uncommitted: .github/workflows/preflight.yml (modified)
Uncommitted: ci/offline-tests.json (new)
Uncommitted: docs/CODEMAP.md (modified)
Uncommitted: docs/engineering/CI-H1-preflight-hang.md (new)
Uncommitted: docs/ledger/DECISIONS.md (modified)
Uncommitted: docs/ledger/LOG.jsonl (modified)
Uncommitted: docs/ledger/PLAN.md (modified)
Uncommitted: docs/ledger/PROVENANCE.md (modified)
Uncommitted: docs/ledger/STATE.md (modified)
Uncommitted: scripts/offline-tests.mjs (new)
Uncommitted: test/ci-browser-cleanup.test.mjs (new)
Uncommitted: test/ci-offline-selection.test.mjs (new)
Uncommitted: test/fernway.test.mjs (modified)
Uncommitted: test/helpers/reject-browser.mjs (new)
Uncommitted: test/tabwise-network-browser.test.mjs (modified)
Verified by: ordinary + stress offline runner → all nine profiles PASS; frozen/preflight/qualification integrity PASS.
Proposed commit: fix(ci): bound classified offline preflight (F-03/CI-H1)
  Body: close rejected browser setup; classify partial suite; enforce watchdog; cite ordinary/stress verification commands.
Review needed from: independent other tool / user; no commit or push performed.
