# R1 hosted-run readiness checkpoint (Claude, independent)

Recorded: 2026-10-28T03:23:04Z · by: claude · scope: read-only review + offline checks; nothing dispatched, no NVDA, no desktop input, no Meta calls, no commits.

## 1. Verdict

- **NO-GO for dispatching `918c8f5` as published.** One defect is reproducible. Because of it, the workflow's `Offline tests` step fails, so the `R1` step never starts (B-01).
- **CONDITIONAL GO** for one scored hosted run on a commit that differs from `918c8f5` only by the one-function test-harness fix in `R1-readiness-T16-fix.patch`, plus any ledger records. It changes none of the 12 locked hashes, frozen gates, fixtures, predicates, ownership checks or thresholds. No other demonstrated blocker was found.

## 2. Identity recovered (MEASURED)

| Item | Value | Source |
|---|---|---|
| GitHub `refs/heads/main` | `918c8f518a702d46a47dc0e0e571b1810193f795` | `git ls-remote origin` |
| Reviewed source commit | `a628cd1f2c4528b5c71a625205a36bd136121bce` = parent of 918c8f5 | `git log -1 --format=%P 918c8f5` |
| 918c8f5 vs a628cd1 | 13 files, all under `docs/` (ledger, engineering, reviews); no `src/`, `scripts/`, `fixtures/`, `vendor/`, `test/` or workflow change | `git diff --stat a628cd1 918c8f5` |
| Lock check on exported 918c8f5 (CRLF checkout, as on a Windows runner) | 12 locked file/spec hashes, 10 dependency pins, vendor tree: 0 mismatches | `node scripts/r1.mjs --hashes` vs `fixtures/r1/lock.json` |
| Actions history | r1 workflow listed, "no runs yet" | public Actions page (WebFetch) |
| Engineering worktree | `C:/Users/<redacted>/.codex/worktrees/tabwise-r1-safety/app` at 918c8f5, clean before this report | `git status` |
| Original mixed checkout | `D:/Projects/Meta AI/app` at e09a068 with uncommitted work; not modified | `git status` |

## 3. Blocking defect B-01 (reproduced)

**Location:** `test/vendor.test.mjs:488-503` (T16 drift test) together with `.github/workflows/r1.yml:41-47` (read-only step, then `npm test`). Both were introduced in a628cd1. Test `test/speech.test.mjs:1541` pins that order ("read-only after installs, before tests").

**Mechanism:** the workflow sets `IsReadOnly` on every tracked file, including `vendor/**`, before `npm test`. T16 copies `vendor/` with `fs.cpSync`, which keeps the read-only attribute, then calls `fs.writeFileSync` on the copy. That throws `EPERM`. `npm test` exits 1. Under the default `success()` condition, the `R1` step is skipped. `Evidence contract` then prints "R1 did not start". The prior 191/191 runs (Codex: worktree and committed archive) did not apply the read-only attribute.

**Reproduction** (git archive of 918c8f5 under the scratchpad, local `node_modules` copy, workflow's read-only commands applied to the copy only):

| Condition | `npm test` / T16 |
|---|---|
| Full suite, all 105 tracked files read-only + Guidepup `lib/` read-only | 190 pass, **1 fail** (T16 `EPERM ... r1-vendor-drift-*\lib\delay.js`), exit 1 |
| A: T16 only, vendor read-only | fail (EPERM) |
| B: T16 only, read-only cleared on `vendor/` only, same bytes | pass |
| C: T16 only, read-only restored | fail (EPERM) |
| Candidate fix applied, all tracked files read-only | **191 pass, 0 fail, 0 cancelled**, exit 0 |

**Impact:** a dispatch of 918c8f5 spends one hosted job and yields no R1 evidence. It is not a scored run, because `npm run r1` never executes. The failure is deterministic: NTFS read-only blocks writes regardless of admin rights, so a redispatch fails the same way.

**Status update 2026-10-28T03:33:04Z:** the user approved the fix (D-47). Claude applied it uncommitted in this worktree. On a CRLF export of HEAD plus the fix, with the workflow read-only step applied to 405 files (all 105 tracked files + Guidepup `lib/`), `npm test` gives 191 pass, 0 fail, 0 cancelled. `r1.mjs --hashes` against `lock.json` gives 23 entries, 0 mismatches. The F-02 mutation harness was not re-run; the change touches only T16 scratch setup.

**Minimal fix:** `docs/reviews/R1-readiness-T16-fix.patch`. In T16's `fresh()`, clear the attribute on the temp copy (`chmodSync(p, 0o644)`) after `cpSync`. All five drift assertions are unchanged. Test hashes are not in `lock.json`, so no lock regeneration is needed. Alternative: run tests before the read-only step. That edits locked `r1.yml`, `lock.json`, the PLAN S8 text and test 1541, so it is strictly larger. **Governance:** AGENTS forbids editing a test "to make something pass". This edit repairs the test's own scratch setup and weakens no assertion, but it still needs the user's explicit approval and Codex's commit.

## 4. Confirmed facts vs unmeasured assumptions

| Topic | Status | Basis |
|---|---|---|
| No secrets, auth or paid service in any step | CONFIRMED (static) | `permissions: contents: read`, `persist-credentials: false`, no `secrets.*`; downloads come from npm, the public GitHub release `guidepup/nvda` (sha256-checked by `@guidepup/setup` against the manifest) and the Playwright CDN |
| `guidepup setup --ci` on Windows | CONFIRMED no-op | `@guidepup/setup/lib/commands/setup/index.js`: `case "win32": break` |
| `guidepup` bin resolves to `@guidepup/setup` 0.29.3 | CONFIRMED | `node_modules/@guidepup/setup/package.json` bin |
| Guidepup NVDA + Playwright on hosted `windows-2025` | CITED (upstream) | guidepup `playwright-nvda.yml` matrix includes windows-2025; runs 602-605 (Oct 25-26, 2026) succeeded. Their harness is not ours (see focus row) |
| VBScript/cscript on windows-2025 | INFERENCE, likely present | Server 2025 = build 26100; VBScript is a preinstalled, enabled-by-default FoD in phase 1 (secondary sources). Image README does not mention it. Upstream Guidepup `type()` uses cscript |
| Chromium PID = window owner | INFERENCE, likely | Playwright spawns the browser executable directly (`playwright-core/lib/coreBundle.js:10036`), no shell; headed uses `--no-startup-window` + CDP-created windows, which the browser process owns |
| NVDA PID = relay listener PID | INFERENCE, plausible | Portable `nvda.exe`; NVDA's `nvda.pyw` (master) has no handoff to `nvda_uiAccess.exe`; relay is NVDA 2026.2 core `remoteAccess/localRelay`. Bundle contains `nvda_uiAccess.exe`, so a handoff elsewhere is not excluded. Fails closed (setup-failed) if wrong |
| NVDA blocking dialogs | CONFIRMED absent in config | bundled `nvda.ini`: `showWelcomeDialogAtStartup = False`, `askedAllowUsageStats = True` |
| **Chromium acquires foreground with no raising (A4)** | **UNMEASURED: main risk** | Upstream Guidepup needs Alt+Escape cycling (up to 10), `page.bringToFront()` and a body click to focus the browser in CI (CITED, `guidepup-playwright/src/navigateNVDAtoWebContent.ts`). D-36 forbids all three. Win32 grants foreground only under listed conditions (CITED, SetForegroundWindow docs) |
| Interactive desktop on hosted runner | INFERENCE, likely | Upstream headed NVDA tests pass there |
| Timeouts | CONFIRMED adequate (static) | Worst case per attempt is about 30 s NVDA start + 25 s open + 10 s focus + 28 key actions × 8 s + cleanup ≈ 6.5 min, so about 20 min for 3 attempts, under the 30 min step and 45 min job limits (INFERENCE arithmetic from `steps.json`) |
| Evidence on step failure/cancel | CONFIRMED (static) | diagnostic, upload and contract steps are `if: always()`; journals are appended per step. A step timeout or cancel on Windows is a hard kill, so `summary.json` may be missing (UNMEASURED) |
| Test run leaves checkout clean | MEASURED | no extra files in the export after two full suites, so `repoSnapshot` will not refuse |

## 5. Residual risks: consequence depends on when they hit

| Risk | Where it surfaces | Scoring consequence |
|---|---|---|
| R-1 Chromium never foreground in attempt 1 | `setup-failed`, "foreground never our page within 10000 ms"; `focus-1.jsonl` records foreground PID and title | Before step 1: rerun allowed, but it will likely repeat. Needs a user decision (section 8) |
| **R-2 Foreground denied in attempt 2 or 3** | Same message in `focus-2/3.jsonl`. Attempt 1's injected input makes the foreground-lock conditions stricter for later launches (INFERENCE) | **Burns the scored run: FAIL**, no retry |
| R-3 NVDA launcher PID ≠ relay PID | "NVDA process/relay identity or reset evidence missing" | Attempt 1 is before step 1, so a rerun is allowed; the fix is a code question, not a retry |
| R-4 cscript missing or failing | Step 2 `type A`: nonzero exit is treated as possibly misdelivered | Scored FAIL |
| R-5 Speech predicate mismatch (synth/locale wording) | step records + raw logs | Scored FAIL; diagnose from raw speech, never relax predicates |
| R-6 Runner/network flake in installs or `npm test` | job log; R1 skipped | Not a run; one redispatch at the same SHA is reasonable (log it) |

I did not add a foreground-only probe workflow. It would be an unscored live rehearsal of part of R1, which the user excluded. It remains an option only if R-1 occurs.

## 6. Runbook for the one scored dispatch

**Commit criteria (verify before asking for dispatch approval):**
1. `git ls-remote origin refs/heads/main` returns the new SHA X. X's parent is 918c8f5, or X descends from it with only `test/vendor.test.mjs` and `docs/ledger|reviews` changes: `git diff --stat 918c8f5 X`.
2. On a fresh export of X with the workflow's read-only commands applied: `npm test` gives 191/191 and `node scripts/r1.mjs --hashes` gives 0 lock mismatches. PLAN `#F-02` section untouched.
3. The Actions page shows 0 queued/running r1 runs, and nobody will push to main during the run (AGENTS: no edits during a run).

**Dispatch (user only):** Actions → r1 → Run workflow → branch `main`, once. `workflow_dispatch` takes a ref, not a SHA. Record the run ID and confirm the run's commit = X. Do not click twice: with `concurrency: r1`, a second click queues a second run.

**What executes:** checkout → Node 24.22.1 → `npm ci --ignore-scripts` → setup (no-op) → NVDA asset download → Chromium download → read-only → `npm test` → `npm run r1` (30 min cap): CI/workflow/lock/vendor guards, foreground probe warm-up, then attempts 1-3. Each attempt: fresh NVDA (owned PID == relay PID, reset confirmed), headed Chromium at `?nonce=`, passive wait ≤10 s for foreground, NVDA+T nonce check, 10 frozen steps. Then diagnostic → upload → contract.

**Monitor:** watch the job log only. Do not cancel unless the job exceeds 45 min. A cancel turns a started run into PARTIAL or FAIL.

**Expected evidence:** artifact `r1-evidence-<run_id>-1` containing `_runner/job.json`, `_runner/nvda.log` (scrubbed, ≤1 MiB), and `r1-<UTC>/` with `summary.json`, `attempt-N.jsonl`, `raw-N.json`, `focus-N.jsonl`, `sends-N.jsonl`. Also save the full job log ("Download log archive"); it holds the per-attempt console lines and any refusal reason.

**Classification (from `summary.json` + job log, read together):**

| Observed | Class | Next |
|---|---|---|
| `result: PASS`, 3 attempts fresh + complete, `result_reasons: []`, contract OK | **PASS** | R1 `passes: true` with run ID; go to F-03/R2 |
| R1 skipped (install/test failure) or `Refusing to run` before an `r1-*` folder | **NOT RUN (setup)** | Fix the cause; redispatch is not a rerun of R1 |
| `rerun_allowed: true` (attempt 1 `setup-failed` before step 1) | **Setup failure** | One logged setup-only rerun, only after the cause is understood and addressed; never an automatic retry |
| Attempt 1 reached step 1 and anything is less than 3/3 | **FAIL** (or **PARTIAL** for a clean abort) | No retry. PLAN decision rule: user MCQ (another isolated host or reduced scope) |
| Any `misdelivered`, interference, evidence damage, missing summary | **FAIL** | Same; record reasons verbatim |

**Preserve:** download the artifact zip and log archive the same day. Record their sha256 (`certutil -hashfile <zip> SHA256`). Extract into `docs/evidence/r1/<run_id>/` unaltered. Append one `RUNS.md` row (run id, workflow run id, commit X, approving decision, result). Never delete or relabel. The artifact expires after 30 days, before R7 could finish late.

## 7. Critical path to submission (IST)

| When | Item | Depends on | Notes |
|---|---|---|---|
| 10-28 | B-01 fix approval → Codex commit → user push → checks in §6 → dispatch approval → run → classify | none | 10-28 EOD planning checkpoint (PLAN). Run time ≈ 15-25 min (INFERENCE) |
| 10-28 (parallel, offline) | F-03 spec: broker corrections + independent review; no paid call before approval | none | Hold all pushes during the run window |
| 10-28/29 (parallel, offline) | R2 fixtures: 3 healthy/broken pairs, labelled by someone other than the builder; axe-core baseline in headless Chromium (no NVDA, no desktop input) | none | New fixtures must stay withheld from prompt tuning |
| 10-29 | R2 speech capture on hosted runner (r2 workflow reusing the R1 harness), then Meta diagnosis ≤ $1.50 | R1 PASS, F-03 approved | PLAN kill check 10-29 |
| 10-30 | R3 patch + withheld-task rescue + wrong-patch rejection ≤ $0.50 | R2 | Ground-truth review per fixture (10-30 check) |
| 10-31 | R7 independent check; **claim scope freezes** to what was shown | R1-R3 | |
| 11-01 → 11-02 23:59 | Minimal UI/report viewer over real evidence; exact demo inputs through acceptance checks | claim scope | **Feature freeze 11-02 23:59** |
| 11-03 | Demo recording | freeze | Only measured numbers |
| 11-04 22:00 / 11-05 07:30 | Internal submit / **hard deadline** | | |

If R1 does not PASS today, R2 speech evidence slips. The 10-31 scope freeze then forces "reviewer assistance" scope, unless the user chooses another isolated host (e.g. a disposable VM, never the personal desktop).

## 8. Decisions this report asks of the user
1. Approve the B-01 test-harness fix (or the larger workflow-order alternative) for Codex to commit.
2. After §6 checks pass on the new SHA X, approve exactly one `workflow_dispatch` of r1.yml on main at X.
3. Accept knowingly that R-2 (foreground in attempts 2/3) and R-4 (cscript) can only be measured by the scored run, and that a failure there is a scored FAIL.

## Codex publication verification (D-47, 2026-10-28T03:43:52Z)

MEASURED offline: independently exported 918c8f5 with CRLF text and the workflow read-only settings. The original T16 fails with EPERM (one selected test, one failure). Overlaying only the approved test correction gives191 pass,0 fail,0 cancelled for the full suite; all405 protected source files remain read-only after it. A pure read-only audit, without invoking the R1 entry point, finds23 lock entries matching (12 file/spec hashes,10 dependency pins,one vendor tree); frozen gates match ca0c9feb568e7c9c4ea41832607f510af0cbf5548242adcd77f729e039af3362. All five drift assertions remain unchanged. Raw synthetic artifacts: `%TEMP%/tabwise-d47-76730bc4/`.

Privacy: one personal Windows profile path in this report was redacted. The user separately authorized Codex to commit/push exactly the six-file correction to main with subject `test(r1): T16 clears read-only on its temp vendor copy (B-01, D-47)`. This supersedes the earlier user-push handoff only. No Actions, R1, NVDA or Meta execution is authorized or performed. Post-publication SHA, parent, full-suite and lock checks will be reported against the published commit.
