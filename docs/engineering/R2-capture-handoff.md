# R2 offline capture adapter — F-03/D-57

MEASURED / MACHINE-L3, run_id `r2-capture-20261028`: targeted tests 23/23; full `npm test` 274/274; R1 preflight and private fixture seal/reproduction/export checks passed. All transport, page and clock inputs in the new tests are synthetic. R2 evaluation remains NOT RUN.

Exact files added: `src/r2/capture.mjs`, `test/r2-capture.test.mjs`, `test/r2-capture-boundaries.test.mjs`, this handoff.
Session records modified: `docs/CODEMAP.md`, `docs/ledger/DECISIONS.md`, `LOG.jsonl`, `PLAN.md`, `PROVENANCE.md`, `STATE.md`.
No existing source, tests, fixtures, locks, workflows or dependency files were changed. The 25 initial dirty/untracked files were preserved privately and hash-checked before ledger updates.

`captureJourney(options)` is an injected observation function returning a serializable evidence record, without file writes, process/browser/NVDA loading, scoring or model calls. It reuses the frozen R1 `withTimeout` and `judgeKeys` functions unchanged. `execute(action, {signal})` is the only action boundary; this milestone supplies only in-memory fakes.

Contract:

- `actions`: unique step IDs and key presses. Only `{step, press}` is sent to the executor. `fixture_id` is opaque; no fixture package, labels or source is loaded.
- `speech.read({signal})`: cumulative `{source, session, connected, complete, phrases}`. One session identifies one continuous connection; a reconnect must change it, and lost collection must be reported as incomplete. Strings remain exact; sequence positions distinguish legitimate repeated words. Initial phrases are excluded from action deltas. Shrinking/rewritten logs and changed sessions fail closed.
- `page.read({signal})`: `{session, complete, clock:'page-monotonic-ms', t, active, state, events}`. Events are a continuously collected append-only log beginning at seq 1, with page-local timestamps and relevant focus/app/mutation detail. The adapter retains every event supplied, including focus loss and recovery between identical endpoint snapshots. It cannot reconstruct events omitted by the provider.
- Explicit `observationMs`, optional `pollMs`/`timeoutMs`, and an injectable `{now, wait}` clock define bounded observation. Each provider/action call uses the existing R1 timeout primitive. No observation timing is presented as measured NVDA latency or a changed R1 threshold.

Output distinguishes `speech`, `observed-silence`, `missing`, `failed`, `disconnected`, `incomplete` and `ambiguous`. Silence requires a positive observed window, live/complete snapshots, intact log continuity and the exact page acknowledgement. Failure preserves readable partial evidence, requests cancellation and prevents the next action. A provider ignoring cancellation can still complete late; the adapter cannot retract an injected send, and it never claims otherwise. Returned evidence is detached from mutable provider buffers.

Every phrase is retained once in the raw delta journal and referenced by its original cumulative-log position. Each action keeps before/after/page samples, ordered event deltas, acknowledgement sequence, Node observation boundaries and source references. Rejected page snapshots remain available separately. Speech and page arrivals between closed windows are retained as unattributed and block completion; a final boundary check catches arrivals between the final speech/page reads.

Node sample times are labelled `node-monotonic-ms`; page times remain `page-monotonic-ms`. No cross-domain subtraction or event reordering occurs. Action association is explicitly `observation-window-only`, not proof of causality. Speech arriving arbitrarily late during a later action cannot be attributed to its true origin from untagged phrase logs alone; the real binding must qualify quiet/drain and continuity behavior. The current source/liveness markers are provider declarations, not authenticated provenance. The fake output is marked `fake-nvda` and does not satisfy the existing real-NVDA evidence validator. `COMPLETE` means complete supplied observation windows, never an R2 PASS.

Tests cover stale prefixes, multiple and repeated utterances, delayed speech through the window endpoint, silence, missing/throwing/disconnected/incomplete reads, session/reset/prefix failures, transient focus loss, event ordering/gaps, wrong/missing/duplicate acknowledgements, exact Escape/ArrowDown/Space/Shift+Tab matching, partial send failure, hung reads/actions, cancellation limitations, stopped clocks, boundary arrivals, final-window arrivals and rejected evidence retention. Existing tests were not edited or weakened.

Verification commands:

```text
node --test test/r2-capture*.test.mjs
npm test
node scripts/preflight.mjs
node C:/Users/ANIRUDDH/.codex/private/tabwise-r2/prep-20261028/verify-private.mjs
```

Outputs and the initial worktree preservation are private under `C:/Users/ANIRUDDH/.codex/private/tabwise-r2/capture-20261028/`. The sealed provisional fixtures remain unchanged outside Git. No labels were used in the new tests or adapter.

Remaining hosted blockers: cross-tool review of the new adapter; real guarded speech/page bindings with qualified connection continuity and observation windows; R2 physical acknowledgement mapping for keys outside frozen R1's mapping; approved CI/workflow policy and private fixture delivery; separate blinded label review. The fake executor is not a replacement for any foreground, ownership, nonce, integrity, acknowledgement, teardown or interference guard. No hosted orchestration is implemented. Product/API decisions remain with the parallel product-design review.

**Next concrete action:** review the adapter and targeted tests against this provider contract before implementing a real guarded binding. No hosted execution, inference, fixture disclosure, commit, push, desktop input or spending is authorized by this milestone.

D-58 superseding correction: independent review reproduced a pre-action page-read speech gap and acceptance of a late key inside a longer observation window. See `docs/engineering/R2-capture-corrections.md` for the targeted fixes, conservative separate acknowledgement bound, explicit unverified execution/quiescence, new tests and BLOCK on proceeding to the real binding. The D-57 measurements above remain historical evidence, not qualification of the corrected implementation.
