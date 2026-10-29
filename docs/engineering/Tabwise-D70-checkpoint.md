# D70 — consolidate completed reviews and advance persisted product views

Canonical repository D:/Projects/Meta AI/app, feat/TW-01-contracts. Existing meaningful local commits were preserved; none was rewritten or pushed. Claude D67 report was read from cache/d67/qualification-review/outbox/claude-d67-narrow-review.md; D68 from cache/d68/product-review/outbox/claude-d68-product-review.md. Both original packages/outboxes remain unchanged.

Scope reconciliation: D67 cleared the120-file narrow snapshot and34/34 offline tests as preparation only. Its15 qualification-content files still match the current code exactly; digest remains a639387a0a8ccd701b7765afcd420b27dfb71c81a2303450f88aef90cc717efb. Subsequent timing-test cleanup/setup allowance and the committed runbook were separately reviewed and committed in D69. D68 cleared its26-file overlay on988c933,42/42 offline tests and typecheck, but could not complete a production build in its junction environment. Its manifest digest, measured now, is bb346ff8ed3615ac998aab55378554c9cb0fda852bcc4ac30a7286fe27d6a798 (not an original external approval binding). Current later product increments received focused independent read-only reviews; D68's old PASS is not claimed as review of those new files.

| Finding | Disposition |
|---|---|
| D-2 | FIXED: evidence.journey_id must equal the stored run journey_id, in addition to all prior source/hash/run checks. Red-first mismatch regression passes. |
| D-4 | FIXED: initial run lookup error produces503 before missing-row/ownership handling; absent and foreign rows remain404. Red-first regression passes. |
| D-3 | FIXED: owned workspace sidebar links target owned journeys/runs/reports sections; owned detail pages use the owned shell. Global navigation explicitly labels the demo. Saved versions link to their immutable detail rather than an unrelated current local draft. |
| D-1 | EVALUATED, optimization deferred. Every request retains fresh full-bundle hash verification. Artifact bytes are capped at4,000,000 plus bounded manifest65,536 bytes; repeated screenshot downloads still repeat this work. Serving only the target would omit existing whole-bundle checks; cross-request caching needs explicit owner/identity/metadata/expiry invalidation and a bounded memory budget. A future client reuse of already-verified bytes is a candidate, but no cache or performance gain is claimed. This cost/egress limitation remains open. |

The D67 LOW corrections are already committed: os.tmpdir unique timing roots, t.after cleanup, exclusive separately named timing evidence (8dbb3d7); fixture-only total timeout allowance (150f713); mandatory immediate deletion of TABWISE_OBSERVER_APPROVED_REVISION after the first dispatch, including failure, in the committed observer runbook. No guarded100ms threshold changed.

| New local commit | Product scope |
|---|---|
| a997e66 | Journey identity binding and truthful initial run-query outage |
| e467c8b | Owned navigation and owner-only immutable saved-version API/UI |
| 5edf01f | Printable private diagnostic report, exact snapshot hash/run identity and five stored lanes |
| ff6c918 | Owner-only baseline/patch/rerun relationship presentation; verification remains pending/null |

Saved-version detail validates stored steps against the approved journey contract and displays the original stored submission hash honestly: the original name was not persisted, so a whole original submission hash is not reconstructed. A local draft is a separate editable version. Report presentation checks the downloaded source snapshot hash, retains incomplete evidence and prints original provenance. Verification presentation reads real stored relationships but never releases a stored FIXED claim while the qualified verification workflow is unreleased. The final independent review caught a stale-state transition to /verifications/pending; clearing state before that early return was inspected and cleared before commit.

MEASURED tw-d70-20261029: root357/357, web55/55, contracts21/21, canonical production build/TypeScript, preflight and full frozen-R1 integrity PASS. Local13-route axe0, existing palette/local-save and mobile checks PASS. New headless intercepted-data checks cover immutable version keyboard navigation, owned sidebar destinations, private report hash/render/keyboard print/mobile and stored/pending verification presentation; four additional axe scans have zero violations. These are offline/synthetic UI checks, not actual authenticated Supabase sessions or NVDA/Spark integration. Logs are in ignored cache/d70; no fixture entered public build data.

| Evaluation | Current official record / limit |
|---|---|
| R1 | Scored ledger retains historical D53/A15-only PASS for r1-20261028T153344Z, based on owner summary/public workflow record; Claude did not inspect summary.json. FEATURES remains false/null. This tracking discrepancy is unresolved; current Fernway worker remains BLOCKED. |
| R2 | Contracts/adapters/offline tests implemented; real blind NVDA/same-Spark evaluation NOT RUN/BLOCK. |
| R3 | Patch/review/verdict helpers and offline tests implemented; actual withheld rescue/wrong-patch rerun NOT RUN/BLOCK. |
| R7 | Architecture/product/qualification code reviews completed; independent acceptance of actual R0–R3 outcomes NOT RUN. |

Authorization packet is refreshed after the final documentation commit under cache/d70/execution-authorization. It identifies the exact final local preparation SHA, unchanged digest, review references, workflow/configuration, one dispatch/revocation, acceptance criteria, limits and evidence. Current status remains disabled/BLOCK and all references null; activation/publication would create a new exact execution SHA requiring separate owner authorization and binding. No publication, activation, dispatch, NVDA, credentials, Meta/Baseten calls, deployment or spending occurred.

Remaining genuine end-to-end dependencies: configured owner authentication/provider and server credentials (not accessed here); independently qualified full worker and explicit execution authorization; genuine observed Fernway evidence; separately authorized real Muse Spark diagnosis; human patch decision; actual authorized rerun and released deterministic verification; immutable public verified before/after report publication. D1 egress optimization remains deferred. No new broad architecture review was requested.
