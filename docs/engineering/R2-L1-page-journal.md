# R2-L1 — offline page-journal compatibility adapter

Closes gap **G1** of the R2-L0 gap table (`Tabwise-worker-binding-blocker.md`) and nothing else. It is an offline adapter over **injected synthetic data**. It is not page evidence, not a real-browser journal (G3) and not a guard, executor or receipt composition (G2, R2-L2). All R2 evidence remains synthetic/UNATTESTED; `review-status.json` stays BLOCK and `qualification-status.json` stays `enabled:false`.

Branch `feat/tabwise-r2-l1-page-journal`, baseline `main` `eedfdcbe8e45013a023dda3cd3bcc17f29721733`. Implemented by Claude at the owner's direction for this task (it overrides the reviewer-only default for this task; see DECISIONS). Uncommitted.

## Files

| File | Change |
|---|---|
| `src/r2/page-journal.mjs` | New. `createPageJournal` |
| `test/r2-page-provider.test.mjs` | Appended J-P1–J-P4 and J-N1–J-N11 (66 tests); existing 42 tests untouched |
| `docs/engineering/R2-L1-page-journal.md`, `docs/CODEMAP.md`, `docs/ledger/{STATE.md,LOG.jsonl,DECISIONS.md}` | Docs and ledgers |

No existing source, qualification file, workflow, CI inventory, status JSON, vendor, frozen R1 or `package*.json` changed. No caller in `src/` or `scripts/` imports `page-journal.mjs`.

## Interface

`createPageJournal({source, writer, maxEvents = 1000, maxBytes = 262144})` returns a frozen `{snapshot(), keys(cursor)}`.

- `source.read()` (sync or promise) returns the raw cumulative journal `{session, complete, clock:'page-monotonic-ms', t, active, state, event_count, overflow, dropped, events}`.
- `snapshot()` returns the `createPageProvider`-validated `page.read()` shape.
- `keys(cursor)` returns `[{seq, key, shift}]` for keydowns with `seq > cursor`. This is the `read(cursor)` that the frozen `pageAck` expects: `pageAck({read: c => journal.keys(c), ackMs})`.
- `writer` is optional. It is called only as `writer.append('page', {phase:'r2-journal', view, cursor, seq_max, complete, errors})`, synchronously or returning a promise.
  - A successful-evidence write is awaited. The view is returned only after it resolves and the latch is re-checked. A sync throw or async rejection latches `evidence writer failed: …` for both views and returns no data.
  - On the first failure, one diagnostic entry with `complete:false` and the failure reason is attempted. It is ineligible as evidence. The refusal is latched first and is not delayed by this write. A sync throw or async rejection from it is handled and kept as the latched error's `cause`; it never becomes an unhandled rejection.

## How the invariants are enforced

Each call runs one pipeline: busy check → one `source.read()` → detached `structuredClone` → strict journal checks → history checks against the single shared `accepted` state → cursor check (`keys` only) → one internal `createPageProvider.read()` over that same value → writer → view selection. Both views share the same internal provider and the same `accepted` state, so neither view can return data that the other's state would reject.

| Invariant | Check | Refusal reason (`page journal: …`) |
|---|---|---|
| Completeness | `complete === true`, `overflow === false`, `dropped === 0`, `event_count === events.length`; a missing field is refused, never defaulted | `journal incomplete` / `overflow declared` / `dropped events` / `event_count mismatch` |
| Sequence | `seq` exactly 1..n; `t` finite, ≥ 0, non-decreasing, ≤ snapshot `t` | `journal sequence not contiguous from 1`, `journal event time` |
| Identity | `clock` fixed; `session`/`clock` constant across reads | `journal clock domain`, `journal session or clock changed` |
| Append-only | no shrink; earlier events identical by canonical (sorted-key) JSON | `journal shrank`, `journal history rewritten` |
| Focus | raw `focus` refused (not renamed); event `active` required (not inferred); `focusin.target === active` | `raw focus event refused`, `event active element missing`, `focusin target differs from active` |
| Modifiers | all five of `shift`, `ctrl`, `alt`, `meta`, `repeat` boolean (stricter than `page-provider.mjs`); any true `ctrl`/`alt`/`meta`/`repeat` refused; non-empty `key`; `target === active` | `keydown modifier flag missing or non-boolean`, `keydown modifier or repeat`, `keydown key empty`, `keydown target differs from active` |
| Caps | event count and canonical-JSON bytes | `journal event cap`, `journal byte cap` |
| Cursor | non-negative safe integer ≤ last accepted `seq` | `cursor out of range` |
| Provider reuse | everything `createPageProvider` refuses (focus pairing, state-without-mutation, JSON finiteness, …) is passed through with its own reason | `page provider: …` |
| Sticky | overlap, upstream read error/rejection, writer throw or rejection and every refusal latch one failure; later calls rethrow it without reading the source; a pending read or pending async write that settles later cannot clear it or release data | `overlapping reads`, `source read failed: …`, `evidence writer failed: …` |
| Static scope | imports only `./page-provider.mjs`; exports only `createPageJournal`; returned object has only `snapshot`/`keys` | J-N9, J-N10 |

**Read-count interpretation.** Every *accepted* call performs exactly one `source.read()` (J-P3 counts it). A call refused before reading (overlap, or a failure already latched) performs none (J-N1 asserts this). That is the strictest reading of "one source" that also keeps a failed adapter from driving further I/O on an injected source.

## Verification (MEASURED, Windows, Node v24.22.1)

Before the change: qualification digest `6972c311a6e9302856ff9bb9195aa73cf106a15da8caf91ac32b781f8909f328`; `test/r2-page-provider.test.mjs` 42/42; `test/r2*.test.mjs` 243/243.

**RED** (2026-10-30T14:09:47Z) against a naive stub that returns `source.read()` to `snapshot()` and filters it for `keys()`; the module existed and imported correctly. 106 tests: 47 pass, 57 fail, 2 cancelled (the J-N11 overlap cases hang on the stub until the 20 s timeout). The five J-tests that pass on the stub (J-P1, J-P2, J-P3, J-N7, J-N10) are positive or shape behaviour that a pass-through also satisfies. Every other J-test failed.

**GREEN** after the implementation, plus two cases added during the mutation pass (J-N4 provider-only refusal, J-N3 in-place source mutation) and a no-further-reads assertion in J-N1:

| Command | Result |
|---|---|
| `node --test --test-timeout=20000 test/r2-page-provider.test.mjs` | 108/108 |
| `node --test --test-timeout=20000 test/r2*.test.mjs` | 309/309 (243 + 66) |
| `node scripts/check-r1-baseline.mjs` | exit 0, `errors: []` |
| `node scripts/preflight.mjs` | exit 0 |
| qualification digest | `6972c311…f328`, unchanged |
| `offline-tests.mjs --profile ordinary` | exit 0; 47 selected / 9 excluded; 47/47 files PASS, 584/584 tests (518 + 66) |
| `offline-tests.mjs --profile stress --seed 172785` | **exit 1.** repeat-1, repeat-2, serial, random-172785, slow-fs-30, slow-fs-100 and mixed: 47/47 PASS, 584/584 each. stall-40: 46 PASS, `speech.test.mjs` TIMEOUT (SIGKILL at the 60 s file watchdog) |
| `git diff --check` | exit 0 |

**stall-40 timeout (MEASURED, not fixed).** `speech.test.mjs` and its imports are not in this diff. Run alone with the same fault env (`R1T_STALL_MS=40`, `R1T_STALL_EVERY_MS=50`, `--import ./test/helpers/faults.mjs`, `--test-timeout=10000`), it passed 122/122 in 65,628 ms, over the 60,000 ms watchdog. The prior record (D-80 session) has all eight stress profiles passing, so this machine was slower in this session. INFERENCE: this is host timing, not an R2-L1 regression. The watchdog is CI config and was not changed. The stress profile needs a re-run on a quieter host or hosted CI before it can be called PASS.

**Mutation check** (2026-10-30T14:13:50Z). A scratch harness removed one check at a time from `page-journal.mjs`, ran only the matching J-tests and restored the file; the SHA-256 after restore was unchanged (`4E66510E…9D28`). 32 mutations:

- **Detected (31):** complete, overflow, dropped, event_count, clock domain, event cap, byte cap, contiguous seq, event time, raw-focus refusal, event active, focusin target, five boolean flags, true modifier/repeat, non-empty key, keydown target, session/clock constant, no shrink, prefix identity, detached copy, cursor range, `createPageProvider` reuse, overlap refusal, both post-await failure checks together, source-error refusal, up-front sticky check, writer failure, page lane only, keys cursor filter, import scope, export surface.
- **Survived (1, disclosed):** the post-`source.read()` failure check removed **alone**. The post-validation check catches the same pending-read-after-overlap case, so the two are redundant for that window. Removing both is detected (J-N11). An overlap that lands only during the internal `provider.read()` await is covered by the second check alone. It has no deterministic test, because that await has no observable boundary outside the module.

Where `createPageProvider` would also refuse the same input (completeness, sequence, time, caps, shift type), removing the adapter check is detected through the refusal reason: the provider still refuses, but with `page provider: …` instead of the adapter's reason. That is defence in depth, not a gap.

## Review correction: asynchronous writer (ChatGPT independent review, MEDIUM)

**Defect.** `writer.append()` was not awaited. A writer returning a rejected promise let `snapshot()`/`keys()` return data without latching a failure. The rejection also went unhandled.

**Fix** (`src/r2/page-journal.mjs` only):
- The successful-evidence write is awaited inside the call, so `busy` stays set while it is pending. After it settles, the latch is re-checked before the view is returned.
- The diagnostic write is not awaited, so the refusal is never delayed. It is wrapped in `Promise.resolve(…).catch(…)` plus a sync `try`, and its failure is kept as the latched error's `cause`.
- Read count, overlap refusal, the five flags and the journal contract are unchanged.

**Tests** (5 added to `test/r2-page-provider.test.mjs`; each asserts no `unhandledRejection` where a writer can reject or stay pending):
- J-N8 ×2: an async-rejecting writer fails `snapshot`/`keys` with no data, latches for both views, performs no further reads, and keeps the diagnostic rejection as `cause`.
- J-P4: an async-resolving writer's entry is recorded before the view returns.
- J-N11 ×2: while the first call's async write is pending, an overlapping call in either order is refused without reading. Completing the write later cannot release the pending call's data.

**RED** (2026-10-30T14:38:04Z, adapter SHA-256 `4E66510E…9D28` before the fix): 113 tests, 108 pass, 5 fail. Both J-N8 cases failed with "view returned data despite a rejected write", and Node reported `unhandledRejection` ("async disk full"). J-P4 and both J-N11 cases failed because the view returned before the write settled.

**GREEN** (adapter SHA-256 `DA96E013…7547`):

| Command | Result |
|---|---|
| `node --test --test-timeout=20000 test/r2-page-provider.test.mjs` | 113/113 |
| `node --test --test-timeout=20000 test/r2*.test.mjs` | 314/314 (243 + 71) |
| `node scripts/check-r1-baseline.mjs` | exit 0, `errors: []` |
| `node scripts/preflight.mjs` | exit 0 |
| qualification digest | `6972c311…f328`, unchanged |
| `offline-tests.mjs --profile ordinary --out cache/r2-l1-fix` | exit 0; 47 selected / 9 excluded; 47/47 PASS, 589/589 |
| `offline-tests.mjs --profile stress --seed 172785 --out cache/r2-l1-fix` (14:41:18Z–14:54:11Z) | exit 0; all eight profiles (repeat-1, repeat-2, serial, random-172785, slow-fs-30, slow-fs-100, stall-40, mixed) 47/47 PASS, 589/589 each |

This stress run passed stall-40. That doesn't erase the earlier stall-40 TIMEOUT above: `speech.test.mjs` took 65,628 ms alone in that session, so it sits near the 60 s watchdog on this host. Logs from both runs are kept in `cache/r2-l1/` and `cache/r2-l1-fix/`, which are git-ignored.

**Mutation re-run** (2026-10-30T14:39:47Z, file restored, hash unchanged): 36 mutations, 34 detected. The three new writer mutations were all detected: removing the `await` (J-N8 async), the post-write latch check (J-N11 pending write), and the diagnostic `.catch` (J-N8 async). The two survivors are redundant subsets of the three latch checks after an await: the post-read check alone, and the post-read and post-validation checks together, which the post-write check now covers. Removing all three is detected (J-N11).

## Residual limitations

- Synthetic injected data only. Nothing shows that a real page records every event (G3). G2 and G4–G13 are untouched.
- Requiring all five flags is stricter than `page-provider.mjs`, whose check is unchanged. A real in-page script must record all five.
- A real browser reports NVDA's stop-speech `Control` keydown with `ctrlKey:true`, which this adapter (like `page-provider.mjs:36`) refuses. J-P2 only shows that `judgeKeys` ignores a `Control` keydown with all flags false. Treatment of the real chord is an R2-L2 decision.
- Overlap and sticky failure are per adapter instance. A caller that builds a new adapter over the same source starts with no history.
