# Assessment of the external execution-plan critique

Decision: adopt the dependency-based G0–G5 schedule, with the qualifications below. This is analysis and plan refinement, not approval to implement G2, commit, publish, deploy, run native input or spend. The pasted review is external feedback supplied by the owner; its proposed authorizations do not replace an owner decision.

## Findings checked against facts

| Reviewer claim/proposal | Disposition | Evidence and refinement |
|---|---|---|
| R1 A15 already passed; do not automatically rerun | ACCEPT; correction to our plan | CITED: PLAN F-02 status, D-55 owner closure, RUNS row and anchored `web/data/r1-pass.json`. MEASURED this review: six existing public-snapshot/anchor tests pass. Old Phase3 incorrectly scheduled fresh R1 execution; now replaced by a reuse/delta matrix for R2. |
| R1 acceptance informs R2 but cannot qualify the changed worker | ACCEPT WITH SCOPE | CITED: accepted source/profile/fixture differ from R2 contracts. Snapshot records81 confirmed,90 unconfirmable acknowledgments out of171 sends. Preserve the accepted historical result without enlarging its guarantees. FEATURES.json still says R1 passes:false; this is a ledger reconciliation issue, not grounds to discard acceptance or permission to edit frozen entry semantics here. |
| PR22 remains open at dab1936, corrections unpublished | VERIFIED | MEASURED: GitHub MCP get_pr_info confirms OPEN/unmerged, head dab193656a7336cac5bea1101adfcf4ad56ce438 and base48e83a2525114b51467dce35918bd2caaf46e32f. Local staged index contains corrections absent from that remote head. |
| Native diagnostics and local bridge work should progress together | ACCEPT | INFERENCE from independent capabilities: local DB/API/storage integration does not require a live native session; a source-bound read-only diagnostic can be prepared without completing the product bridge. Sole implementer alternates bounded slices; no subagents or concurrent edits during native execution. |
| GitHub POST cannot share a PostgreSQL transaction | ACCEPT AND MAKE TESTABLE | CITED implementation: jobs.mjs claims state, then sends externally; a thrown response currently becomes failed/dispatch_outcome_unknown. Proposed explicit DISPATCH_UNKNOWN state retains ambiguity and forbids automatic resubmission. Exact fault matrix is now part of the plan. No exactly-once external execution claim. |
| Earlier plan needs bespoke correlation because dispatch does not return a run ID | CORRECT THE EARLIER PLAN | Current official API2026-03-10 returns200 with workflow_run_id/run_url/html_url. The installed application already requests this API version, parses non204 JSON, but the run route discards the returned data. Use returned ID for provisional normal-path correlation. Keep authenticated worker binding and recovery for lost-response/crash paths. This is additional evidence beyond the critique. |
| Withheld criteria must be frozen before final results | ACCEPT AND STRENGTHEN | Freeze task/label/criterion identities before development exposure to task-specific outcomes, not merely before final native output inspection. Independent custodian holds contents; publish only seal/registration metadata to implementation. Freeze candidate before execution; seal results afterward. Source reviewer exposure does not automatically establish R7 assessor independence. |
| Product comprehension/UI should improve now | ACCEPT WITH BOUNDARY | Plain-language onboarding and accurate run/evidence states belong in G2. Keep A15 details in evidence views while retaining the A15 limitation wherever coverage claims require it. Do not add broad redesign or hide qualification behind a green badge. |
| G0 completes publication/deployment before everything else | QUALIFY | G0 publication/CI is a gate for the corresponding hosted experiment, not a gate for every local G1/G2 step. Track source/CI acceptance and hosted-runtime verification separately. DEPLOYMENT_BLOCKED may close the source-review checkpoint, but cannot satisfy deployment acceptance for final product demonstration. |
| Both native artifacts and independent attestation suffice | STRENGTHEN | Existing selectors only identify metadata candidates. Require authenticated request/worker binding, workflow-origin signed subjects and native qualified-verifier evidence/custody checks as distinct layers. A SLSA signature is not physical input verification. See product-bridge attest/production policy checks and r2-caller OIDC checks. |
| Immediate G2 acceptance table | ACCEPT AS NECESSARY, EXTEND FOR RECOVERY | Require all listed ownership/correlation/concurrency/provenance/ingestion/UI/integration outcomes together. Add lost200 response, crash after200 before DB save, late handshake after lease expiry, two dispatchers, duplicate native claims, reverse run/request collisions and stale/out-of-order ingestion events. |
| Current inactive helper is only a starting point | VERIFIED | `product-dispatch.mjs` prepares scalar digest bindings, takes injected storage and matches provided association/remote metadata. Its self-hash is not a signature or authorization. No live route, SQL mapping/RLS, producer handshake or signed native ingestion is implemented by that helper. Fourteen earlier tests establish scoped local behavior, not end-to-end product readiness. |
| November4 16:00 IST go/no-go | RETAIN AS OWNER PROPOSAL | Project records internal submission November4 22:00 and hard deadline November5 07:30 IST. The proposed checkpoint is a management choice, not a revised technical threshold, permission to run/submit, or deadline-based PASS. No automation or cutoff enforcement created. Prepare a truthful strongest-working-scope contingency alongside the primary objective. |
| Source review before publication and selective test reruns | ACCEPT | Provide complete staged patch and index-blob manifest, not only summaries. Six targeted R1 anchor tests were run for this review; the full1211-test suite was not repeated for documentation changes. Final code-candidate and hosted CI checks remain required after implementation changes. |

## Critical API correction and its limits

CITED official sources obtained through Context7 and checked directly:

- [GitHub REST workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event): current200 response includes workflow_run_id and URLs.
- [GitHub REST breaking changes](https://docs.github.com/en/rest/about-the-rest-api/breaking-changes): version2026-03-10 removes return_run_details and always returns run details.

CITED local code: `web/lib/server/github.ts` requests2026-03-10 and returns parsed JSON; `web/app/api/runs/route.ts` awaits github without returning its data; `web/lib/server/jobs.mjs` ignores any returned dispatch value. Therefore the missing normal-path run ID is an application integration gap, not a platform inability. No real dispatch was performed to validate hosted behavior in this task. Implementation must validate response schema/ID and verify fetched run identity; never trust returned URLs as arbitrary fetch destinations.

The API improvement does not make the network atomic: GitHub can accept a request and the client can lose the response. Keep a persisted send intent, no automatic resend, source-bound worker recovery and a single admitted execution per request. Do not replace an impossible exactly-once VM guarantee with similarly unjustified exactly-once webhook delivery.

## R1 reuse matrix for the implementation specification

| Existing accepted evidence | Reuse | Additional R2 evidence required |
|---|---|---|
| A15 profile, pinned R1 source and accepted3-attempt10-step sign-up task | Preserve historical acceptance and source anchors | Current R2 source/profile/config binding; no implied default browse-mode/Fernway coverage |
| Real NVDA speech acquisition on that fixture | Established historical feasibility | Current session freshness, complete speech/silence capture and step mapping |
| Frozen send/foreground guarding | Reuse identical reviewed code/contracts | Changed process ownership, foreground/session identity, action-specific acknowledgments and custody |
|81 confirmed/90 unconfirmable/0 missing acknowledgments | Preserve exact limitation | Demonstrate the R2-required receipt/input/ack conditions; do not call every historical send confirmed |
| Historical run's recorded cleanup | Preserve that run's result | Current R2 descendant ownership, timeout/cancellation, stale-process rejection and independent quiescence evidence |
| R1 public snapshot/archived identity | Reuse exact historical identity | Native R2 attestation, source-plan-product mapping, distinct R3 rerun and independent withheld evaluation |

## Concrete next review/approval package

`cache/plan-review-refinement/` contains a complete current staged binary patch, a manifest of every staged changed file from actual index blobs, the R2/qualification source closure with staged blob hashes, prior result-reference hashes and the six-test R1 validation log. Manifest identifies base HEAD and exact index tree. Session ledger changes are outside that staged packet and remain separately disclosed. Updated plan and this response are included; no files were sent to another party.

Reviewer should inspect `product-dispatch.mjs` and its tests file by file, then issue a scoped source verdict. The owner can subsequently authorize bounded local G2 and diagnostic refinement independently. Neither the reviewer's recommendation nor this document starts those tasks. Current approved baseline/permission gates remain unchanged.
