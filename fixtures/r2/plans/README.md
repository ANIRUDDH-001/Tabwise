# R2 run plans (`tabwise-r2-plan/1`)

The R2 workflow accepts only `--plan fixtures/r2/plans/<id>.json`, and `loadR2Fixture` loads only fixtures inside the
plan's own directory. So each fixture a plan names is a byte-identical copy of a registered development fixture under
this directory, bound by `fixture_sha256` (CRLF-normalized `pageHash`).

| Plan | Status | `r2PlanDigest` |
|---|---|---|
| `a5-validation-smoke.json` | **CANDIDATE, not approved.** `r2-status.json` names no `plan_sha256`; R2 stays disabled/BLOCK. | `8bb82898703fbaf4d8a4f70fd2223b02913a2c5f0cbbd85d7a17fedb251bc0b4` |

A plan becomes runnable only through a new owner decision and a status-only commit naming its digest
(`docs/engineering/R2-final-handoff.md` §E). Tests: `test/r2-review.test.mjs` A5-P1, A5-N1, A5-N2.
