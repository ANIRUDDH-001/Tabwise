# R2 offline preparation — r2-prep-20261028-v2

**BLOCK Claude's foundation as submitted for evaluation.** The offline fixture basis is usable after the corrections below. R2 itself remains NOT RUN; no official score, observed R2 NVDA speech, inference or independent ground truth exists.

MEASURED / MACHINE-L3: `npm test` passed 251/251; the original worktree passed 230/230 before edits. New regression tests first reproduced six foundation defects. A separate private browser suite passed 2/2. `node scripts/preflight.mjs` passed all checks. Outputs are in the private preparation directory; these results are independent of model reasoning only within their deterministic scope.

Concrete review findings and corrections:

| Finding | Disposition |
|---|---|
| `judgeR2` could PASS with no healthy controls | Require healthy and broken controls; reject duplicate page IDs |
| Healthy abstention could accompany PASS | Insufficient healthy evidence now blocks PASS |
| Missing/malformed/abstaining visual result could set `causal_claim: true` | Only an actual incorrect localization can support that flag; the flag remains a smoke-test indicator, not causal proof |
| Two missing model/version/mode descriptors compared equal | Explicit identities now required |
| Label author could be their own second reviewer | Distinct second reviewer required |
| Acknowledgement could name the wrong declared key | Declared press is now compared with the acknowledged key |
| Supplied speech strings and step/DOM IDs alone could masquerade as grounded localization | New preparation helpers require raw-source correspondence, completed capture or explicit bounded silence, action/target localization and cited observations; legacy `judgeR2` is **not** an official evidence/provenance gate |
| Regex payload checks allowed ground truth under unrecognized field names | New payload builders project only opaque ID and arm observations; manifests, page events, expected outcomes and axe data are excluded |

MEASURED: all original development pairs have exact one-snippet substitutions. Their app events record active focus, so focus falling to body is visible despite missing `focusin`. Source semantics and browser behavior support the intended manipulations. Expected AT speech remains INFERENCE. The baseline captures before/after snapshots, not all transient intermediate axe states; zero violations does not establish real speech behavior, conformance or universal axe blindness.

Exact repository files changed by this session:

- Modified: `src/r2/contract.mjs`; `docs/CODEMAP.md`; `docs/ledger/DECISIONS.md`, `LOG.jsonl`, `PLAN.md`, `PROVENANCE.md`, `STATE.md`.
- Added: `src/r2/preparation.mjs`; `test/r2-review.test.mjs`, `test/r2-preparation.test.mjs`, `test/r2-preparation-hardening.test.mjs`, `test/r2-payload-context.test.mjs`; this handoff.
- Existing development pages, manifest, labels, baseline script, `test/r2.test.mjs`, and the inherited `RUNS.md` change were preserved. All 19 initially dirty/untracked files were backed up byte-for-byte before editing. R1 code, evidence, workflow, locks, thresholds, dependency files and FEATURES were not changed.
- Branch: `feat/R2-withheld-preparation`; HEAD unchanged at `0c93fa73e0c111a2df65302adfe0006d63f50a39`. Nothing staged, committed or pushed.

Private package (outside both the app worktree and its parent's Git tree):

`C:/Users/ANIRUDDH/.codex/private/tabwise-r2/prep-20261028/`

```text
package/
  runner/manifest.json          opaque IDs and identical paired key journeys only
  runner/pages/f-*.html         six fresh pages; no condition names in paths
  custody/labels.json           PROVISIONAL labels, pair mapping, affected actions,
                               expected behavior, defect snippets and source locations
  custody/provenance.json       self-authorship and fresh-source declarations
  sources/build-private.mjs     reproducible private fixture authoring source
  README.txt
  seal.json                    raw-byte SHA-256 inventory of all 11 package files
seal.sha256                    external trust anchor
runner-export/                 runner/ contents only; no custody/source files
private-fixtures.test.mjs       browser journey, manipulation and axe checks
private-modal.test.mjs          background-inertness and reverse-tab checks
private-baseline.json           page events/state and axe results; never model input
before/, before.json            initial worktree preservation
verify-private.mjs              repeatable integrity/preservation check
```

SHA-256 trust anchor (`seal.json`): `682dd9c80b85a0eba487dbf6eb1d571a88bb756a2d8b83d678f1c333151a40f9`.
Labels: `2c6e0df20b33a4a08e0d187ad6404b035fae42a7213ac1e943fef425479170d6`.
Runner manifest: `07f7a1a78c02b434ca636547f9af8a4a884d0b222f1d70c64003e4b8fad9c7e9`.
Every fixture's individual hash is in the private `package/seal.json`. `reproduction-v2/` reproduces the same seal byte-for-byte. V1 was superseded before evaluation to make modal background inert; its seal and files are preserved privately, with different fixture IDs. Do not use V1 or the earlier unsealed parent-directory attempt. Repeat integrity checks with `node "C:/Users/ANIRUDDH/.codex/private/tabwise-r2/prep-20261028/verify-private.mjs"`. Rebuild into a new external destination with `node "C:/Users/ANIRUDDH/.codex/private/tabwise-r2/prep-20261028/package/sources/build-private.mjs" "<new external directory>"` and compare its `.sha256` file with the pinned anchor; never overwrite an existing revision.

MEASURED: axe-core 4.14.0 reported zero violations initially and finally on each of the six development and six provisional pages. Private assertions checked the declared application changes, every page key acknowledgement, focus targets, ordered page events, and one-substitution paired sources. Browser evidence uses headless Chromium and Playwright CDP input, with no desktop keyboard automation or NVDA. These are narrow MACHINE/L3 checks, not independent labels or AT outcomes.

Package safeguards: a pinned external seal detects edits, additions and path/symlink escapes; sealing refuses Git ancestors; runner manifests use a field allowlist. Model payloads can carry the same allowlisted key actions in both arms and stable observation references, without expected outcomes. Freezing requires one prediction per opaque fixture and arm, rejects duplicates/incomplete cohorts, writes exclusively, and binds both prediction bytes and package seal. `openScoring` checks that freeze before opening labels. No actual predictions were made or frozen; unit-test predictions are synthetic and live only in disposable test directories. `openScoring` deliberately always returns INSUFFICIENT_EVIDENCE in this preparation, including if someone merely changes independence flags.

Limitations: hashes establish integrity, not authorship or independence. The author account can read everything; separate-account/job isolation is required for actual evaluation. A runner receiving HTML can inspect its implementation, so the runner must be deterministic and must never supply source/DOM to either model. Freshness declarations and comment/whitespace fingerprints block known simple development derivatives, not arbitrary disguised copies. A separate blinded review must establish ground truth and provenance before a newly sealed revision can be eligible. No reviewer has been assigned. Author-written accepted target aliases are also provisional. The deterministic localization helper checks references and exact action/target matches, not whether arbitrary mechanism prose is true; that requires the blinded rubric/review.

Minimal hosted R2 integration design (INFERENCE / proposed, not implemented):

1. Add an R2-specific capture adapter and entry point, initially tested with fake transport. Reuse the frozen send gate, foreground probe, lifecycle, vendor-integrity and evidence-writer primitives through their existing interfaces; do not invoke or alter `runR1`, its acceptance rules or locks. `workflowGuardErrors` already accepts an explicit approved identity, so an independently approved R2 workflow need not change R1's default identity.
2. A future manual GitHub-hosted Windows job must retain main/SHA identity, read-only checkout/token, owned fresh NVDA process, nonce/foreground checks before every physical send, strict page acknowledgements, interference stops, bounded teardown, no automatic retry, and retained failure evidence. Start with the A15 profile and settings readback; do not generalize it to default browse mode. A separate R2 workflow needs an explicit exception to the current policy allowing real NVDA only in `r1.yml`; no workflow/policy edit or execution is authorized here.
3. Deliver only the sealed runner export through an explicitly approved private channel. The public checkout and runner/model accounts must not receive custody/source-authoring files. The delivery/access method is unresolved; do not assume public GitHub artifacts preserve withholding. Bind the runner inventory to a pre-recorded hash.
4. Run the exact same key sequence on each member of a pair, fresh state per page, opaque randomized scheduling. Capture a page-local monotonic sequence of keydown, focusin/focusout, relevant mutations and app state; take active-element/state snapshots around every action, including focus falling to body. Keep these observations in a custodian sidecar, not model inputs.
5. Keep raw NVDA phrase-log cursors before/after each guarded action, retain every utterance rather than just `lastSpokenPhrase()`, and journal action send/ack and observation-window boundaries. The frozen client's capture loop already supports a quiet period, but hosted feasibility must establish complete live-region capture, connection liveness and delayed-message handling. Preserve an uncertain event as ambiguous/INSUFFICIENT EVIDENCE; never turn an empty/failed transport into claimed silence. Do not fabricate speech from expectations or borrow a stale phrase.
6. Join page events to action acknowledgements by page sequence and speech by Node-side action/capture cursors. Keep both clock domains explicit; do not subtract browser times from Node times or force asynchronous app events into an unrelated subsequent action. No new causal clock/receipt observer or vendor change is proposed.
7. Capture screenshots after the same actions for visual-only input; speech-only receives raw observed speech for those actions. Use the same pinned Spark model/version/mode, task instruction, response schema and resource limits; no transcript in visual input, no DOM/screenshots/focus/app/axe/labels in speech input, and no pairing, condition or defect hints in either. Freeze prompt/model/input hashes and every prediction before labels are opened. No inference adapter is implemented or authorized.
8. A localization candidate must identify the triggering action, a user-facing control/region target, a relevant observed event or bounded silence window, and a barrier mechanism. A bare 'broken' verdict is not localization. Private label mappings resolve the functional target to a source location after freezing; neither arm needs a hidden DOM ID. Correct mechanism adjudication remains separate from string matching. Compare with preserved axe snapshots and affected-node targets, including related ancestor/descendant targets, without disclosing axe output to the model. Missing/incomplete axe analysis is INSUFFICIENT EVIDENCE.
9. Score only after ground-truth independence, cohort completeness, capture integrity, causal-localization rubric and same-model controls have passed separate review. Apply the frozen R2 threshold (at least one non-axe barrier localized, zero healthy false claims, original caps). Treat the visual contrast as limited evidence, not standalone causal proof; record abstentions/failures. Repair-and-retest belongs to R3 and is not claimed here.

CITED: [W3C status-message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) motivates the announcement manipulations; [APG dialog guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) motivates focus return and modal background inertness. Neither establishes observed NVDA behavior. Current Playwright routing/wait APIs were checked through Context7 `/microsoft/playwright`; no package was installed.

Authorization still needed only for the next gated actions: CI/workflow-policy edits and an exact hosted execution; confidential third-party delivery of the runner export; any inference budget; publication/disclosure; and commits/pushes under the existing ownership rules. Independence review must be completed without this author acting as the independent labeler. No person has been assigned work.

**Precise next engineering step:** implement fake-transport tests for an R2 capture adapter that records complete phrase-log deltas, explicit silence windows and action-correlated page snapshots, then run them offline. Obtain separate review of the new verifier/output code before using it to qualify any experiment. Do not dispatch a hosted job until the policy and confidential-delivery decisions are approved.
