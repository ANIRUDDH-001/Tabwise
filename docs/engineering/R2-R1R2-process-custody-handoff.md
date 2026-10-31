# R2 R-1/R-2: Windows process custody for R2 page children (handoff)

Base revision `3388107ab9f70037892f35d49109423501da5417` (PR #13 merged). Written 2026-10-31 (UTC), in a parallel workstream that did not touch O-10, O-11 or O-12 work. **R2 remains disabled/BLOCK.** No commit, push, branch, workflow, status, dependency, frozen R1 or vendor change was made. Nothing here is Windows-qualified: every result below comes from Linux, Node 22.23.4 and an in-memory fake OS.

## 1. What was wrong (CITED, base revision)

| ID | Finding | Source |
|---|---|---|
| R-2a | On timeout, output overflow or spawn error, the coordinator calls `child.kill('SIGKILL')`, which ends only the `--page` Node child. Chromium, NVDA, the PowerShell probes and their descendants are not addressed. | `scripts/tabwise/r2-run.mjs` `runPageChild` (`kill`) |
| R-2b | No custody at all on normal exit. An accepted page (`completed:true, nvda:'stopped'`) is followed by the next page with no OS check for leftover processes. | `runR2Pages` loop |
| R-2c | The coordinator has no signal or crash handler. A cancel (Ctrl-C/Ctrl-Break from the runner) ends it with the page child's tree unaddressed. | `scripts/tabwise-r2.mjs` `runAll` |
| R-1 | Acceptance of NVDA termination rests on the child's own `nvda:'stopped'` (`parseR2PageExit`). The vendored `quit.js` does wait for listener refusal and owned-process exit (`quit.js:19,38-43`), but that is the child observing itself. | `r2-run.mjs` `parseR2PageExit`; `r2-session.mjs` `nvda` state |

Context that bounds the risk (INFERENCE, to be measured on Windows): libuv puts every non-detached child into a job object with `KILL_ON_JOB_CLOSE` and `SILENT_BREAKAWAY_OK`. So when a Node process dies, its **direct** children die too, but **grandchildren do not** (they are never in that job). Playwright spawns Chromium non-detached on Windows (`node_modules/playwright-core/lib/coreBundle.js:10030`, CITED), and `start.js` spawns NVDA non-detached. Chromium renderers, GPU and crash handlers, any NVDA helper process, and `conhost.exe` instances are grandchildren of the page child.

Pre-existing, not changed: Playwright's own force-kill inside the page child runs `taskkill /pid <pid> /T /F` through a shell (`coreBundle.js:10113,10141-10149`, CITED). That path is reached only on Playwright's kill (for example `server.kill()` in `r2-session.mjs` after a failed launch). It works by ppid with no creation-time check. It is dependency code and out of scope; it is listed in §6.

## 2. Design (implemented)

New capability-free module `scripts/tabwise/r2-proctree.mjs`. The entry injects `spawn` and the environment. The module imports nothing.

**Identity.** A process is `(pid, creation time in µs since 1601)`. Snapshots come from `Win32_Process` through CIM, whose creation time has microsecond grain. Node truncates the FILETIME to µs, and the termination script compares within that grain.

**Attribution.** A process joins a page's tree only if:
- its ppid names a known identity created no later than it; and
- the current live holder of that pid is not a newer process that could be its real parent (pid reuse).

Known identities accumulate over time:
- an initial sample right after spawn;
- a periodic sample (`CUSTODY_SAMPLE_MS = 5000`);
- a bounded census before any kill (`CENSUS_MS = 5000`);
- every reap round.

So an orphan whose parent died after being sampled stays attributed. If the root itself was never observed, its creation time is bounded below by the coordinator's wall clock before spawn, minus `SPAWN_CLOCK_TOLERANCE_US` (1 s).

**Root adoption and pid reuse.** Windows frees a pid only when every handle to the process is closed, and the coordinator holds the child's handle until Node processes its `exit` (INFERENCE from Node/libuv behaviour; Windows qualification required). The coordinator calls `custody.exited()` from the child's `exit` and `close` events. After that:
- a process holding the child's pid is never adopted as the root;
- children of a never-observed root must be created no later than the observed exit.

This fix came from review during this task: the first draft could have adopted, and killed, an unrelated process that reused the pid of a fast-exiting child (PT-T6, PT-C8; mutations M15–M17).

**Termination.** Only tree members, parents first, never the coordinator, its parent, pid 0 or pid 4. Each one goes through `PROCESS_TERMINATE_PS`:
1. `GetProcessById`.
2. `$null=$p.Handle`, which holds a handle, so the pid cannot be reused while it is checked.
3. `StartTime` must match the recorded µs.
4. `Kill()` (single process), then `WaitForExit(2000)`.

The script is constant: targets arrive as JSON on stdin and nothing is interpolated. It is run with `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` (no PATH lookup), `shell:false`, `windowsHide`, a 15 s bound, an output cap, and refusal on any non-zero exit.

**Confirmation (R-1).** A termination report is advisory. A reap is `confirmed` only when a later, independent `Win32_Process` snapshot shows no tree member alive, within `REAP_ROUNDS = 4` snapshot→terminate rounds. The child's `nvda:'stopped'` is still required, but it is no longer sufficient.

**Process quiescence.** It is checked system-wide on the confirming snapshot:
- no image matching `^nvda(_[a-z0-9]+)?\.exe$`;
- no listener on 6837, the NVDA relay.

A foreign NVDA is reported and refused, never killed. This is **process** quiescence only. Stuck modifiers (P-7) and the broader P-9 physical-quiescence question remain open.

**Coordinator behaviour (`runR2Pages`, active only when `processes` is supplied; the entry always supplies it):**

| Situation | Outcome | `exit_code` | Sealable |
|---|---|---|---|
| Baseline before a launch shows NVDA, a 6837 listener, or the snapshot fails | `not-quiescent`; the page is **not launched**; the run stops | 129 (`EXIT.residue`) | yes |
| Run cancelled before the launch (checked after the baseline) | `cancelled`, not launched | 130 (`EXIT.cancelled`) | yes |
| Accepted child; confirmed reap; empty tree; quiescent | `accepted` + `custody` evidence | 0 | yes |
| Accepted child, but live descendants were found after exit, or the system is not quiescent | `process-residue` (descendants are reaped) | 129 | yes |
| Any ending (accepted, failed, crash or signal exit, timeout, overflow, spawn error, cancel) whose reap is not confirmed | `exit-unconfirmed`, with the prior outcome kept in `reason` | 127 | **no** (existing `r2RunSealable`) |
| Timeout, overflow, `error` or cancel | census (≤ 5 s), then `child.kill('SIGKILL')`, then the existing grace timer, then the reap | existing codes, or 130 | per the reap |
| SIGINT, SIGTERM, SIGBREAK or SIGHUP, or an uncaught error, in the coordinator | `AbortController.abort()`: the running child is cancelled and reaped; nothing more is launched | 130 | per the reap |

Behaviour without `processes` is unchanged: all 56 existing `r2-review` tests pass unmodified. The new EXIT codes 129 and 130 are safe integers, which `sealR2Run` already accepts (`r2-evidence.mjs:663`).

## 3. Changed-file inventory

| File | Change |
|---|---|
| `scripts/tabwise/r2-proctree.mjs` | **new**: snapshot parser, attribution, custody (`sample`, memoized `reap`), baseline, quiescence, PowerShell adapters |
| `scripts/tabwise/r2-run.mjs` | `runR2Pages`/`runPageChild`: optional `processes`, `signal`, `protect`, `sampleMs`, `censusMs`, `wallClock`; `withCustody`; `EXIT.residue`/`EXIT.cancelled`; constants. No new import other than `r2-proctree.mjs`; still free of `child_process` (S6-S2 passes) |
| `scripts/tabwise-r2.mjs` | `runAll` only: builds the tools before any directory or child; cancellation signals and crash handler; passes `processes`, `signal` and `protect: [process.pid, process.ppid]`. `runPage`, `--page` and `--check-only` are unchanged |
| `scripts/tabwise/r2-policy.mjs` | `R2_FILES` gains `scripts/tabwise/r2-proctree.mjs`, so the reviewed digest covers it. **One-line overlap point with O-10** (see §9) |
| `test/r2-proctree.test.mjs` | **new**: 28 offline tests (PT-*) |
| this document | **new** |

Not changed: `r2-session.mjs`, `r2-evidence.mjs`, `r2-compose.mjs`, `speech-payload.mjs`, `r2-status.json`, vendor, frozen R1, workflows, `ci/`, package files, ledgers and CODEMAP. Proposed ledger and CODEMAP text is in §10.

## 4. Tests (all offline; fake OS table and fake spawn)

| Area | Rows |
|---|---|
| Snapshot parsing (FILETIME→µs, strict schema, duplicate pid, type coercion) | PT-P1, PT-P2 |
| Attribution: ppid with creation order; earlier-holder orphan excluded; newer pid holder blocks links; sampled-parent orphan kept; unobserved root bounded by the spawn clock; protected pids; **no root adoption after the observed exit** (a reused pid and its children are left alone) | PT-T1–T6 |
| Reap: parents first, then confirmed by a later snapshot; termination failure → unconfirmed; a lying `terminated` report is not trusted; helper failures → unconfirmed; a transient failure recovers; repeated/concurrent cleanup memoized and non-overlapping, with no sampling after reap | PT-R1–R5 |
| Quiescence and baseline: NVDA image or listener refuses; a foreign NVDA is never terminated; a baseline snapshot failure refuses | PT-Q1, PT-Q2 |
| Coordinator: accepted with evidence; **orphans after `nvda:'stopped'`** → residue; timeout census then kill then reap; **unconfirmed termination → not sealable**; census catches unsampled descendants; crash/signal exit; **failure before startup** (gate exit 2, spawn error with no pid); baseline refusal launches nothing; cancellation during the run, before launch and during the baseline; option validation; reused pid after exit, including samples between `exit` and `close` | PT-C1–C8, PT-C3b |
| PowerShell adapter: `%SystemRoot%` path, argument vector, no shell, hidden; decoded `-EncodedCommand` equals the constant script; data on stdin only; SystemRoot, target, exit-code, timeout (helper killed) and row-mismatch refusals | PT-W1, PT-W2 |
| Static: no `taskkill`, `Stop-Process`, name-based, recursive or `$env:` usage; handle → StartTime → Kill order; exactly one `Kill(`; entry wiring; module capability-free; `R2_FILES`; status still BLOCK | PT-S1, PT-S2 |

**RED (MEASURED):** the module is absent at the base revision, so all PT rows fail to import. During authoring, PT-P2 failed against the first draft (`RegExp.test` coerced the numbers `now:5` and `created:1`). The parser was fixed with explicit string checks.

**Mutation testing (MEASURED, scratch copy, run_id `r1r2-mutations`):** 17 of 17 mutations killed.
- M1 creation order ignored;
- M2 pid-reuse holder ignored;
- M3 terminate report trusted;
- M4 residue ignored;
- M5 no census before kill;
- M6 no baseline;
- M7 protect list ignored;
- M8 listeners ignored;
- M9 children killed before parents;
- M10 reap not memoized;
- M11 unconfirmed treated as confirmed;
- M12 NVDA image ignored;
- M13 abort ignored;
- M14 confirmation without a post-kill snapshot;
- M15 root adopted after exit;
- M16 unobserved-root children not bounded by the exit;
- M17 `exit` listener removed.

Three mutations first **survived**:
- M5: a fast sampler masked the census;
- M7: a de-duplicated fixture made PT-T5 vacuous;
- M17: the first mutation hit only the redundant `close`-path call.

PT-C3b was added, PT-T5 corrected and PT-C8 extended (a sample between `exit` and `close`) before the final run.

## 5. Verification (MEASURED, Linux x64, Node v22.23.4; not the project's Node 24.22.1)

The results table is filled in §11 after the final run. Platform notes:
- `random-<seed>` in the stress profile cannot run on Node 22 (`bad option: --test-randomize`); this is the same as earlier handoffs (§8.1 of the S5b/S6 handoff).
- The ordinary and stress profiles refuse the real workspace with `OFFLINE_REFUSAL: unclassified test files: r2-proctree.test.mjs` (exit 2). This is the existing fail-closed inventory rule, and the inventory entry is gated (§8). The profiles were therefore run in a scratch copy with exactly the proposed 4-line `ci/offline-tests.json` entry applied.

## 6. Independent review of termination bypasses

Each row gives the vector and its disposition.

1. **PID reuse between snapshot and kill.** Closed by a handle-pinned creation-time check in the kill script (INFERENCE from .NET Framework `Process` handle caching; **Windows qualification required**). A mismatch is reported as `mismatch` and the process is not killed.
2. **PID reuse of a dead parent.** The newer-holder rule (PT-T2). Residual: if the newer holder has *also* exited, a child of that holder created after our known identity could be misattributed. That needs two reuses of the same pid inside one page window. INFERENCE: improbable. Disclosed.
3. **Unobserved root.** The spawn-clock bound (−1 s) below and the observed-exit bound above (PT-T4, PT-T6). After `exit`, the root is never adopted (PT-T6, PT-C8). Residual: an unrelated orphan with ppid equal to our child's pid, created in the second before spawn, would be attributed. A clock step (NTP) during the run can widen or narrow the bounds.
4. **Intermediate parent dies between samples** (short-lived launcher, then a long-lived grandchild). Unattributed. Mitigations:
   - the 5 s sampling and the pre-kill census;
   - the system-wide NVDA image and listener check, which catches any surviving NVDA however it was spawned.

   A surviving non-NVDA grandchild with a broken chain (for example a Chromium utility process) is **not detected**. A Windows job object owned by the coordinator would close this (see §8.2).
5. **Parent spoofing, out-of-tree launches** (COM/DCOM servers, `ShellExecute` through explorer, services, scheduled tasks). Not attributable by ppid. Only NVDA is covered, by the image check.
6. **Breakaway.** Processes that break away from jobs are irrelevant here: attribution is by ppid, not by job.
7. **Direct children killed by libuv job closure at page-child exit** (INFERENCE). This *helps* termination but *hides* evidence: an NVDA still alive at the instant the child exits would be killed silently, and the post-exit reap would see nothing. R-1 is therefore only partly closed. The coordinator corroborates that nothing remains, not *who* stopped NVDA. A result-time census (on receipt of the child's result line, before close) was considered and left out because it races the child's exit. Owner decision (§8.3).
8. **Coordinator hard-killed** (TerminateProcess by the runner, a job timeout). No handler runs and no reap happens. The page child dies via the coordinator's libuv job (INFERENCE); its grandchildren may survive. Mitigation belongs in S7: an `if: always()` read-only quiescence step (§8.1).
9. **Helper hijack.** PowerShell comes from `%SystemRoot%`, not PATH. `SystemRoot` comes from the coordinator's own environment (runner-controlled) and is validated as `X:\...` with no quotes. The scripts are constant; the stdin JSON holds only validated integers and digit strings.
10. **Killing unrelated processes.**
    - Only attributed members are targeted.
    - The coordinator, its parent, 0 and 4 are excluded even if a ppid link names them (PT-T5).
    - A foreign NVDA is never killed (PT-Q1).
    - There is no name-based or tree-wide kill (PT-S1).
11. **Permissions.** No elevation and no new privilege: `OpenProcess`/`TerminateProcess` on same-user processes. A denied handle reports `error`, the identity stays alive, and the reap is **unconfirmed**, which fails closed.
12. **Snapshot integrity.** A CIM enumeration is not atomic. A duplicate pid in one snapshot is refused and the round retried. An empty process list is refused. A snapshot failure is never treated as empty (PT-R4).
13. **Load and timing.** Sampling spawns about one hidden PowerShell every 5 s while NVDA runs. This could affect A4 foreground timing (P-4) or speech latency (P-6). It is not measured, and must be measured in the dress rehearsal.
14. **Pre-existing Playwright `taskkill /T /F`** inside the page child (dependency code, through a shell, by ppid with no creation-time check). Unchanged and not addressed here. Recorded for the independent reviewer.
15. **Worst-case time added per page:**
    - baseline ≤ 15 s;
    - census ≤ 5 s;
    - reap ≤ 4 × (15 + 15) s = 120 s.

    S7's job timeout must cover pages × (720 + 140) s.

## 7. Platform-dependent coverage

| Claim | Linux offline evidence | Needs Windows-hosted evidence |
|---|---|---|
| Attribution, ordering, memoization, outcome mapping, fail-closed paths | MEASURED (fake OS table) | — |
| PowerShell invocation shape and constant scripts | MEASURED (fake spawn; decoded `-EncodedCommand`) | — |
| `PROCESS_SNAPSHOT_PS` runs on Windows PowerShell 5.1 and returns schema-valid JSON, including 1-row and 0-listener arrays | **not executed** | yes |
| CIM `CreationDate` µs equals `Process.StartTime` truncated to µs; UTC conversion correct | **not executed** | yes |
| Handle pinning prevents pid reuse during the check; `Kill()` on Chromium sandboxed and NVDA processes succeeds without elevation | **not executed** | yes |
| libuv job closure kills direct children at Node exit; grandchildren survive | INFERENCE | yes |
| NVDA images on the hosted image match `^nvda(_[a-z0-9]+)?\.exe$` | INFERENCE | yes |
| Ctrl-C/Ctrl-Break reaches the coordinator as SIGINT/SIGBREAK when the runner cancels | INFERENCE | yes |
| Sampling load does not perturb A4 or speech | **not measured** | yes |

**No Windows qualification is claimed.**

## 8. Recommendations and owner decisions

### 8.1 S7 (`.github/workflows/tabwise-r2.yml`; do not draft until O-6, with O-10 settled)

- Run the custody tools before and after the run step:
  - a read-only **pre-run quiescence** step (no NVDA, no 6837 listener);
  - an `if: always()` **post-run quiescence** step that records a `Win32_Process` snapshot into `RUNNER_TEMP` evidence.

  Neither step kills anything; a non-quiescent result fails the job. This covers vector 8.
- Job `timeout-minutes` ≥ pages × 860 s plus the setup margin. `cancel-in-progress: false`, as in `r1.yml`.
- **Upload** the coordinator's run summary (which now carries the per-page `custody` evidence) alongside the sealed run. **Attest** only after `--run` exits 0 (`if: success()`), per O-10 §9. The custody evidence is printed in the summary, not inside the sealed run manifest. Making it part of the attested subject is an O-10 integration choice (§8.4).
- No new action or permission is needed for custody. PowerShell is already on the image.

### 8.2 Job objects (stronger R-2 closure; owner decision)

A coordinator-owned job object, created through PowerShell `Add-Type` or a reviewed native helper, would capture every descendant regardless of ppid chains. A new process capability: it requires a long-lived helper holding the job handle, plus nested-job measurement with libuv's and Chromium's own jobs. Recommended as a follow-up **only if** the dress rehearsal shows unattributed survivors.

### 8.3 Result-time census (narrows R-1 vector 7; owner decision)

On receipt of the child's result line, take one census before `close`. If NVDA is in the tree, refuse the page. This races the child's exit, so it can only add refusals. Cheap; not implemented because its value depends on measured exit timing.

### 8.4 O-10 integration

When the O-10 subject or session files land:
- add `custody` (root identity, confirmed, quiescent, residue count, final snapshot `now`) per page to the attestation subject, or to the proposed `session-<id>.json` sibling;
- keep it outside the S3 page directory. The S3 coverage rule is unaffected.

The coordinator must still refuse to attest a run in which any page is not `confirmed && quiescent`.

### 8.5 O-11 (arm-input custody)

Independent of process custody. Recommendation unchanged from S5b/S6 handoff §10 (option A: a separately sealed sibling `arm-inputs/`). Add one rule: arm inputs are built only for pages whose coordinator outcome was `accepted` with `custody.confirmed && custody.quiescent`. An `arm-inputs` entry for a `process-residue` or `exit-unconfirmed` page has `model_eligible:false` with that reason. Implement after O-10 and O-12 merge, since its verifier reads `verifyR2Run` and the C-3 redaction version.

### 8.6 Gated item requiring authorization (not applied)

`ci/offline-tests.json` needs one entry for `r2-proctree.test.mjs` (kind `offline`, the standard reason text). This is CI configuration (AGENTS.md hard gate; design O-5). Without it, both offline profiles refuse the workspace (exit 2) by design. The alternative, if not approved: move the 26 tests into `test/r2-review.test.mjs` (no inventory change; higher merge-conflict risk with O-10/O-12 test additions).

## 9. Owner application instructions

1. Wait for local O-12/O-10 to finish and be committed.
2. From the repo root: `git apply --check r1r2-process-custody.patch`, then `git apply r1r2-process-custody.patch`. Expected overlaps:
   - **`scripts/tabwise/r2-policy.mjs` `R2_FILES`.** If O-10 added files, keep both sets and keep the array sorted. `scripts/tabwise/r2-proctree.mjs` sorts between `r2-policy.mjs` and `r2-run.mjs`.
   - **`scripts/tabwise-r2.mjs` `runAll`.** If O-10 changed the sealing or attestation lines, the custody hunk touches only the block from `const runDir = ...` through the `runR2Pages(...)` call and its `finally`. Re-apply it by hand there.
   - `r2-run.mjs` is untouched by O-10/O-12 as far as this workstream knows. `git apply --3way` resolves context drift.
3. If authorized, apply `ci-offline-tests-entry.patch` (gated, §8.6).
4. Apply the ledger text in §10 (STATE, LOG, DECISIONS, CODEMAP) after the O-10/O-12 ledger updates, so that STATE.md stays a single handoff.
5. Re-run on Windows, Node 24.22.1:

   ```powershell
   node --test --test-timeout=20000 test/r2-proctree.test.mjs test/r2-review.test.mjs
   node --test --test-timeout=20000 test/r2*.test.mjs
   node scripts/offline-tests.mjs --profile ordinary --seed 1
   node scripts/offline-tests.mjs --profile stress --seed 426136
   node scripts/check-r1-baseline.mjs
   git diff --check
   ```
6. Codex (the other agent) reviews the diff before commit (PROTOCOLS §4).

   Suggested commit: `feat(r2): coordinator-held process custody for page children (R-1/R-2)`, citing F-03/R2-L2 and the commands above. The R2 digest changes, which does not matter while the status is BLOCK.

### 9.1 Windows-hosted qualification still required (before any status change)

1. Execute both PowerShell scripts on the hosted image (`win25-vs2026`, PowerShell 5.1), read-only snapshot first. Check the JSON shape, 1-element arrays and µs equality against `Process.StartTime`.
2. A controlled fixture: a Node child that spawns a grandchild tree (a no-op process plus a `ping -n` style sleeper), then a timeout, a crash, a normal exit with an orphan, and a cancel. Check attribution, a confirmed reap, no unrelated process touched, and a `pending` or `mismatch` path on a pinned pid.
3. Measure libuv job closure (direct child dies with its parent; grandchild survives) to settle vector 7 and vector 8.
4. A dress rehearsal with NVDA: custody evidence per page; NVDA image names; listener disappearance; sampling impact on P-4 and P-6; time added per page.
5. Cancel a hosted run mid-page: check that SIGINT/SIGBREAK delivery reaches the coordinator, and the post-run `always()` quiescence step.

None of these is authorized by this workstream. Each needs its own owner approval (live NVDA, browser, hosted dispatch).

## 10. Proposed ledger text (owner applies after O-10/O-12)

- **CODEMAP row:** `scripts/tabwise/r2-proctree.mjs` | R-1/R-2 coordinator-held process custody: `Win32_Process` snapshots (pid + µs creation time), ppid/creation-order attribution with pid-reuse refusal, census before kill, handle-pinned creation-checked termination parents-first, confirmation only by a later OS snapshot, system-wide NVDA image/listener quiescence, baseline before launch; capability-free (spawn and env injected by the entry) | `windowsProcessTools`, `createPageCustody`, `processBaseline`, `parseProcessSnapshot`, `quiescenceOf` | `test/r2-proctree.test.mjs` (PT-*).
- **DECISIONS:** record the owner's mission text for this workstream (R-1/R-2 parallel workstream, 2026-10-31) in the owner's own words, and the answer on §8.6.
- **LOG.jsonl (one line):** milestone `r2-r1r2-custody-offline`, with the verification commands and counts from §11.
- **STATE.md:** Now: R-1/R-2 custody patch ready, offline only, not Windows-qualified. Next: §9 steps. Blocked: CI inventory entry (§8.6) and Windows qualification (§9.1).

## 11. Final results (MEASURED, run_id `r1r2-custody-final`, Linux x64, Node v22.23.4, recorded 2026-10-31T05:05:25Z)

| Command | Result |
|---|---|
| `node --test --test-timeout=20000 test/r2-proctree.test.mjs test/r2-review.test.mjs` | 84/84 (28 new + 56 existing, unmodified) |
| `node --test --test-timeout=20000 test/r2*.test.mjs` | 627/627, exit 0 (599 before this change + 28) |
| `node scripts/check-r1-baseline.mjs` | `ok:true`, `errors:[]` |
| `git diff --check`; trailing-whitespace grep of the new files | exit 0; none |
| `node scripts/offline-tests.mjs --profile ordinary --seed 1` (real workspace) | **exit 2, `OFFLINE_REFUSAL: unclassified test files: r2-proctree.test.mjs`**: expected fail-closed until §8.6 |
| same, in a scratch copy with only the §8.6 entry added | exit 0; 49/49 files; 902/902 tests (874 + 28) |
| `node scripts/offline-tests.mjs --profile stress --seed 426136` (same scratch copy) | exit 1. repeat-1, repeat-2, serial, slow-fs-30, slow-fs-100, stall-40 and mixed: each 49/49 files, 902/902 tests. random-426136: 0/49, every file `bad option: --test-randomize` (Node 22 lacks the flag; not a test result). **Needs Node 24.22.1** |
| `TABWISE_R2_ENABLED=true node scripts/tabwise-r2.mjs --check-only` and `--run` (no inherited hooks) | exit 2, `R2 refused: BLOCK: R2 status is disabled/BLOCK` |
| Mutation run (scratch copy) | 17/17 killed |
| Patch round trip: `git apply` on a pristine `git archive 3388107` export | clean; all six files byte-identical |

Harness note: an earlier scratch run with a *symlinked* `node_modules` failed `vendor.test.mjs` T11 because of path realisation. With a real copy it passes, and it passes 26/26 in the workspace. Runs on superseded sources were discarded, not counted.

SHA-256 of the final files (MEASURED):
- `scripts/tabwise-r2.mjs`: `0658fd2eed98c13fe5d8ee4f2df08db6e0cc795639ee4b1ca7e43a1d49e2cfe1`
- `scripts/tabwise/r2-policy.mjs`: `28c2a17ac3d96f510d82963700377a587681c1eecc3d1dfbd5160ade4c371025`
- `scripts/tabwise/r2-run.mjs`: `5fd86326161db201ad985de60aaab625d1b2281b248af254e9f03ebae8b2481e`
- `scripts/tabwise/r2-proctree.mjs`: `c7596377aef8c754ed0f7e216007ae79b7ab3d11134bc06fa64e487761fd3ec0`
- `test/r2-proctree.test.mjs`: `95692e247458da37e7ab7d24ffef453d5e331836d0670f2ecb1c20049c164874`

## 12. Independent review addendum (Claude, Windows 11 local, Node 24.22.1, 2026-10-31T06:47:15Z)

Sections 1-11 above are the Cloud record and are kept as written. This section is the independent review on the owner's Windows machine, after the owner applied this patch and the §8.6 CI inventory entry. **R2 remains disabled/BLOCK.** Nothing here is hosted-image (`windows-2025`) qualification.

### 12.1 Defect found and fixed (owner answer: "Fix now, test-first")

**CR-1 sampling backlog.** `sample()` queued every call behind the snapshot in flight. When a snapshot took longer than `CUSTODY_SAMPLE_MS`, the 5 s interval built a queue. Both the pre-kill census (whose 5 s race then always lost) and `reap()` (chained on the queue) waited behind it.
- MEASURED, fake OS (scratch script, 60 ms snapshots, 10 ms interval, 600 ms child): 29 snapshots ran after the child exited, before the reap. Settle came 2000 ms after the exit.
- INFERENCE, scaled to real values: with hung CIM (15 s helper timeouts), a 720 s page leaves about 96 queued snapshots, so the reap is delayed by about 24 min, past the S7 step timeout.
- **Fix** (`r2-proctree.mjs` `sample`): at most one snapshot in flight and one queued. Later callers share the queued one, which starts after their call, so the census still sees a fresh tree.
- **Verification:** PT-R6 RED, then GREEN. After the fix, the same scratch measurement shows 3 snapshots after exit and settle 233 ms after the exit. Mutation M18 (coalescing removed) is killed by PT-R6.
- **Disclosed test-authoring corrections, made before PT-R6 first passed:** (a) the test now waits one `setImmediate` so the first sample is really in flight; (b) the reap expectation counts the live root's terminate round plus the confirming snapshot (2 + 2).

### 12.2 Safe local Windows measurements (no process outside the fixture was terminated, NVDA not launched)

| Check | Result |
|---|---|
| `PROCESS_SNAPSHOT_PS` through `windowsProcessTools`, 5 runs | MEASURED: 351 processes; 1107/968/975/983/973 ms; 0 null creation times; quiescent, no 6837 listener, no NVDA |
| CIM creation µs vs `Process.StartTime.ToFileTimeUtc()` | MEASURED: 202 of 202 readable processes within the `[0,10)` 100-ns grain that `PROCESS_TERMINATE_PS` requires; 0 outside |
| libuv job closure (fixture: a Node "middle" spawns `ping` directly and `cmd /c ping`, then exits by itself; every ping ends by itself) | MEASURED: the direct children (`PING.EXE`, `cmd.exe`, `conhost.exe`) died with the middle; the grandchild `PING.EXE` and its `conhost.exe` were still alive 1 s later. This confirms vectors 7 and 8 locally: direct children die with their Node parent, and grandchildren survive |
| Termination script on real processes | **not run** (the kill path was not exercised on Windows) |

### 12.3 Review verdicts (INFERENCE unless marked)

1. **Ownership and attribution.**
   - Identity, creation order, the newer-holder rule and the protect list are sound against the fake-OS rows and mutations M1-M17.
   - Residual (vector 2, disclosed): a known parent that is dead and has no current holder lets a child of an unobserved second holder of that pid be attributed. That needs a pid reused twice inside one 5 s window, with the intermediate holder dead before the next sample.
   - The kill stays creation-checked, so the harm is bounded to that one misattributed process. The process could still be unrelated, so this is an **owner decision**, not a fix here. A stricter rule (attribute through a dead parent only when the child was born before the parent was last seen alive) would also lose real orphans.
2. **PID reuse at kill time.** The ordering handle, then `StartTime`, then `Kill()` is correct for .NET Framework `Process` handle caching (INFERENCE). The µs grain holds locally (12.2). Pinning on the hosted image is still unmeasured.
3. **Cancellation.**
   - `AbortSignal`, crash handler, census, kill and reap are correct offline.
   - Windows gap: on a runner cancel, Ctrl-C goes to every process on the console, including the PowerShell helpers, and the runner's grace is short (INFERENCE: about 7.5 s for Ctrl-C, then Ctrl-Break, then a kill). The reap then usually cannot finish; S7's `always()` read-only step must cover this.
   - The page child also receives Ctrl-C and starts its own NVDA quit. The coordinator kills it at most 5 s later, which may interrupt `quit.js` (P-7).
4. **Termination safety.**
   - Only attributed identities are targeted; 0, 4, the coordinator and its parent are never targeted; nothing is killed by name or tree. Confirmed by reading the source and PT-S1.
   - A process with a higher integrity level (for example a `uiAccess` NVDA build) may refuse `PROCESS_ALL_ACCESS` from a medium-integrity helper. The result is `error`, so the reap is unconfirmed (fail closed). The hosted runner is administrator, so this needs measuring there.
5. **Unobserved grandchildren.** Only a broken chain plus a non-NVDA image escapes detection (vector 4). The libuv measurement (12.2) shows such survivors are real for non-Node intermediates such as `cmd.exe`. A job object (§8.2) remains the stronger closure.
6. **Coordinator contract.**
   - Without `processes`, behaviour is unchanged (56 r2-review rows).
   - With `processes`, the outcome mapping in §2 matches the code: 129 and 130 are sealable; `exit-unconfirmed` is not.
   - `withCustody` never throws on the fallback custody object, and `reap()` never rejects, so `settle` always resolves.
7. **Document corrections to §§1-11.**
   - §8.6 says 26 tests; the file had 28 (29 with PT-R6).
   - §3's "not changed: `ci/`" predates the owner applying §8.6.
   - §6.15's 860 s per page omits `KILL_GRACE_MS` (10 s) and, before CR-1, an unbounded queue wait. With CR-1 the queue wait is at most 2 × 15 s. Worst case is about 720 + 10 + 15 + 5 + 30 + 120 = 900 s per page.

### 12.4 Overlap with committed S7 `09cfd1f` (both based on `8dac551`; trial merge in scratch only, no branch touched)

- Overlapping files: `scripts/tabwise-r2.mjs`, `scripts/tabwise/r2-run.mjs`, `scripts/tabwise/r2-policy.mjs`. `ci/offline-tests.json` is untouched by S7.
- `git merge-file` (LF-normalized copies) gives 4 conflict hunks, all of them keep-both:
  - the entry's import line (add the proctree import before S7's widened `r2-run` import);
  - `r2-run.mjs`'s `r2-evidence` import (S7 adds `verifyR2Run`; custody adds the next line);
  - `r2-run.mjs` between `r2RunSealable` and `runPageChild` (S7's `r2RunInputs`/`r2VerifyRun`/`r2VerifyOutcome`, then custody's `withCustody` and the new `runPageChild` signature);
  - `R2_FILES` (keep `R2_WORKFLOW` first and insert `r2-proctree.mjs`).
- The `runAll` custody hunk merges cleanly next to S7's `r2RunInputs` change.
- MEASURED: the resolved combination (S7 tree + custody files + CI entry) passes `node --test --test-timeout=20000 test/r2*.test.mjs`; the counts are recorded in LOG.jsonl.

### 12.5 S7 workflow changes needed for custody (reported, not implemented; the workflow is S7 reviewed scope)

1. **Timeouts.** Step `R2 run` has `timeout-minutes: 40` and the job has 60. Worst case with custody is about 900 s per page, so the step needs ≥ pages × 15 min plus margin, and the job needs the step plus setup. Set these when the A-5 plan fixes the page count.
2. **Post-run quiescence.** Add an `if: always()` read-only step after `R2 run`: `Win32_Process` NVDA images and a 6837 listener into `RUNNER_TEMP` evidence; it kills nothing and fails the job when the system is not quiescent. Constraints from S7-W10/W14:
   - no `TABWISE_R2_ENABLED` (exactly three steps carry it);
   - no new `-cnotmatch '^…\z'` unless W14's count of 5 is updated;
   - inline `pwsh` or a new read-only script, not `r2-run.mjs`.

   A pre-run step is optional, because the coordinator already takes a baseline before every page.
3. **Upload custody evidence.** The run summary carrying the per-page `custody` is written to `RUNNER_TEMP/tabwise-r2-summary.json`, which is outside the uploaded `RUNNER_TEMP/tabwise-r2/`. Write it inside `tabwise-r2/` (beside, not in, the sealed run directory) or add a second upload path.
4. **Header comment.** Replace "Windows process-tree cleanup is owned by Cloud Claude and is not designed here" with a pointer to this handoff.
5. **No change needed:** permissions, actions, the attest gating, and `npm test` (it runs `r2-proctree.test.mjs` under the 10 s per-test timeout; the slowest PT row took 413 ms).
