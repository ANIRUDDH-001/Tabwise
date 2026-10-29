# RUNS — scored R1 runs (append-only)

PLAN F-02 S13 (spec N-02, D-40). Every scored R1 run gets one row, added after its summary is read. Rows are never edited or removed; a correction is a new row that names the one it corrects. D-36: runs happen only in `.github/workflows/r1.yml`, dispatched by the user.

| Run id | Workflow run id | Commit | Approving decision | Result |
|---|---|---|---|---|
| r1-20261028T035811Z | 40629513668 (attempt 1) | 5a5d864b165aecf56074a790ba61a30bfa06e88e | Not recorded in the available checkout; not inferred | Recorded FAIL; setup-failed before step 1; rerun_allowed=true is eligibility only |
| r1-20261028T134638Z | 40699318334 (attempt 1) | b7a0bcd53a868c749e331fcc810860885ff16f16 | Execution approval not recorded in available ledger/artifact; not inferred from later diagnostic authorization | Scored FAIL; attempt 1 step 1/send 5 Tab lacked page acknowledgement within 1000 ms; possible misdelivery; rerun_allowed=false; evidence artifact 12821645543 retained |
| r1-20261028T153344Z | 40716824856 (attempt 1) | 0c93fa73e0c111a2df65302adfe0006d63f50a39 | D-54 | Scored PASS under the D-53/A15 profile only (`virtualBuffers.enableOnPageLoad=false`; not default browse-mode coverage). Owner-reported summary: 3/3 fresh complete attempts, 30/30 steps, strict key acknowledgements, no evidence-integrity failure. Public run page read 2026-10-28T15:59:50Z: conclusion Success, main @ 0c93fa7, workflow_dispatch; artifact r1-evidence-40716824856-1 (12829526270), sha256 419807699a32e3752f6e6637f275803b9db803c960991f0b4d8ecfe8844fc885, matches owner digest. summary.json not inspected by Claude (download needs sign-in). R1 #3 FAIL unchanged |
