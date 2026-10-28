# F-02 publication and isolated execution handoff

The D-43 independent review approves the reviewed source for publication. D-46 authorizes making the manual workflow available on main and explicitly says not to run it. There is no real R1 PASS. The historical I-01 incident and D-39/D-42 BLOCK reports remain in the repository.

The execution path is `.github/workflows/r1.yml`, manually dispatched on main in this repository, on a disposable GitHub-hosted Windows VM. It has no push or pull-request trigger. It uses a read-only token, no repository secrets or Meta calls, pinned actions and existing locked dependencies. Do not run `npm run r1` on the personal desktop or bypass its CI checks.

## Before a separately approved real run

1. Obtain explicit approval for one manual R1 workflow dispatch at a named main commit. Publication permission is not execution permission. Do not start a second run automatically.
2. Verify the reviewed commit, source lock, frozen gates and offline suite. Do not edit the repository during a run. The workflow checks a clean checkout and records HEAD, dependency/test hashes and runner identity.
3. Preserve all outcomes. Setup failures count as recorded attempts at execution; a setup-only retry needs the existing rerun rule and its evidence. Once attempt 1 reaches step 1, the one-scored-run rule applies. Do not label a trial run unscored to avoid that rule.

## Expected fail-closed behavior

Startup must establish reset, a live owned NVDA PID and exact relay-listener PID equality. The intended Chromium process and nonce must already be foreground; the harness does not raise or cycle windows. These Windows relationships are not yet measured. If the launcher uses a different PID, focus cannot be established, VBScript is unavailable, or another setup assumption fails, preserve the setup failure. Do not relax PID equality, freshness, acknowledgements or speech predicates to obtain a result.

Every actual send needs a persisted intent, mandatory page pre-read and a fresh foreground observation. Unexpected input, transport loss, missing or late acknowledgement, interference, damaged evidence or incomplete cleanup rules out PASS. An operation already handed to the OS cannot be recalled; an identical foreign key inside a send window is indistinguishable from the intended key. These are disclosed limits of the isolated experiment.

## After the run

Download the complete `r1-evidence-<workflow-run-id>-<attempt>` artifact before its 30-day retention ends and preserve it through R7. Keep failed, aborted, partial and recovered files. Inspect the workflow outcome, `_runner/job.json`, `summary.json`, all attempt records, raw speech, focus and send journals, cleanup errors and evidence-integrity findings together. Exit success or a model's judgment alone is insufficient.

Append the scored result to `docs/ledger/RUNS.md` using its run ID, workflow run ID, commit, approving decision and actual result. Never erase or relabel prior rows. Only a real single run containing three fresh, complete attempts can satisfy R1; offline simulations do not change `FEATURES.json` to passing.

## Offline engineering evidence

- `F-02-verification.json`: final full-suite counts, lock/vendor/gate checks and unmeasured native assumptions.
- `F-02-mutation-results.json`: baseline and every mutation outcome, including cancellations and the corrected mutation-17 behavioral check.
- `F-02-source-manifest.json`: reviewed worktree raw-byte hashes. Git normalizes ordinary text line endings; vendor bytes must remain exact.
- `../reviews/R1-D43-review-independent.md`: independent source verdict, reproduced findings and limits.

Raw TAP and scratch scripts remain under `%TEMP%/tabwise-owner-4563fa9d/`; independent probes remain under the placeholder directory recorded in the review. They contain synthetic test evidence. No real NVDA run was performed during this engineering session.
