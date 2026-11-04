# Tabwise product completion — engineering progress review

**Status: INCOMPLETE. No R2, R3 or R7 acceptance checkpoint is claimed. Do not merge or activate production from this package.**

Latest application source: `b3fe53ccf20c0761c2ec47dadfc55eec3b05dfee`; runtime source: `19d17a5098809406d5ff07041c6b44487718956c`, on `feat/tabwise-r2-r7-product-completion`. See the continuations below. The initial candidate `e3d99addc066da88624728923de49a040784aa61` remains preserved in `candidate.json`. The owner confirmed: “No authority exists yet; prepare the review package”. This package supplies no signature, reviewer identity, private evaluation labels or qualification authority.

## Source and evidence

- MEASURED: `docs/evidence/product-completion-20261104/candidate.json` records the source digests, observed test counts, historical native archive hashes and pending acceptance criteria.
- MEASURED: `source-manifest.json` freezes the existing literal-import source closure, explicit policy/lock/vendor roots and each normalized file hash. It is a review inventory, not execution authorization.
- MEASURED: R2 source digest `fddc0e40603d54b67d61e916f95aa806398a203f04c6ec9d090829bd96960187`.
- MEASURED: qualification source digest `1a2991eb6c4bc42ffef5fbc1060d89dd8dc136c456211eddcf8dacf459ddd672`.
- MEASURED: `evidence-index.json` hashes the original verification outputs, including failed/intermediate results. Successful local controls never replace the missing native product evidence.

## Integrated behavior and scope

The clean product continuation `f0cc39a` was reconciled with native runtime branch `0ca170f` in `640b6d5`. Both native and repair integrity scopes and assertions were retained. Current main ea8bd7c was merged into the development branch in e3d99ad with an identical tested source tree; three registration-workflow conflicts retain the existing gated native-branch source. Main itself was not changed. Review those workflow differences before any future main merge. The merged native session retains the product recorder's v2 identity data and the native loader/startup/foreground/speech corrections. Its exact session pin was refreshed; it has **not** been exercised in a new hosted native run.

The Preview execution restrictions from `342518f` were carried into the integration line. Additional guards refuse native ingestion, native dispatch and cancellation in Preview. Save/read/preparation remains available. No production execution flags were enabled.

Native polling now checks persisted owner/request association and the exact GitHub workflow/revision/actor/attempt before mutation. It reports queued/running/failed/cancelled/deadline outcomes. A successful workflow stops at pending evidence; only the existing trusted ingestion path can establish completed evidence. Unknown dispatch outcomes never trigger title-based discovery or a second POST. A cancellation failure at deadline is retained as `deadline_exceeded_cancel_pending`; it does not establish physical quiescence.

The owned request API derives available actions from server policy and persisted state. The UI exposes run and evidence-retrieval controls when eligible and keeps refused evidence unverified. Disabled qualification is still visibly unavailable; no client flag grants a capability.

The local project budget broker now reserves request slots alongside monetary reservations, counts uncertain requests, retains slots after settlement, rejects a raised/replaced campaign and recovers counts from the append-only costs ledger if SQLite is lost. The campaign limit is twenty. This does not claim a distributed hosted request counter or verified remaining promotional credit. No live model request was made.

The hosted source inventory previously omitted native runtime files. It now covers the full enforced R2 scope, and route patterns include nested native and patch routes. Nine actual built route traces were checked. CITED: the tracing change follows the [Next.js output tracing documentation](https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/05-config/01-next-config-js/output.mdx), retrieved through Context7.

## Verification actually performed

| Verification | MEASURED result | Original output |
|---|---|---|
| `npm test` | 1,252 pass; zero failures; three DB opt-ins skipped | `root-final.tap` |
| `npm --prefix web test` | 321 pass; zero failures; three DB opt-ins skipped | `web-final.tap` |
| Contracts | 21 pass | `contracts.tap` |
| Selected native/owner diagnostic suites | 139 pass; no NVDA launched | `diagnostics.tap` |
| Headless request/repair UI and recorder/oracle controls | 17 pass; synthetic controls | both browser TAP files |
| Fresh local PostgreSQL schema | twelve existing migrations; eight SQL suites pass | `postgres.log`, `postgres-result.json` |
| Native persistence/custody/recovery and repair concurrency | all six skipped DB checks executed separately and pass | `postgres.log` |
| Production build and TypeScript | pass | `build.log`; build includes TypeScript |
| Full reviewed scope in nine built API route packages | pass | `route-traces.log` |
| Actual built HTTP Preview/Production boundary controls | pass, including Preview cancellation refusal | `preview-http.log` |
| Frozen R1, runtime pins, preflight and diff checks | pass | `frozen-r1.json`, `preflight.json`; candidate pins rechecked |
| Hosted schema, read-only MCP | twelve expected migrations present; 27/27 public tables RLS-enabled | `candidate.json`; no production migration repeated |

Initial failures are preserved: merged-session pin drift, a parallel browser timeout, the new test's missing offline classification, missing packaged native sources, missing request limits/progress controls, and the Preview cancellation gap. The browser test also exposed misleading ingestion-error wording, which was corrected. No failing assertion or threshold was weakened. No new dependency was installed.

## Hosted preflight and publication

[Draft PR #26](https://github.com/ANIRUDDH-001/Tabwise/pull/26) is the ongoing engineering review, not final acceptance. Vercel built the controlled Preview at `7fba797f95ba236d080b0a098079d25559e5fb10` successfully (`dpl_EVjv4W5zfvFYveJgWYv7jxhyPYLQ`, target Preview). Live protected-page inspection was refused by the connector at the protection-bypass read boundary (403); actual hosted OAuth and page acceptance remain unverified. No protection setting or production alias was changed.

[Hosted preflight 41817348279](https://github.com/ANIRUDDH-001/Tabwise/actions/runs/41817348279) failed its ordinary gate in `r2-runtime.test.mjs`. Original artifact `13314838685` was uploaded successfully. The remaining stress work was cancelled after the first failure to inspect the evidence; repeat profiles had exposed the same test failure. Both the final source-lock check and artifact upload passed. Do not report this run as passing.

MEASURED reproduction: the ordinary selection passes 71/71 locally; making the integration checkout read-only reproduces the same `EPERM` on the disposable copy of `r2-nvda-lifecycle.mjs`. `copyFileSync` preserved the source read-only attribute, so the mutation test could not append its deliberate tamper byte. The fixture correction makes only each temporary destination writable before running the unchanged clean-integrity and tamper-rejection assertions. All 17 tests in that file pass with the original tracked runtime source still read-only. Application permissions, runtime files, checks and deadlines are unchanged. Original hosted/local failures and the focused corrected output are included in the evidence index. GitHub checks on the draft PR are authoritative for the follow-up run.

## Historical native evidence — not this candidate's acceptance

The unchanged native archive at `docs/evidence/r2-recovery/` refers to runtime `90c13f402edf778ec6f25bc5eba469bbeefd7847`, source digest `879af4bb6a32e0bc9e2a11b8359d4fe90b23556fbafb945ecd3019a1138ccfa2`.

- [Startup run 41797208434, attempt 2](https://github.com/ANIRUDDH-001/Tabwise/actions/runs/41797208434): historical zero-key native startup.
- [Journey run 41801278982, attempt 2](https://github.com/ANIRUDDH-001/Tabwise/actions/runs/41801278982): historical genuine Tab/Tab/Enter speech capture and separate artifact verifier.
- Native artifact `13306859138`; separate-verifier artifact `13307932535`. Exact archived ZIP hashes are in `candidate.json`.

These artifacts retain their original synthetic/NONQUALIFYING manifest classification. They do not contain the required authenticated product-owned execution or a repaired native rerun. No new hosted native run was dispatched in this assignment.

## Remaining implementation and acceptance gaps

These are specific technical gaps, **not** a claim that all engineering is finished and only a signature is missing.

1. **Native producer/qualification contract:** `r2-evidence.mjs` still emits synthetic/incomplete classes; `product-bridge.mjs` requires genuine-unqualified source plus an independent native attestation. Their producer/classification transition needs a reviewed design and implementation. Do not relabel an archived diagnostic artifact to bridge this mismatch.
2. **Sealed runtime metadata — engineering connection added:** the continuation at `19d17a5` queries owned-process executable metadata and settings readback, writes an event into the existing sealed journal, and reads it through the exporter. Actual hosted NVDA execution of this new metadata path remains unmeasured. Installed asset metadata is not used as an observation fallback.
3. **Delivery and admission:** the product workflow remains a proposal. Exact per-request source delivery, durable one-use W5 admission, source/run-bound grant consumption, actual export orchestration and independent signing must be connected before an authorized product-owned baseline. Current committed authority/qualification/dispatch policies remain disabled.
4. **Actual product ingestion/readback:** durable SQL/custody/storage/bridge code and negative controls exist, but a new legitimate native product artifact has not traversed authentication → saved version → dispatch → sealed source → storage → owned readback.
5. **Genuine repaired native rerun:** approved immutable repair/source contracts and SQL/UI controls exist. Baseline native request preparation explicitly rejects patched variants; the repair run route currently selects the legacy producer. The repaired-source packet/plan/admission/worker association needs coherent native integration before the required new NVDA rerun.
6. **Verifier scope:** the deterministic recorder-based focus check has synthetic positive/negative controls. Native validation/status trigger checks deliberately abstain. No genuine paired baseline/rerun or independent withheld-task R7 assessment exists. A MACHINE/L3 symptom check is not external R7 acceptance.
7. **Product acceptance:** real hosted OAuth, complete owned product flow, stored native report and regression-case retention are not demonstrated. The UI/action controls and local SQL/browser checks do not establish full UI/backend completion.
8. **Live model validation:** current credit eligibility/balance has not been verified. Calls used: zero of twenty, incremental paid cost ₹0. Do not make a live call until the credit and broker safeguards are verified.

## Independent review requested

Review this exact source/digest and the unresolved producer/admission/repair contracts before selecting a trusted qualification mechanism. Supply a genuinely independent reviewer identity, source-bound review record and public verification key/trust-root procedure through the owner. Keep private signing material outside source, native/page/browser processes and model payloads. The implementing agent must not mint production trust or sign its own qualification.

Before qualification, define the producer/runtime metadata and class transition without modifying historical artifacts; bind a fresh product-owned run/spec/journey/version and exact source/plan to an expiring one-use grant; specify how the independent attester examines and signs the actual new capture. An external source review alone is insufficient to claim product readback or repair success.

After the missing contracts and authority exist, run the fresh authorized baseline through durable readback; obtain a genuine owner patch decision and frozen oracle; execute a distinct pinned repaired native run; then have the external R7 assessor evaluate frozen controls/withheld outcomes without tuning. Preserve failed attempts and inconclusive results.

**No R2/R3/R7-ready notification, production activation, main merge or full-product completion claim is authorized by this package.**

## Continuation after hosted CI passed

MEASURED: [hosted preflight 41818741025](https://github.com/ANIRUDDH-001/Tabwise/actions/runs/41818741025) completed successfully for PR head `dc4165651fcb176fbb6e1bf2085ea93382beb82c`. Its checkout record names GitHub's temporary merge revision `cb2e730a829f20d9cf85930e407e132f6c2f0c9f`. All nine profiles passed all 71 selected files; before/after source and checkout checks passed. Original result JSON files are preserved with `ci-41818741025-` prefixes. This is offline preflight, not new NVDA execution or native qualification.

The owner then requested “continue” and reported “CI also passed”. Sole-agent implementation continued with runtime metadata, without activating independent authority.

At `19d17a5098809406d5ff07041c6b44487718956c`:

- The fixed bounded Windows helper has an opt-in read-only metadata query. It reads the owned process's actual `MainModule.FileVersionInfo.ProductVersion` and executable SHA-256, preserving the existing three-field identity output for ordinary identity queries. It uses the process handle/start-time/path identity and refuses a stopped, mismatched or unreadable process, missing/nonnumeric version, failed helper or unconfirmed helper closure. No manifest/default version substitutes for a failed observation.
- The private authentic runtime exposes this query only for its owned live NVDA process after relay/identity revalidation. The session rechecks authenticity and the exact A15 settings readback, then writes the `tabwise-native-runtime/2` record into its existing events lane before input. Its settings digest must equal the fixed supported profile, not an arbitrary digest behind an A15 label. No path, token, signature or qualification flag is recorded.
- The exporter verifies the sealed events bytes and requires exactly one valid metadata record. Tampering, duplication, extra claims, substituted settings or an ambiguous legacy/new source refuses. Historical `/1` metadata remains readable under its old contract; historical archives and evidence classes were not rewritten. There is no new evidence-file allowlist or cap, so the existing historical reconstruction contract is preserved.
- The new validator is in the reviewed source and per-send runtime pin scopes; changes to its bytes are detected. Runtime pin count expands from nine to ten. All production qualification and integration policies remain disabled.

MEASURED local validation: root 1,269 pass with three previously exercised DB opt-ins; web 328 pass with three previously exercised DB opt-ins; diagnostics 140 pass; build/TypeScript, nine deployment route traces, frozen R1, runtime pins, preflight and diff checks pass. Actual read-only Windows observation of this Node process matched its independently hashed executable and version. The real evidence writer sealed and the exporter read a test-only runtime record while missing capture correctly remained `incomplete`. No NVDA started, no keyboard input was sent, and no model request was made. These checks are engineering evidence, not a hosted native acceptance result for the new path.

CITED API semantics: [Microsoft's process file-version documentation](https://github.com/microsoftdocs/powershell-docs/blob/main/reference/7.7/Microsoft.PowerShell.Management/Get-Process.md), fetched through Context7. The implementation uses the fixed .NET properties directly to avoid automatic module discovery; no third-party implementation was copied.

The current R2 source digest is `507d0eb3b448f07a83f054508de7f0168a1d625e59b8e2a3045d00c3c85c74ee`. Qualification-source digest remains `1a2991eb6c4bc42ffef5fbc1060d89dd8dc136c456211eddcf8dacf459ddd672`. Any future authority must review this new source; the prior hosted offline pass cannot authorize it. See `runtime-continuation.json` and `runtime-evidence-index.json` for exact source/evidence hashes and the outstanding acceptance criteria.

## Current metadata CI and UI follow-up

MEASURED: [hosted preflight 41822479229](https://github.com/ANIRUDDH-001/Tabwise/actions/runs/41822479229) passed on `f6a07faaeced3ab1e14fdfdc9c67b1d1cf2f8d4d`, which contains the `19d17a5` runtime source. All nine profiles passed all 72 selected files. Final source locks, unchanged checkout and artifact upload passed. Artifact `13319285925` contains the original output; result JSON files are preserved under `ci-41822479229-` prefixes. This verifies the metadata source in offline CI, not its genuine NVDA/product execution.

MEASURED: UI follow-up `b3fe53ccf20c0761c2ec47dadfc55eec3b05dfee` passes the live run status to the native request panel. When polling reaches an evidence-eligible state, the panel rereads server capabilities, so the evidence-retrieval action appears without a manual refresh. Aborted responses cannot replace the latest panel state. No client inference enables an action or grants qualification. The browser test first reproduced the stale panel while the displayed run already said `uploading`, then passed after the change. All three current native/repair UI browser controls pass; web 328 tests and build/TypeScript/nine route traces also pass. The runtime source/digest is unchanged by this UI fix. It was committed locally while metadata CI completed, then published with this receipt; GitHub checks for the new branch head remain separately authoritative.

The remaining class/attester/product-owned source-delivery design must preserve sealed pre-execution identity and obtain genuine external authority. A passing offline source suite cannot authorize changing synthetic diagnostic class strings, invent a reviewer key, or substitute for a new owned product run. The repair-native packet/plan/admission connection and the actual baseline/rerun/R7 acceptance remain unfinished. This is an incomplete engineering review handoff, not final product or merge readiness.
