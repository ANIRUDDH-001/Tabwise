# R2 targeted corrections — F-03/D-58

Verdict: **BLOCK proceeding to the real binding.** These bounded offline corrections address the reproduced gaps; they do not verify a real guarded provider or reconcile the product architecture.

MEASURED / MACHINE-L3, run_id `r2-correction-20261028`: both reported issues reproduced before edits. Seven new regression tests initially failed; all 30 capture tests now pass. Full `npm test`: 281/281 pass; R1 preflight and existing private fixture integrity checks passed. All timelines in the new tests are synthetic, not observed NVDA timings. Exact outputs are preserved privately.

| Reproduction | Before correction | After correction |
|---|---|---|
| Speech appended during pre-action page read | COMPLETE; phrase in Enter's text; Enter sent | INSUFFICIENT_EVIDENCE/ambiguous; phrase retained as unattributed; no Enter sent |
| Keydown scheduled at Node +1,500 ms; observation 2,000 ms | COMPLETE with `ack_seq: 1` | Stops at Node +1,000 ms, INSUFFICIENT_EVIDENCE, `ack_seq: null` |

Minimal changes:

1. Recheck the speech cursor after the asynchronous pre-action page read and before requesting execution. Any newly observed phrase is preserved as unattributed and blocks the send. This closes the demonstrated page-read gap; repeated reads cannot establish an atomic physical-send boundary for an untagged stream. Remaining arrivals are only associated with the observation window, never causally certified.
2. Check matching key observations during polling, with a separate fixed 1,000 ms cap beginning at the Node executor request. Polling is shortened to reach that deadline when no matching key has been observed. The general speech observation may continue after a timely key, so speech at +1,500 ms remains available when the key was observed at +500 ms. Slow executor completion cannot reset the deadline. A page timestamp cannot backdate a late observation.
3. Record `guarded_execution_verified: false` for every result. The local bound is conservative and is **not** a verified R1 send receipt: the real physical send may happen later than the executor request. A valid actual guard acknowledgement hidden behind a long executor operation can therefore be conservatively rejected. Supporting it requires independently checked guard evidence or a separately reviewed bounded execution/observation interface, not a larger observation window or a weakened R1 threshold.
4. Record executor `started`, promise `settled`, `cancellation_requested`, and `quiescence: UNVERIFIED`. Request cancellation promptly on failure. A timed-out executor remains unconfirmed; the test deliberately ignores abort and sends later. Returned evidence stays unchanged. Even a settled promise cannot attest that background physical work has stopped.

Exact files changed in this correction:

- Modified implementation: `src/r2/capture.mjs`.
- Added regression tests: `test/r2-capture-corrections.test.mjs`. Existing tests unchanged.
- Added this handoff; appended a superseding note to `docs/engineering/R2-capture-handoff.md`, preserving its historical results.
- Modified session records: `docs/CODEMAP.md`, `docs/ledger/DECISIONS.md`, `LOG.jsonl`, `PLAN.md`, `PROVENANCE.md`, `STATE.md`.

The new tests cover both exact reproductions, delayed speech after a timely key, a slow executor, sparse polling, non-cooperative cancellation, and the distinction between promise settlement and physical quiescence. No R1 implementation, locks, thresholds, workflow or evidence was edited. Previous evidence and the initial 29 dirty/untracked files are preserved under `C:/Users/ANIRUDDH/.codex/private/tabwise-r2/correction-20261028/`. The provisional fixture package and labels remain sealed outside Git.

Required verification commands:

```text
node --test test/r2-capture*.test.mjs
npm test
node scripts/preflight.mjs
node C:/Users/ANIRUDDH/.codex/private/tabwise-r2/prep-20261028/verify-private.mjs
```

Limits requiring real guarded providers: authentic send/ack timestamps and identity; continuous speech transport with qualified draining; a defensible physical-send speech boundary; and independently established transport/executor quiescence. The Node/page clocks remain separate. Neither source markers, raw strings, this observation cap, `COMPLETE`, nor an abort request establishes provenance, causality, safe teardown or official R2 acceptance.

**One next action:** reconcile the corrected executor/speech-boundary contract with Claude's architecture and the frozen R1 guard requirements before approving any real-binding implementation. No binding, hosted execution, inference, UI, orchestration, publication, commits, pushes or spending was performed in this correction.
