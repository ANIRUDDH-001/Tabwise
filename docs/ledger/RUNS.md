# RUNS — scored R1 runs (append-only)

PLAN F-02 S13 (spec N-02, D-40). Every scored R1 run gets one row, added after its summary is read. Rows are never edited or removed; a correction is a new row that names the one it corrects. D-36: runs happen only in `.github/workflows/r1.yml`, dispatched by the user.

| Run id | Workflow run id | Commit | Approving decision | Result |
|---|---|---|---|---|
| r1-20261028T035811Z | 40629513668 (attempt 1) | 5a5d864b165aecf56074a790ba61a30bfa06e88e | Not recorded in the available checkout; not inferred | Recorded FAIL; setup-failed before step 1; rerun_allowed=true is eligibility only |
| r1-20261028T134638Z | 40699318334 (attempt 1) | b7a0bcd53a868c749e331fcc810860885ff16f16 | Execution approval not recorded in available ledger/artifact; not inferred from later diagnostic authorization | Scored FAIL; attempt 1 step 1/send 5 Tab lacked page acknowledgement within 1000 ms; possible misdelivery; rerun_allowed=false; evidence artifact 12821645543 retained |
