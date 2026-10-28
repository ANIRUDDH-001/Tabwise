# RUNS — scored R1 runs (append-only)

PLAN F-02 S13 (spec N-02, D-40). Every scored R1 run gets one row, added after its summary is read. Rows are never edited or removed; a correction is a new row that names the one it corrects. D-36: runs happen only in `.github/workflows/r1.yml`, dispatched by the user.

| Run id | Workflow run id | Commit | Approving decision | Result |
|---|---|---|---|---|
| r1-20261028T035811Z | 40629513668 (attempt 1) | 5a5d864b165aecf56074a790ba61a30bfa06e88e | Not recorded in the available checkout; not inferred | Recorded FAIL; setup-failed before step 1; rerun_allowed=true is eligibility only |
