# Hosted pipeline and first-probe readiness

Evidence class: MEASURED MACHINE/L0 from `p0-corrections`; architecture conclusions below marked INFERENCE where no native run exists. No third-party mutation, workflow dispatch, Meta call or native startup/input was performed.

## Saved-journey connection

| Boundary | Current implementation | Readiness |
|---|---|---|
| Saved journey → version | Owner-scoped `journey_versions`, `requireUser`/getUser, immutable version and admission tests | Locally exercised; hosted sign-in configuration/session still requires owner check |
| Version → admitted run | `/api/runs` reads owned version and calls `admit_version` or `admit_repair`; rejects without execution references | Fail-closed; hosted worker review remains PENDING |
| Admitted run → workflow | `dispatchAdmitted` persists exact spec and sends once to `tabwise-run.yml` on main | Present, but reaches the legacy refusal-only worker |
| Workflow → native evidence | `scripts/tabwise-run.mjs` has no baseline runtime execution after its gates; patched path explicitly refuses and requires the sole R2 entry | Disconnected from qualified native execution |
| Native R2 admission → producer | `tabwise-r2.yml` has distinct approved revision/owner/plan inputs, runtime custody, source checks, exporter and attestation | Separate candidate; disabled/BLOCK |
| Artifact discovery → ingestion | Product reconciliation expects `tabwise <product UUID>`, workflow `tabwise-run.yml`, artifact `tabwise-evidence-<run>-<attempt>`; native workflow uses different identity and artifacts | No supported dispatch/discovery compatibility bridge established |
| Native export → stored evidence | Strict R2 mapping/attestation reader exists and refuses unqualified artifacts | Tested service seam; does not connect the two workflows automatically |

INFERENCE from these exact call sites: enabling the saved-run button/approval environment alone cannot produce a native R2 product run. A coherent bridge needs a reviewed product-run/spec-to-R2-plan binding, one execution-authorized producer, workflow-specific discovery/identity checks, source-bound export and complete storage ingestion. Do not replace workflow strings alone: these contracts intentionally differ. CI/workflow and approval changes require owner authorization and independent review before implementation/publication.

## Hosted read-only snapshot

GitHub MCP: PR22 remains OPEN/unmerged, head `dab193656a7336cac5bea1101adfcf4ad56ce438`, main/base `48e83a2525114b51467dce35918bd2caaf46e32f`. Current local corrections are unpublished.

Vercel MCP now returns project `tabwise`, `prj_UDiv7hsFzi7fpun4eMhCOT8DsW0R`, account/team `team_dKCxOthHp76gtaT5JaK6BIFE`, framework nextjs, Node26.x. Latest reported deployment `dpl_3K8yZR5FPLJezM8fxcJUq6Xrjxqr` has readyState ERROR. Its event endpoint returns404 even with that exact team. Project metadata visibility is established; build-log/deployment access remains insufficient or unavailable. No unrelated account was opened. Node26 hosted behavior is not established by the local Node24.22.1 build. No deployment or environment change was attempted.

Supabase MCP: dedicated Tabwise project `ueobjrtvsgvkigmjxkks`, ACTIVE_HEALTHY. Exactly the first five repository migrations are applied. The public schema has RLS on all 19 listed tables. Existing runs and journey versions use authenticated `auth.uid()` ownership; findings/diagnoses/patches use owned-run predicates. Shared journey templates have a separate public-read policy; they are not private saved versions.

Current flags: dispatch_mode owner_only; diagnosis_mode off; worker_review_verdict PENDING; actions_policy_cleared false; approved worker SHA count0; qualification and worker-review references absent. Fernway app hash remains the original pinned digest. No flag was changed. Existing authenticated ownership policies do not establish that a deployed OAuth/cookie flow works.

## Exact migration proposal — not executed hosted

After a fresh schema backup/restore-point confirmation and a quiet write window, apply these existing source files in order to the dedicated project only:

1. `20261103000000_repair_application.sql`: immutable candidate materialization, frozen patch decisions and immutable diagnosis/finding/audit history.
2. `20261103010000_repair_rerun.sql`: retained base source, immutable distinct rerun tuple, admission and replay guards.
3. `20261103020000_repair_verdict.sql`: independent owner oracle registration and immutable verdict projection.
4. `20261103030000_repair_oracle_admission.sql`: oracle-before-admission and live repair-dispatch trigger, including old-row rejection.

Local verification used all 9 migrations on 3 fresh databases, all 8 SQL suites, and 3 real concurrency/admission tests. An additional isolated cluster applied the first five, then faulted the four-migration transaction. The failure rolled back table creation and restored the previous `review_patch` function definition. A succeeding atomic batch produced all four RLS tables. Both local clusters stopped with exit0; retained data directories are recorded in the JSON evidence.

Proposed hosted transaction envelope: `BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';` then the four complete files in order, verification of expected objects/privileges, and `COMMIT`. This exact envelope passed locally; hosted lock duration and installed migration-runner transaction semantics are UNMEASURED. If hosted tooling applies one migration per transaction, do not claim four-file atomicity: keep repair traffic disabled and validate every intermediate version, or use an owner-approved transactional migration package. Do not claim that applying raw SQL automatically updates Supabase migration history.

Before commit: verify all four private tables have RLS, anon/authenticated lack table writes and function execution, service_role has only the specified table/RPC rights, functions use an empty search_path, and no new SECURITY DEFINER bypass appears. Repeat cross-user refusal, stale source/digest, duplicate conflicting request, immutable approval, candidate/rerun idempotency, oracle registration and legacy dispatch negatives on an owner-approved hosted test tenant. Local equivalents passed; no production tenant test was executed.

Rollback before commit is ordinary transaction ROLLBACK, demonstrated locally. After a successful commit, keep all immutable evidence rows, disable repair dispatch/inference through a separately authorized operational change and roll back the application release; prefer a reviewed forward fix. A destructive reverse migration would conflict with preserved evidence and changed immutable history. If a full schema reversal is required, use the pre-change restore point into an isolated replacement, reconcile any newly written evidence, then authorize cutover. Do not drop new tables or disable immutability as an automatic rollback. Account for locks from ALTER TABLE/trigger creation and possible rejection of previously admitted unregistered repairs; no user data scan/backfill is required by these files, but production timing is unmeasured.

## Hosted configuration checklist — names only

- Check project URL binds exactly to the dedicated Supabase project; publishable key and server-only service key belong to that same project. No key values were read or printed.
- Check authenticated sign-in redirect/site URL, cookie/session getUser validation and two-owner isolation before enabling a product run. Connected auth settings were not mutated or represented as tested.
- Check `GH_PAT` and `GH_PAT_OWNER` have access only to the intended repository and required workflow/artifact operations; verify exact approved worker revisions and source/plan hashes.
- Keep `TABWISE_EXECUTION_APPROVAL_REF`, `TABWISE_REPAIR_EXECUTION_APPROVAL_REF`, `TABWISE_META_APPROVAL_REF`, `TABWISE_R2_RECEIPT_PRIVATE_KEY` and server policy transport bindings subject to separate review. Merely setting these does not repair the workflow disconnect or qualify evidence.
- Confirm Vercel commit SHA, raw reviewed-source closure and signing-key/public-key binding in the actual deployment. Confirm secrets remain server-only. Do not enable diagnosis or send MODEL_API_KEY requests for a configuration check.

## Existing R2 diagnostic: exact current candidate

Worktree `C:/Users/ANIRUDDH/.codex/worktrees/tabwise-owner-query-trace/app` is untouched. HEAD `b4620427466be53ea8b7d786cb78d65f5f865fb5`; candidate changes and new workflow files remain uncommitted. Current normalized sourceDigest `c002d510073ed0f3de0893cd37820b97d6ebe67283dfb46917d2a5fa1181f128`, inventory97 files. This current digest supersedes earlier diagnostic handoff values; the older reports are retained. All 50 existing synthetic external-trace/boundary/zero-key/supervisor tests pass in this session.

Read-only probe path: new `tabwise-owner-query-probe.yml` → `probe-entry.mjs` → `runReadOnlyProbe` → fixed `powershell.exe -NoProfile -NonInteractive -File owner-query-probe.ps1`. No NVDA/browser startup, model client, dynamic script, input action or hidden retry is present in this probe. Entry validates clean source, exact workflow/ref/actor/revision/run/attempt/source/script/command binding and unchanged production BLOCK status. Child environment is OS-only. PowerShell emits numeric/enum entry/query-call/query-return/final fields around Get-NetTCPConnection6837 and unique-owner selection.

Expected useful observations: PowerShell entry absent; query call without completion; query error/no listener; multiple owners; child exit versus pipe close; synchronous parent spawn duration. Parent and PowerShell clocks have different origins and must not be subtracted. A no-listener/query-error result can supply timing evidence and is not owner attribution or native qualification.

Limits: parent deadline27,000ms plus cleanup1,000ms, stdout8,192bytes/4rows, stderr counter cap1MiB, artifact131,072bytes; outer probe job ceiling5minutes. Node deadlines cannot preempt a synchronous OS spawn stall. One kill targets the direct PowerShell child; a missing close marks containment_required. Artifact explicitly reports physical_quiescence_verified false. The probe starts no NVDA/browser, but an absence of orphan descendants has not been established on hosted Windows. Preserve that uncertainty; do not label close-only cleanup as independently verified process-tree quiet.

The current probe retains sanitized parsed stdout rows, output byte counters and exit/close clocks/codes, deliberately omits raw stderr/exception content, and seals result/authorization/index on normal returned failure. This does **not** satisfy a stronger requirement for raw stdout/stderr preservation, nor does `saveResult` guarantee an upload after host cancellation, disk failure or a synchronous stall. Existing synthetic tests do not remove these limitations. A reviewer must decide whether the fixed numeric trace is sufficient or require a separately reviewed bounded private raw-log/custody improvement before execution. No claim that every supplied probe-review requirement is resolved is made.

First genuine gate: independent other-tool review of the current diagnostic diff, followed by owner-controlled workflow registration/publication. No exact future commit SHA or run ID exists for uncommitted unpublished code. A NON-AUTHORIZING packet is frozen locally with these fields null; no old run identity or approval is reused. New workflow_dispatch files must be registered on the default branch by the owner. The existing bootstrap creates an exact attempt2 packet only after clean committed source and an actual fresh run ID exist; attempt1 performs offline tests only. Only after owner approval of that exact packet may the first hosted read-only timing probe run. Probe approval never authorizes NVDA startup or keyboard input.

R2 qualification, genuine paired controls, Spark native constructor admission, genuine R3 rerun and R7 assessment all remain BLOCKED. Resolving the workflow bridge and hosted schema/auth requirements is independently necessary; a successful timing probe would not complete the product.
