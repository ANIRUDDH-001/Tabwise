# PLAN — the day plan and one section per approved task (format: PROTOCOLS §2, §3)

Any agent resumes a task from its section alone, without the chat. Copy the approved spec in verbatim; keep each task to 25 lines or fewer.

Product (provisional, D22): **sharpened C3**, accessibility regression testing for dynamic web forms and dialogs. A journey goes in. We capture real NVDA speech, focus and app events as one timeline, locate the barrier, propose a source patch, rerun, and keep the run as a regression test. Wrong patches are negative controls. Source: research 13 §4 and §8, plus the user's pasted refinement (LEDGER, 2026-10-27).

## Pre-registered Day-1 tests (frozen D23; source 13 §8; do not renegotiate, PROTOCOLS §6)
| Test | Hours / credit cap | What can pass today | What must not be claimed |
|---|---|---|---|
| R0 prerequisites | 0.5 h / $0 | Installed versions recorded (NVDA, Guidepup, Node, Playwright, axe-core). Fixture rights: our own pages only. Broker reservation and payload logging are working before any metered call | That a dependency works without running it |
| R1 real speech | 1.5 h / $0 | NVDA + Guidepup on this Windows 11 Home laptop, a local page, a keyboard-only 10-step task. A complete fresh speech log in 3 of 3 reset attempts. No screenshots or DOM in the speech-agent payload | Reliable navigation of unseen sites |
| R2 causal smoke | 2 h / $1.50 | Healthy/broken pairs, labelled by someone other than the runner: silent validation error, focus lost after a dialog closes, an unannounced update. Same Spark version as visual and speech control; axe-core baseline. At least one barrier that axe misses is located correctly, and no barrier is claimed on a healthy page | General recall or precision; certified accessibility |
| R3 repair | 0.5 h / $0.50 | A human-reviewed patch rescues the withheld task on rerun. A deliberately wrong patch is not marked solved | A verified automatic repair product from one success |
| R7 independent check | 1 h / $0 | Someone who did not run the tests checks the results without tuning them (the user assigns who). Failures and abstentions are recorded | External user validation |
| Reserve | 0.25 h / $0.50 | Setup and retry only | Hiding a failed gate |

Totals: 5.75 h and $2.50. Every run is logged, aborts included. Once a failure has been inspected and a prompt tuned, that fixture is development data, and new withheld fixtures are needed. Keyboard-only operation is tested directly; a mouse replay is not evidence of keyboard access.

## Decision rule (13 §8, adapted to one candidate)
| Observation | Decision |
|---|---|
| Rights, eligibility or safety boundary breached | FAIL for that scope; scores cannot override it |
| A test cannot run, or would exceed its cap | NOT RUN / INSUFFICIENT EVIDENCE: neither FAIL nor PASS |
| Some essential properties pass | PARTIAL; user-assisted and automatic routes named separately |
| R1–R3 pass and R7 agrees | C3 provisionally confirmed; the dated kill checks below apply |
| R1 fails (no speech capture on this host) | C3 as specified stops. User MCQ: another host, or reduced scope. Guidepup's virtual reader is not NVDA evidence (13 §10) |
| R2 or R3 fails | Drop the causal or repair claim, or stop. Any fallback (e.g. C4) needs its own approved test; nothing inherits a pass |

## Dated kill checks (IST; budgets approved separately)
| Date | Required evidence |
|---|---|
| 2026-10-28 end of day | Planning checkpoint: PASS / FAIL / NOT RUN / PARTIAL per test, versions, fixture hashes, measured cost. The user may choose a risk knowingly; time passing is not consent |
| 2026-10-29 | New withheld flows with same-model controls, independent outcome and localization, mandatory fix and retest. If the controls explain the divergence, or fixes break healthy tasks, remove the causal or repair claim |
| 2026-10-30 | Ground-truth and negative-control review per fixture |
| 2026-10-31 | Claim scope freezes to what has been shown; otherwise the product becomes explicit reviewer assistance |
| 2026-11-02 23:59 | Exact demo inputs run through acceptance checks; replay and known misses disclosed |

## Day plan
| Day | Date (IST) | Goal | Tasks |
|---|---|---|---|
| 1 | 2026-10-27 | Governance in `app/` (D24) → R0, R1 → R2, R3 → R7 → record results | R0–R3, R7 |
| 2–9 | 2026-10-28 → 11-04 | Filled in after the Oct 28 checkpoint. Feature freeze 2026-11-02 23:59 IST; internal submit 2026-11-04 22:00 IST | — |

The user divides work within the team (D26). This plan lists work for "us", with no per-developer split.

## Tasks
<!-- One section per approved spec:
### F-xx <title> — status: approved | in progress | done | blocked
Spec: (verbatim from the MCQ answer: ID, Goal, Files, Acceptance, Cost ceiling, Out of scope, Rollback)
Approved: D-xx, <UTC timestamp>
Owner: agent claude|codex · Branch: feat/<id>-<slug>
Progress: what is done, with LOG.jsonl timestamps
Next step: the single next action
-->

### F-01 budget broker + R0 prerequisites — status: done
Spec (verbatim from the D-28 preview):
```
ID: F-01 budget broker + R0 prerequisites
Goal: every Meta call is reserved, capped at $100 total and
  logged before it runs; R1-R3 tools installed, versions recorded.
Files: package.json, package-lock.json, .env.example,
  src/budget/prices.mjs, src/budget/broker.mjs,
  src/meta/client.mjs (Responses API, api.meta.ai/v1),
  scripts/spend.mjs, scripts/versions.mjs,
  test/broker.test.mjs, test/client.test.mjs,
  docs/ledger/{PROVENANCE,CODEMAP,STATE,LOG,FEATURES},
  AGENTS.md command table.
Installs (exact pins, licences recorded):
  @guidepup/guidepup, @guidepup/setup,
  @playwright/test + Chromium, @axe-core/playwright.
  No other deps: SQLite = node:sqlite, tests = node:test
  (Node 24.22.1 present). Plain JS modules, npm.
YOU run once: npx @guidepup/setup
  (changes Windows settings + downloads NVDA; Claude
  may not change system settings.)
Prices (dev.meta.ai pricing page, read 2026-10-27):
  Spark 1.3 Standard $1.25 in / $4.25 out per 1M
  Spark 1.3 Contributor $0.10 / $0.20 per 1M
  Image input price not listed -> fixed worst-case bound
  per image, checked against the first real usage.
Acceptance:
 1 node --test test/  -> all pass, incl.: refuse over cap;
   refuse if no max_output_tokens; settle releases;
   crash keeps reservation; 2 concurrent callers can't
   overspend; COSTS.jsonl schema; API key never logged.
 2 node scripts/spend.mjs -> $0.00 spent, cap $100
 3 node scripts/versions.mjs -> all versions; NVDA found
 4 git check-ignore .env -> ignored
Cost: $0 credit. ~1.5 h F-01 + 0.5 h R0.
Out of scope: live API calls, NVDA runs (R1), fixtures (R2).
Rollback: delete new files; npm uninstall;
  remove %LOCALAPPDATA%\guidepup.
```
Approved: D-28, D-29 (Contributor on fixtures), D-30 (current branch), 2026-10-27T05:27:59Z
Owner: agent claude · Branch: current (`main`), the user commits
Progress (LOG.jsonl 2026-10-27T05:36:08Z): deps pinned and installed; broker + client written test-first; acceptance 1, 2, 4 pass; 3 runs, NVDA not found. Deviation: Node 24 `node --test test/` fails ("Cannot find module"), so the command is `npm test` = `node --test "test/*.test.mjs"`
Correction (2026-10-27T05:51:35Z, Claude's error in the spec): `npx @guidepup/setup` installs nothing on Windows. In 0.29.3 the `setup` subcommand is a no-op on win32 (lib/commands/setup/index.js), and NVDA comes from the `install` subcommand. That subcommand downloads `guidepup-nvda-0.2.1-2026.2.zip` from github.com/guidepup/nvda releases, checks the pinned sha256 `7df0ca3c…97a1` and unzips it per-user to `%LOCALAPPDATA%\guidepup\nvda\all\0.2.1-2026.2\extracted\` (download-assets.js; no Windows settings changed by that code). `versions.mjs` now uses Guidepup's own lookup (getNVDAInstallationPath.js); the HKCU key in constants.js is unused
Done 2026-10-27T05:57:35Z: acceptance 1-4 pass; NVDA 0.2.1-2026.2 found after `npx --no-install guidepup install nvda` run from `app/` (the installer resolves Guidepup from the current folder). R0 evidence in FEATURES.json
Next step: R1 spec (real NVDA speech, $0) by MCQ

### F-02 R1 real NVDA speech capture — status: done (R1 PASS r1-20261028T153344Z, D-54; D-53/A15 profile only, not default browse-mode coverage)
Approved: D-33 (spec + corrections C1-C3), D-34 (amendments A1-A3), 2026-10-27T06:52:43Z
Owner: Codex (D-43) · Publication: main only (D-44), independently verified components · Real R1 execution requires separate approval; never on the personal desktop
<!-- F-02 spec begin: fixtures/r1/lock.json hashes the text between these markers -->
Spec (verbatim from the revised F-02 message, approved in D-33):
- Frozen limits unchanged: one page we wrote, 3 of 3 attempts, 1.5 h, $0, no Meta calls, no screenshots or DOM in the speech log.
- Fixture `fixtures/r1/signup.html`: our own made-up newsletter form: name field, email field, terms checkbox, Review button, Confirm dialog, a status message that announces itself.
- 10 steps, case-insensitive. Each step's speech is everything NVDA says from the key press until 1.5 s of silence, or an 8 s timeout (amended by A1).

| # | Key(s) | Expected speech |
|---|---|---|
| 1 | Tab | contains "Full name", and not "Ada" (the field starts empty) |
| 2 | type `Ada` | the step's speech, joined with spaces removed, contains "ada" (amended by A3) |
| 3 | Tab | contains "Email" |
| 4 | type `ada@example.test` | joined speech contains "ada" (A3) |
| 5 | Tab | contains "agree" and "not checked" (C2) |
| 6 | Space | contains "checked" and not "not checked" (C2) |
| 7 | Tab | contains "Review" |
| 8 | Enter (opens the dialog) | contains "Confirm subscription" |
| 9 | Enter (confirms; dialog closes) | contains "Subscription saved", and focus back on the button: "Review" |
| 10 | Shift+Tab | contains "agree" and "checked", and not "not checked" (C2) |

- Reset before each attempt: 1 `nvda.stop()`, then `nvda.start()` (new process). 2 A new Chromium window opens `127.0.0.1:<port>/r1/signup.html?nonce=<8 hex>`; the title includes the nonce. 3 Wait up to 15 s for NVDA to speak the nonce; recorded, not a step (amended by A2; replaced by A4, D-36). 4 `clearSpokenPhraseLog()`, steps 1-10, browser closes. 5 `nvda.stop()` and the browser close run in `finally`.
- Fresh: a new NVDA process for the attempt; the load speech contains this attempt's nonce (A2); no speech contains another attempt's nonce; step 1 shows the form started empty.
- Complete: all 10 steps produced speech, every expected-speech rule passes, nothing timed out, no errors, the attempt reached step 10.
- R1 PASS: all 3 attempts in a single run are fresh and complete. Anything less is FAIL or PARTIAL.
- Nothing filtered: raw `spokenPhraseLog()` per attempt plus one record per step `{run_id, attempt, step, keys, phrases, silence_ms, timed_out, error, ts}`; no-speech steps, timeouts, errors and crashed attempts recorded. The validator fails any record with other fields.
- Locked before the first run: SHA-256 of `signup.html`, `steps.json` and this spec in LOG.jsonl; the runner refuses to run if a hash changed.
- Reruns only if setup fails before attempt 1 reaches step 1 (from the 0.25 h reserve, logged). Once attempt 1 has started, that run is the result.
- Evidence in `docs/evidence/r1/<run_id>/`: `attempt-{1,2,3}.jsonl`, `raw-{1,2,3}.json`, `summary.json` (commands, versions, hashes, UTC timestamps, result). Relative paths; only speech from our page; raw logs kept until R7.
- Files: `fixtures/r1/{signup.html, steps.json, lock.json}`, `src/speech/{capture.mjs, validate.mjs}`, `scripts/r1.mjs` (`npm run r1`, serves only `fixtures/` with node:http on 127.0.0.1), `test/speech.test.mjs` (first, synthetic logs), ledgers. No new dependencies.
- Acceptance: `npm test` passes; `npm run r1` validates all 3 attempts fresh and complete. If R1 fails: PLAN decision rule.
Corrections (D-33):
- C1: start NVDA with `[keyboard] speakTypedCharacters = 1, speakTypedWords = 0` (Guidepup `start({settings})`), read both back and record them; a mismatch is a setup FAIL. Steps 2 and 4 unchanged.
- C2: checked = `\bchecked\b` and neither `\bunchecked\b` nor `\bnot checked\b`; not-checked = `not checked` or `unchecked`. Negative validator tests.
- C3: SIGINT/SIGTERM stops new steps, tries `nvda.stop()` and browser close (10 s each), writes partial evidence `status: "aborted"`, exits 130; a second Ctrl+C exits at once. Tested with `process.emit('SIGINT')` and fakes. Not claimed: cleanup after a forced kill, or a real terminal Ctrl+C.
Amendments (D-34):
- A1: speech window = Guidepup 0.36.4 `capture: true`: ends after 1.0 s of silence (`SPEAK_DEBOUNCE_TIMEOUT`, fixed). The 8 s timeout applies to each key action; each typed character is one action. `silence_ms` records 1000.
- A2 (replaced by A4, D-36): before steps, Guidepup's focus routine: NVDA report title (NVDA+T); if the title lacks this attempt's nonce, Alt+Escape and retry, up to 10; still absent = setup FAIL. Fresh uses the reported title for "load speech contains this attempt's nonce"; the other freshness conditions stay.
- A3: typing steps match after lowercasing and removing everything but letters and digits from the joined speech. Raw phrases kept as spoken; `keys[i]` and `phrases[i]` record each character action.
Amendments (D-36, after incident I-01 in `docs/ledger/INCIDENTS.md`):
- A4 (replaces A2): no Alt+Escape and no window raising or focus recovery of any kind. After the page opens, a read-only check (user32 GetForegroundWindow, GetWindowThreadProcessId, GetWindowText; `src/speech/foreground.mjs`) is polled every `focus_poll_ms` (250) for up to `focus_wait_ms` (10 000) until the foreground window belongs to this attempt's Chromium browser process and its title contains the nonce; never = setup FAIL with no keys sent. Then one NVDA+T; the spoken title must contain the nonce (freshness as in A2), else setup FAIL, no retry.
- S1 guard: immediately before every key action (NVDA+T, each press, each typed character) the same check runs; a mismatch, probe error or probe timeout sends no key. Mid-attempt mismatch = status `focus-lost`: the step's partial record is kept, no further key is sent, the run stops (no more attempts, no rerun). Every check is logged to `focus-{n}.jsonl` (`ok`, `pid_ok`, `nonce_ok`, `ts`; reasons and the title cut to 80 characters only on a mismatch).
- S2 cleanup: raw log, browser close (then kill if close fails) and `nvda.stop()` are tried independently, each bounded by `cleanup_timeout_ms`; one failure never skips another. The first error is kept in `error`; later ones go to `later_errors`, cleanup failures to `cleanup_errors`.
- S3 evidence: writes never throw. A deleted evidence folder is recreated and flagged (`evidence.dir_recreated`); failed writes are listed in `evidence.write_errors`. Either rules out PASS. The runner prints the first error to stderr before writing anything, and prints the summary to stderr if a write failed.
- S4 run place: `scripts/r1.mjs` refuses to start unless `GITHUB_ACTIONS=true`, `RUNNER_ENVIRONMENT=github-hosted` and `RUNNER_OS=Windows`; no override. It runs only from `.github/workflows/r1.yml`: `workflow_dispatch` only, one job (`windows-2025`), `concurrency: r1` without cancelling a running job, `contents: read`, no secrets, no Meta calls, evidence uploaded with `if: always()`.
- S5 repository: the run refuses to start unless the checkout is clean and HEAD equals `GITHUB_SHA`. After every attempt it re-reads HEAD, `git status` (except its own evidence folder), the locked hashes and `test/*.test.mjs` hashes; any change is recorded in `interference`, stops the run and rules out PASS (FAIL, no rerun). The summary records the checkout SHA, test hashes, run id and runner image.
- S6 tests: unit tests write only to `os.tmpdir()/r1-test-*`, remove only those folders, and fail if `docs/evidence/` changed while they ran.
- Locked files now also include `src/speech/foreground.mjs`, `src/speech/runguard.mjs` and `.github/workflows/r1.yml`. Steps, expected speech, 3/3, $0, 1.5 h and the one-scored-run rule are unchanged.
Amendments (D-37, after the Codex review `docs/reviews/R1-D36-review-codex.md`; where these differ from the text above, these apply):
- A5 send guard (B-01, B-02; moves S1 to the send layer): `src/speech/sendguard.mjs` wraps Guidepup 0.36.4's two Windows send points, `NVDAClient.prototype.sendKeyCode` (NVDA commands, press, perform, and the stopSpeech Control the capture loop sends unawaited) and the `runVbsScript` export (one SendKeys script per typed character), before Guidepup is imported; `scripts/r1.mjs` re-checks the hooks after the import and refuses on any problem. Sends run one at a time. Every physical send has the A4 check (PID and nonce, bounded by 2 000 ms) immediately before it and, after a 50 ms settle, immediately after it. A failed, timed-out or stale check before a send sends zero keys. A failed check after a send, or a send that fails or outlives its bound, is possibly misdelivered: `focus-lost`, FAIL, no rerun, nothing more sent. A stop is sticky: every later send is refused. A send still running at cleanup leaves the browser open (NVDA is still stopped) and counts in `send_guard.unsettled`.
- A6 dependency lock: `fixtures/r1/lock.json` `dependencies` holds raw-byte SHA-256 of the Guidepup files the guard hooks or relies on; a mismatch, or an empty list, refuses the run.
- S7 evidence (S-04, M-03, M-04; replaces `docs/evidence/r1/<run_id>/` above): evidence goes to `%RUNNER_TEMP%/r1-evidence/<run_id>/`, outside the checkout. The workflow adds `_runner/job.json` and a copy of nvda.log, and uploads `r1-evidence/` with `if: always()`, `if-no-files-found: error`, 30-day retention (the user downloads it before expiry to keep it until R7). The runner keeps a journal of what it wrote and re-reads every file before the summary; a missing, truncated, changed or extra file is named in `evidence_check` and rules out PASS. A summary that cannot be written leaves `persisted` false; exit 0 only on a persisted PASS. On a signal the summary is written before cleanup, then rewritten.
- S8 run place and repository (S-01, S-02, M-07; extends S4, S5): actions pinned to full commit SHAs; the job runs only for `workflow_dispatch` on `refs/heads/main`; `scripts/r1.mjs` also refuses unless `GITHUB_EVENT_NAME`, `GITHUB_REPOSITORY` (`ANIRUDDH-001/Tabwise`), `GITHUB_REF` and `GITHUB_WORKFLOW_REF` name that workflow and `GITHUB_SHA` equals HEAD (a guard against accidental use, not attestation). After installs, tracked files and Guidepup `lib/` are set read-only (a speed bump, not a lock). HEAD, `git status` (no exclusions), locked, dependency and test hashes are re-checked before every step as well as after every attempt; a change stops the run before that step's first key. An edit restored between two checks is not detected.
- S9 outcome (M-01, M-02, M-05, M-06): cleanup errors, a missing raw log for a started attempt, a guard stop, an evidence problem or a crash rule out PASS; a crash is FAIL. The first error and each cleanup error go to the CI log. An `nvda.start()` or page open that outlives its timeout is stopped or killed when it arrives.
- S6 also: `docs/evidence/` is compared by path, content hash and whether it exists (M-08); workflow checks run on LF and CRLF text (S-03).
- Locked files now also include `src/speech/sendguard.mjs`. Steps, expected speech, 3/3, $0, 1.5 h and the one-scored-run rule are unchanged.
Amendments (D-39, D-40, spec `docs/reviews/R1-D39-patch-spec.md` rev 3; replace A5 and A6, and where they differ from the text above, these apply):
- A7 vendored send boundary: R1 loads Guidepup only from `vendor/guidepup-0.36.4-r1/` (the 36-file closure of `lib/windows/NVDA/NVDA.js`, upstream MIT, every change listed in `VENDORED.md`), never `@guidepup/guidepup`; it refuses when an upstream Guidepup `lib/` module is loaded. Keys leave the process only through two private, gated paths: the NVDA socket chord (messages built from validated integers, no reconnect) and `runSendKeys` (one character of `[A-Za-z0-9@.]`, temp file prepared before the check). Guidepup's own signal handlers are removed; `click` sends chords one after another; the send tables and prototypes are frozen.
- A8 send gate: before each send a bounded foreground check (PID and nonce, 2 000 ms); then, in the same turn with nothing awaited, a commit that refuses when the run stopped, the check is older than 100 ms, the action ended or another send is in flight; then the hand-off to Node or the OS. One send at a time; a stop is sticky and bumps an epoch that voids every pending check. Cancellation prevents new sends; it cannot recall an OS operation already launched (bytes handed to the socket, a started cscript); a live cscript is killed and the socket ended, best effort.
- A9 acknowledgement: after each page-reaching send (Tab, Space, Enter, Shift+Tab, typed characters) the runner's capture-phase `keydown` log on our page must show that key exactly once within 1 000 ms; then a 50 ms settle and the post-check. A missing, extra or late key, or a post-check mismatch, is possibly misdelivered: FAIL, no rerun, nothing more sent. Modifier-only events (Control, Shift, Insert) from NVDA's control keystrokes or SendKeys are tolerated and never invalidate another action's acknowledgement. NVDA-consumed keys (NVDA+T, the stop-speech Control) are recorded `ack: null`. The check, ack and post-check detect a misdirected key; they do not prevent the native delivery race.
- A10 teardown: one teardown for completion, errors, every signal (SIGINT, SIGTERM, SIGBREAK, SIGHUP, repeated ones included) and the deadline: stop sends, write the summary, wait up to 60 s for live sends, close the page only when nothing is live, stop NVDA last, one exit. The 60 s wait is best effort: GitHub Actions can forcibly terminate a cancelled step earlier. Playwright's signal handlers are off.
- A11 dependency lock: `fixtures/r1/lock.json` `vendor_tree` hashes the vendored tree as walked on disk (sorted paths and per-file SHA-256, `vendor/** -text`); `dependencies` keeps the upstream 0.36.4 pins the unchanged vendored files must equal. A mismatch, or a missing entry, refuses the run.
- S10 summary (M-02): the summary is rebuilt until stable (at most 3 rounds); unstable, or not persisted, is FAIL. Possible misdelivery, a missing ack, an unsettled send, interference or damaged evidence is FAIL even when the run was aborted or crashed; a clean abort stays PARTIAL.
- S11 evidence (M-03, M-06): `sends-<n>.jsonl` holds an intent line before each send and an action line after each action; an abort writes the current step as a `partial` record before cleanup; a summary that cannot be written goes to the CI log; a missing or changed file is rewritten as `recovered-<name>` from the journal and the damage still rules out PASS. The first error reaches the CI log before the step record is written.
- S12 workflow (S-04): an `Evidence contract` step fails the job when R1 ran and no `summary.json` exists; `_runner/job.json` lists the summary files; nvda.log is scrubbed and capped at 1 MiB.
- S13 run register (N-02): every scored R1 run is listed in `docs/ledger/RUNS.md` (run id, workflow run, commit, approving decision, result). D-36 replaces the frozen host wording; steps, expected speech, 3/3, $0, 1.5 h and the one-scored-run rule are unchanged.
- A12 (D-42, the one D-39 exception, after the Codex D-39 BLOCK): A9's window is no longer delimited by a Control. Immediately before each send, beside the foreground check, the page log since the last acknowledged send must hold only modifier events (Control, Shift, Insert); any other key refuses the send and is possibly misdelivered. After a page-reaching send, every non-modifier key since that check must be the expected key exactly once. A crash during teardown is FAIL and can never exit 0; a summary that did not reach disk is rebuilt with its write error; `lock.dependencies` must hold exactly the 7 upstream pins (missing, extra, empty or non-hash entries refuse the run). Residual, disclosed: an identical stray key that lands after the pre-send check while our own key is lost looks like our key.
- A13 (D-43 engineering repair): every send requires the page pre-read capability and a strict key-class acknowledgement result with no failure reasons. Complete the pre-read before requesting foreground; measure the 100 ms maximum from foreground request start through IPC, evidence writes and synchronous commit, using a monotonic clock. Late acknowledgement reads fail the original 1 000 ms bound. Freeze the gate and lifecycle exports. Unexpected TLS loss and malformed, oversized or truncated newline-delimited messages stop the run; fragmented/coalesced data preserve message order. Persist intent before permitting input. Check terminal page events after quiescence and raw capture. Reset must establish port absence and owned-process exit, and start must establish a live owned PID equal to the relay-listener PID after TLS handshake. Shared monotonic deadlines bound startup/cleanup; errors and failed cleanup remain failures. The dependency pin set now contains exactly 10 upstream reference files, adding start, quit and isRunning. Browser lifecycle is factored into a testable adapter with all engine signal handlers disabled. Offline tests have per-test timeouts. These strengthen software verification and do not alter frozen steps, speech expectations, 3/3, $0, 1.5 h, the one-scored-run rule or the native delivery race disclosure.
Amendment (D-49, after R1 #1 `r1-20261028T035811Z` spoke the title as "R 1 sign-up 1b 11a 7f 2 - Google Chrome for Testing"; where it differs from A2 and A4 above, it applies):
- A14 spoken title: the A4 initial check after NVDA+T and the freshness rule "the load speech contains this attempt's nonce" use one shared recognizer (`spokenTitleHasNonce` in `src/speech/validate.mjs`). Case-insensitive, the whole spoken title must be `R1` or `R 1`, then ` sign-up `, then exactly eight hexadecimal characters with zero or more ASCII spaces (U+0020), and nothing else, between them, then nothing, ` - Chromium` or ` - Google Chrome for Testing`. The eight characters, spaces removed, must equal this attempt's nonce. Nothing else matches: no other whitespace, punctuation, spoken number or letter words, substitutions, extra text, or characters joined across separate utterances. "No speech contains another attempt's nonce" also rejects that nonce with ASCII spaces between its characters inside any one utterance (title, raw log or step phrase); this is rejection only and never accepts a window. Raw speech, titles and errors are recorded unchanged. The native foreground check (A4, A8: this attempt's Chromium PID and the contiguous nonce in the window title) and every other rule are unchanged. Steps, expected speech, 3/3, $0, 1.5 h and the one-scored-run rule are unchanged.
Amendment (D-53 / A15 — configuration-only NVDA profile, explicitly approved):
R1 uses NVDA 2026.2 with virtualBuffers.enableOnPageLoad=false, supplied through the existing per-attempt Guidepup session configuration and checked through C1 readback. This disables automatic creation of NVDA browse-mode buffers on page load. The result measures the unchanged ten-step journey under this explicitly configured profile, not ordinary NVDA browse-mode operation. All original speech expectations, native page-key acknowledgement rules, 1000 ms limit, foreground and send guards, evidence requirements, 3/3 acceptance and scored-run accounting remain unchanged. Configuration readback does not itself prove real keyboard delivery or meaningful NVDA speech.
<!-- F-02 spec end -->
Progress: D-33, D-34 recorded 2026-10-27T06:52:43Z. Tests written first (red: modules missing), then `validate.mjs`, `capture.mjs`, fixture, `scripts/r1.mjs`. Locked 2026-10-27T07:04:48Z in `fixtures/r1/lock.json` (6 hashes, CRLF normalised; LOG.jsonl). `npm test` 44 pass 0 fail. NVDA not run by Claude
Found while building (no spec change): Guidepup `getSetting(key)` is a flat lookup over nested ini sections, so the C1 read-back walks `getSettings()`; Guidepup adds its own SIGINT teardown (lib/teardown.js) that also stops NVDA; `core.autocrlf=true`, hence CRLF-normalised hashes
Committed 4126b28..6cf0598 (user/Codex, D-35)
Run r1-20261027T072210Z (user, host laptop, 07:22:10Z): NVDA read other windows and some were minimized (cause open: I-01 H1-H3); form steps not seen (whether any ran is open: I-01 H-a..H-c); the evidence dir was deleted mid-run; runner crashed with ENOENT; no evidence survives. Classification (D-36): setup failed, rerun allowed, INFERENCE with incomplete evidence; not PASS, not voided. Record: `docs/ledger/INCIDENTS.md` I-01; LOG.jsonl 07:22:10Z, 07:40:17Z
Paused 2026-10-27T07:33:48Z: no real R1 runs on the host
D-36 fixes (2026-10-27T07:59:24Z, uncommitted): tests first, then A4/S1-S6; re-locked 07:58:42Z (9 hashes); `npm test` 70 pass 0 fail; `scripts/r1.mjs` refuses off CI (exit 2). Next step: Codex reviews per `docs/reviews/R1-D36-review-brief.md`; the user approves; the user commits and pushes; the user triggers `r1` in GitHub Actions; Claude validates the downloaded artifact

D-43/D-44 engineering checkpoint 2026-10-28T02:44:03Z: Codex primary ownership; prior correction limit superseded. D42 stale foreground and missing-hook failures reproduced and repaired; independent review also found and closed unexpected final-speech connection-loss and late-ack-read false-PASS paths. `npm test` 191 pass/0 fail; 32/32 valid scratch mutations detected, with per-test cancellations disclosed. Exact 61-file source manifest, 12 normalized file/spec hashes, 10 upstream pins and 40-file vendor tree checked; frozen gates unchanged. `docs/reviews/R1-D43-review-independent.md` APPROVE for source publication, not real execution. D-46 permits main-only publication of the manual workflow, explicitly no run. R1 stays NOT RUN/NOT PASS pending a separately approved isolated scored run; historical I-01 and BLOCK reviews retained.

### F-02 / D-51 offline reliability checkpoint — approved by the user's checkpoint request
- Goal: audit all offline tests and correct demonstrated harness races without changing production safety.
- Files: `test/{broker,engineering,sendguard,speech,vendor}.test.mjs`, `test/helpers/{faults,sandbox,reliability}.mjs`; checkpoint reports, publication script, CODEMAP and ledger handoff.
- Acceptance: `node scripts/preflight.mjs`; `node --test --test-timeout=10000 --test-reporter=tap "test/*.test.mjs"`; target 100 final-code suites over order/concurrency/fs/stall/read-only LF+CRLF profiles; targeted reproduction, mutations, separate read-only review, publication-script scratch-remote validation.
- Cost ceiling: $0; no Meta, real NVDA, desktop input, R1 dispatch, installs, commits or pushes in the real checkouts.
- Base: `6eceb0e64075ba522866f344719a643f3744ca59`; worktree C: safety checkout; review branch `test/d51-reliability`.
- Out of scope: frozen source/vendor/fixtures/locks/gates/dependencies and either workflow; historical evidence remains unchanged.
- Publication: user commits/pushes review branch → PR → two independent successful hosted Windows preflights → user-approved fast-forward → separate R1 authorization. Any hosted failure blocks integration.
- Rollback: discard only the explicitly listed D-51 changes after review; preserve unrelated work and untracked files.
- D-51 continuation (user-approved): close B1/B2, address S1–S3 and preserve original records. Add one polling regression (206 total); qualify final modified source separately with20 read-only LF/CRLF suites,13 precise-assertion mutants and56 publication scenarios across PS5.1/7. External final17-file seal is generated after all review/ledger edits; no required self-hash is embedded in one of17. Another Claude verdict is required before publication; all real writes remain uncommitted.


### Workspace consolidation / D-52 — approved migration and finalization
- Goal: one permanent active checkout; published D-51 base34a1ae02cce4da959078180da81976e8c2f333bd preserved.
- Files for publication: docs/ledger/{DECISIONS,LOG,PLAN,STATE}; recovery archives and machine-specific details stay local.
- Acceptance: backup hashes, non-force retirement, sole worktree, source-lock/pin/gate integrity, git fsck, preflight and206 offline tests.
- Cost ceiling: $0; no installs or metered calls.
- MEASURED migration:540 backup items verified; original1623-file state restored;68 changed/untracked originals retained;116 non-ledger blobs match D-51.
- MEASURED retirement: four stray files moved/hash-checked; redundant worktree removed through Git; permanent checkout alone remains.
- Review branch: feat/D-52-workspace-finalization. Cross-tool review is required before commit; Claude CLI currently signed out.
- Publication: explicit four-file staging only, review staged diff, then authorized local commit; user-only remote push. No automatic main update.
- Rollback: use verified external recovery; local original-state archives and historical evidence are retained.
- Out of scope: R1/NVDA/input/Meta, source changes, dependencies, remote writes, tags or historical-code publication.

### F-02 / D-53 A15 — approved configuration-only candidate
- Goal: disable automatic NVDA browse-buffer creation at startup; qualify the original journey under that declared profile.
- Files: fixtures/r1/{steps,lock}.json; test/speech.test.mjs; ledger PLAN/DECISIONS/LOG/STATE/RUNS; CODEMAP only if needed.
- Runtime change: virtualBuffers.enableOnPageLoad=false; both keyboard settings retained; existing start/settings/C1 paths unchanged.
- Acceptance: A15 tests first, full npm test, preflight, source/spec/dependency/vendor/gates lock checks, exact journey and privacy checks.
- Cost ceiling: $0; no installs, live NVDA, desktop input, R1 dispatch, commits or pushes.
- MEASURED: RED6 fail/1 pass -> GREEN7/7; full213/213; preflight12 locks/10 pins/vendor/gates all pass.
- Preservation: original scored R1 #3 FAIL/no-rerun appended to RUNS; prior dirty STATE/LOG retained in local review evidence.
- Scope excludes observer/receipt infrastructure, mode toggles, vendor/source changes, new dependencies and altered thresholds.
- Next: independent Claude review of sealed eight-file diff, then separately approved hosted qualification. Real speech/delivery, especially step9, unverified.
- Rollback: use preserved baseline and exact diff; never discard prior handoff/evidence.

### F-03 R2 causal offline foundation — status: in progress (offline foundation done; live NVDA and model arms not run)
- Approval: D-55. Frozen Day-1 R2 row, decision rule and kill checks unchanged; nothing here changes an acceptance rule.
- Files: `fixtures/r2/{validation,dialog-focus,status}/{healthy,broken}.html`, `fixtures/r2/{manifest,labels.development,development-hashes}.json`, `src/r2/contract.mjs`, `test/r2.test.mjs`, `scripts/r2-baseline.mjs`.
- Fixtures: three owned pairs; each differs by one declared substitution (test reproduces broken byte-exactly). Split = development: authored, labelled and inspected by Claude; never scored as withheld. `assertEvaluable` refuses pages whose hash is in `development-hashes.json` (append-only), labels by the runner, and non-independent or unreviewed labels.
- Page evidence: `window.__r2Events`, seq-ordered keydown/focusin/app events; app events record the active element (focusin alone misses focus falling to body).
- Timeline: speech per action from Node capture records; page events by page seq, assigned to the action whose acknowledged keydown precedes them; clocks across processes are never subtracted. Missing ack or speech record, non-keydown ack, out-of-order acks or duplicate seq → INSUFFICIENT_EVIDENCE.
- Page outcome (each arm): insufficient → INSUFFICIENT_EVIDENCE; abstain → ABSTAIN; malformed → INSUFFICIENT_EVIDENCE; healthy: barrier claimed → FAIL, else PASS; broken: same step and element as the label → PASS, else FAIL.
- Run outcome: not evaluable, over $1.50 or 2 h, arms differ in model/version/mode, speech payload with screenshot/image/DOM/HTML, or visual payload with speech → INSUFFICIENT_EVIDENCE (NOT RUN). Any healthy FAIL → FAIL; any healthy INSUFFICIENT → INSUFFICIENT_EVIDENCE; ≥1 broken page with speech PASS and no axe violation on the locus element → PASS; else missing broken evidence → INSUFFICIENT_EVIDENCE, else FAIL.
- Causal claim (kill check 2026-10-29): kept only if some qualifying barrier is not also localized by the same-model visual control.
- MEASURED 2026-10-28T16:09:11Z (scripts/r2-baseline.mjs; headless Chromium 156.0.8078.4, axe-core 4.14.0, Playwright CDP keys; no OS input, NVDA or model): 0 axe violations on all 6 pages before and after the task. Dialog close: focus on open-dialog (healthy) vs body (broken); broken's next Tab lands on open-dialog in Chromium. Validation and status differ only in the locus role (alert/status vs none) with identical visible text. Development data, not evaluation.
- Not done: live R2 NVDA speech (needs a separately approved workflow change; NVDA runs only in r1.yml), withheld fixtures, independent labels, model arms. FEATURES R2 unchanged.
- Cost: $0 spent; R2 evaluation budget proposed in the report, not authorized.
- D-56 continuation, user: "You may implement and test the bounded offline R2 preparation." "Handle all engineering tasks yourself."
- Goal: independent foundation review, demonstrated fixes, provisional private fixture package, minimal hosted integration design; no official R2 evaluation.
- Files: `src/r2/{contract,preparation}.mjs`, new `test/r2-{review,preparation,preparation-hardening,payload-context}.test.mjs`, `docs/engineering/R2-preparation-handoff.md`, normal session ledgers; private package/source/browser tests outside Git.
- Acceptance: `npm test` all pass; private `node --test .../private-fixtures.test.mjs .../private-modal.test.mjs` pass; package rebuild has identical pinned seal; `node scripts/preflight.mjs` passes.
- Cost ceiling: ₹0 additional spend; no metered calls. Scope is the bounded offline preparation in the pasted request; no separate execution/time allowance inferred.
- Out of scope: installs, local NVDA/desktop input, inference, workflow/policy edits, hosted execution, publication and commits/pushes. Rollback: original dirty files preserved privately; no prior changes discarded.
- MEASURED r2-prep-20261028-v2: 251/251 offline; private 2/2 browser tests; axe 4.14.0 zero initial/final violations on all six new pages and six development pages; package rebuild byte-identical. R1 locks/gates/deps intact.
- Corrections: require controls/model identities/distinct label reviewer; reject wrong-key acknowledgements/healthy abstentions; missing visual evidence cannot support causal flag. New strict preparation path blocks official scoring pending blinded review/hosted evidence.
- Private package: `%USERPROFILE%/.codex/private/tabwise-r2/prep-20261028/package`; self-authored PROVISIONAL labels. Handoff has seal/hash details and exact files. R2 FEATURES remains false; not independently labelled/evaluated.
- Next: fake-transport R2 capture adapter (complete phrase deltas, silence windows, page snapshots); review new verifier/output code before use. CI policy/private delivery/one live execution remain separately gated.

### F-03/D-57 minimum offline capture continuation — status: offline implementation complete; cross-tool review outstanding
- User spec: "Implement only the minimum offline, fake-transport R2 capture adapter." Eight acceptance items in the current request; no UI/product architecture/hosted orchestration/inference.
- Files: `src/r2/capture.mjs`; new `test/r2-capture{,-boundaries}.test.mjs`; `docs/engineering/R2-capture-handoff.md`; normal session ledgers/CODEMAP. R1 source/guards/acceptance and all existing tests remain unchanged.
- Acceptance commands: `node --test test/r2-capture*.test.mjs`; `npm test`; `node scripts/preflight.mjs`; private `verify-private.mjs` for unchanged fixture seals/export/reproduction.
- Cost ceiling: ₹0; no paid calls/installs. No separate execution allowance inferred. No commits/pushes/dispatch/live NVDA/desktop input.
- Rollback: original 25 dirty/untracked files preserved outside Git before edits; new files are uncommitted. No old changes discarded.
- MEASURED r2-capture-20261028: 23/23 targeted and 274/274 full offline tests; preflight/private fixture integrity passed. Initial RED 19/19 failures; boundary RED 3 failures/1 existing pass.
- Current contract: append-only speech cursors; explicit bounded silence vs capture failure; action/page snapshots and continuous supplied event logs; separate Node/page clocks; exact page keys via unchanged R1 `judgeKeys`; bounded operations via unchanged R1 `withTimeout`.
- No official R2 result: fake source is refused by real-NVDA evidence validation; association is window-only. Missing/late/unassigned evidence blocks completion. No product decisions made.
- Next: cross-tool review of adapter/provider contract before real guarded binding. Hosted qualification additionally needs CI policy/private delivery approval, real continuity/quiet-window qualification and blinded labels.

### F-03/D-58 targeted independent-review corrections — status: offline corrected; real binding BLOCK
- User: "Correct only demonstrated R2 adapter defects." "Stop after this bounded correction and handoff." Product architecture remains separate.
- Files: `src/r2/capture.mjs`; new `test/r2-capture-corrections.test.mjs`; `docs/engineering/R2-capture-corrections.md`; append note to prior capture handoff; normal session records/CODEMAP.
- Acceptance: reproduce both defects RED; targeted capture tests pass; `npm test`; `node scripts/preflight.mjs`; existing private `verify-private.mjs`; no existing tests/R1/fixture edits.
- Cost ceiling: ₹0; no binding/hosted/NVDA/Meta/UI/orchestration/push/commit. Rollback: 29 initial dirty/untracked files retained privately; evidence preserved.
- Reproduced: pre-action page-read speech attached to Enter; +1500 ms key accepted under 2000 ms observation. Seven new tests failed before fixes.
- Minimal corrections: post-page speech boundary check; separate fixed 1000 ms Node acknowledgement-observation cap from executor request; explicit unverified guarded execution and physical quiescence, including ignored cancellation.
- Scope limitation: no atomic physical-send boundary from untagged logs; conservative cap is not a guard receipt. Capture completion is not official R2 acceptance.
- Next: reconcile this corrected provider contract with parallel architecture and frozen guard requirements before real-binding approval; stop engineering at this handoff.

### TW-01 / D-59 — Tabwise approved implementation
- Goal: contracts v0.1, then A data plane/brokers/routes, B Fernway/guarded worker, C product UI/static reports.
- Files: ci/r1-baseline.sha256; scripts/check-r1-baseline.mjs; packages/contracts/**; new tests; TABWISE-PRODUCT-DIRECTION.md; normal ledger/CODEMAP, then the §16 lane-owned paths.
- Acceptance: node scripts/check-r1-baseline.mjs; npm test; npm --prefix packages/contracts test; node scripts/preflight.mjs; private verify-private.mjs; lane-specific tests in §16.3.
- Cost ceiling: zero API calls and zero incremental financial expenditure; no new execution-time allowance inferred.
- Source: parent TABWISE-PRODUCT-DIRECTION.md (October29 ownership revision), mirrored locally; prompt corrections supersede §16 stale lane/verdict entries.
- Contracts resolve: runtime-dependency-free ESM, draft2020-12; Ajv dev-only; strict Meta schema separate; palette-only spec; encoded dispatch envelope limit.
- Out of scope: frozen R1 edits, live execution, spending, deploys, credentials, commits/pushes; real binding remains BLOCK pending Claude PASS and owner approval.
- Rollback: preserve original31 files and private seal; discard only newly authored task work after review.


- MEASURED tw-impl-20261029: contracts21/21; root305/305; web15/15; production build without Supabase env passes;13 UI routes axe0, local recorder/mobile pass.
- Database: three migrations applied only to dedicatedTabwise project; SQL RLS/admission/budget/immutable tests pass;50 concurrent hosted calls bounded; test rows removed, hosted40cap/spent0/reserved0.
- BLOCK/remaining: real guarded binding and Claude review (CLI signed out), worker completion, credentials/auth provider, patch/verify/live reports and authenticated live qualification. Exact handoff: docs/engineering/Tabwise-implementation-handoff.md.

### TW-01 / D-63 — continuation and current-tree review corrections
- User explicitly continues ongoing implementation; no restart or planning questionnaire; no dispatch, Meta/Baseten calls, keys, spending or deployment.
- Reconcile uploaded Claude F1–F7 against current source; regression-test demonstrated gaps. Scope remains the D-59 files plus new bounded helper/tests and normal ledgers.
- Owner inputs: Tab/Shift+Tab/Enter/Space only; AshaTest; invalid.email; stop-speech deferred. Whole-journey and typed-value refusals precede providers.
- Prepare second read-only client candidate/observer qualification only. Actual dispatch additionally requires explicit owner authorization and independent safety clearance.
- Acceptance: root331/331; contracts21/21; web18/18; build,13-route axe/recorder/mobile/keyboard checks, preflight, original65 and private seal checks PASS (MEASURED tw-d63-review-20261029).
- Four fake executor tests/five fake observer tests do not qualify physical input/relay equivalence. All worker typing/live binding stays BLOCK; frozen R1/R2 acceptance/private fixtures unchanged.
- Baseten separate100 allocation recorded only; no shared ledgers, API calls or P0 dependency. Meta local60/hosted40 caps unchanged.
- Remaining: production binding/loader, independent safety clearance, narrow owner-authorized observer test, real NVDA+Meta diagnosis/verification, authenticated integration and partial diagnostic retention.
- Later D-63: patch-decision UI/API/RPC and failed diagnostic retention/display implemented; root333/contracts21/web21/build/local keyboard-axe-mobile/rollback-only SQL PASS; five migrations; these changes excluded from fixed155-file/83-test follow-up review.

### TW-01 / D-64 — modular local commits, backend/product integration, offline worker
- Approved goal/files: owner's continuation attachment; canonical D: repository, existing TW-01 implementation paths; preserve frozen R1/private material and Claude's sealed155-file review.
- Order: selectively commit coherent verified D-63 units, then complete backend lifecycle and genuine product journey, then offline worker preparation; no routine delegation or review wait.
- Acceptance: relevant unit suites before each commit; full root/contracts/web and production build for consolidation; targeted red/green regression tests and local keyboard/axe/mobile checks for subsequent behavior changes; preflight/private seal.
- Cost ceiling: zero incremental spend, no Meta/Baseten calls, dispatch, deploy, key exposure or pushes. Local conventional commits explicitly authorized; pending independent review remains separate from commit authorization.
- No C: checkout; C: only existing isolated snapshots, private sealed evaluation and temporary evidence. Ignore CLI temp/cache/build outputs. Exact selected paths and commit messages retained under ignored cache/d64.

### TW-01 / D-65 — independent D63 corrections and offline qualification harness
- Reconcile N-1…N-5 against current D: tree; failing regressions first, then modular local correction commits. Original F1…F7 remain traceable.
- Implement integrity-first authentic frozen loader, registered guard/relay ownership, one guarded title action, page/foreground providers, hashed artifact and one manual workflow disabled by default. Full worker stays BLOCKED.
- Files: new scripts/tabwise qualification helpers/entry; existing observer/network/executor and web artifact helpers; new regression/fake integration tests; one .github/workflows qualification file explicitly requested; normal review/ledger/CODEMAP.
- Acceptance: per-finding red/green, fake loader/provider/title/teardown/artifact integration, full root/contracts/web/build and R1/private preservation. No live dispatch/input/calls/credentials/spend/deploy/push; no dependencies.
- MEASURED D65: N1–N5 red/green; root353/353, web26/26/build, local keyboard/axe/mobile and original65/private checks PASS. Offline harness and default-disabled manual workflow complete; executable35e74ff; actual relay/VM timing/egress remain unverified. Review map and local commits in docs/engineering/Tabwise-D65-*.

### F-03 / CI-H1 — hanging offline preflight (D-75)
- Goal: bounded offline preflight with explicit coverage and cleanup on rejected browser setup.
- Baseline: bb8008b0857f2148c5c808e951fac2a64fc2647b; clean review/tabwise-m2b-m2c; branch fix/tabwise-ci-preflight-hang.
- Files: .github/workflows/preflight.yml; ci/offline-tests.json; scripts/offline-tests.mjs; test/{fernway,tabwise-network-browser,ci-browser-cleanup,ci-offline-selection}.test.mjs; test/helpers/reject-browser.mjs; engineering handoff and normal ledgers/CODEMAP.
- Acceptance: node --test test/ci-browser-cleanup.test.mjs test/ci-offline-selection.test.mjs; node scripts/offline-tests.mjs --profile ordinary --out cache/ci-h1; node scripts/offline-tests.mjs --profile stress --seed 172785 --out cache/ci-h1; node scripts/check-r1-baseline.mjs; node scripts/preflight.mjs; checkFrozenIntegrity and unchanged qualificationDigest.
- Cost ceiling: $0; no installs or live execution; bounded to CI-H1 in this session.
- Out of scope: complete npm test, real browser/NVDA/input, third-party writes, hosted execution, M2D, frozen source/locks/status changes.
- Rollback: revert reviewed CI-H1 diff on the local branch; preserve baseline/history.
- R2 qualification remains BLOCKED; FEATURES unchanged.
- MEASURED CI-H1-20261029: ordinary and all eight stress profiles each478/478 (47 admitted files); all205 R2 tests PASS; excluded9 files separately recorded; frozen/preflight/qualification integrity PASS; uncommitted pending independent review.
### F-03 / CI-H2 — mixed speech watchdog correction (D-76)
- Goal: Bound the mixed/speech stress profile without misclassifying slow progress as a deadlock.
- Files: scripts/offline-tests.mjs; test/ci-offline-selection.test.mjs; docs/engineering/CI-H1-preflight-hang.md; normal governance ledgers.
- Acceptance: six selection regressions; ordinary and eight stress profiles each 480/480; frozen R1 baseline, preflight and diff checks PASS.
- Cost ceiling: $0; no dependency installations or hosted execution during local validation.
- Out of scope: frozen R1, other watchdog limits, browser/NVDA runs, qualification activation, M2D, merge or deployment.
- Rollback: revert the CI-H2 commit on the review branch.
- MEASURED locally: 9/9 profiles, 4320/4320 executions PASS; 47 admitted files, nine excluded.
- Hosted Windows verification pending; R2 qualification remains BLOCKED.
- Post-merge (R2-L0): committed f59bb55 + 1965e21, merged by PR #4 (1988f86), reached main via PR #3 (78cf379). Owner-reported: independent CI-H1/H2 review PASS; combined hosted offline preflight PASS, run 41016516810 (pre-merge).
### F-03 / R2-M2D — premature speech attribution hardening (D-77)
- Goal: speech seen before an established gate-release boundary is never action evidence; keep it as diagnostics; fail closed.
- Baseline: 1988f867c73915e373bbf87dbac2a77ab85b81f4 (review/tabwise-m2b-m2c).
- Files: src/r2/capture.mjs; test/r2-capture-receipts.test.mjs; test/r2-capture-receipts-failclosed.test.mjs; docs/engineering/R2-M2D-speech-boundary.md; normal ledgers/CODEMAP.
- Acceptance: red-before-green M2D regressions; node --test test/r2*.test.mjs; check-r1-baseline; preflight unchanged vs baseline; offline ordinary/stress profiles; git diff --check.
- Cost ceiling: $0; no installs, API, browser, NVDA, input, dispatch or publication.
- Out of scope: M1 live-gate stop, silence-window anchoring (M2E candidate), frozen R1, CI, FEATURES/qualification status.
- Rollback: reverse-apply the M2D patch; M2A/M2B/M2C/CI-H1/H2 untouched.
- MEASURED (Linux, Node 22.22.0): RED 20/22 + 1/1 at baseline; GREEN 44/44 and 12/12 ×10; R2 228/228; offline profiles 498/503 with 5 environmental ENOENT failures identical at baseline; random profile unsupported on Node 22. Windows pending. R2 qualification remains BLOCKED.
- Post-merge (R2-L0): committed 2754e6b on review/tabwise-m2b-m2c, reached main via PR #3 (78cf379). Later Windows Node 24.22.1 results for the combined R2 tree are in the M2E and post-final-stop handoffs.
### F-03 / R2-M2E - release-relative observation accounting (D-78)
- Baseline: 2754e6b687b0e5735f18324a57ae5cdfb16bab33; branch: fix/tabwise-r2-m2e.
- Scope: receipt observation/silence timing, test-fixture corrections, handoff and ledgers.
- Acceptance: focused and full R2, ordinary/stress, frozen R1, preflight.
- Local verification: focused62, R2 234, ordinary509, stress 8x509 PASS.
- First stall-40 speech timeout retained; final rerun passed.
- Next: hosted offline CI and owner integration decision.
- Excluded: frozen R1 changes, live execution, qualification and spending.
- Rollback: revert isolated M2E commit.
- Post-merge (R2-L0): committed 0412f69, merged by PR #5 (ef3b8ed), reached main via PR #3 (78cf379); the "Next" item above is resolved by those merges and the owner-reported combined hosted preflight run 41016516810.
### F-03 / R2 post-finalization gate stop (D-79)
- Goal: an owned gate stopped after receipt finalization never yields a completed or model-eligible capture; keep the original stop kind and reason.
- Baseline: ef3b8eda9797029e95be0626771112fbe0144ecd; branch: fix/tabwise-r2-post-final-stop.
- Files: src/r2/{capture,binding,send-receipt}.mjs; test/r2-capture-receipts-failclosed.test.mjs (appended); docs/engineering/R2-post-final-stop.md; M2E handoff status; ledgers/CODEMAP.
- Acceptance: RED then GREEN regressions; focused and full R2; frozen R1; preflight; git diff --check; ordinary and eight stress profiles.
- Excluded: frozen R1, CI inventory/thresholds, live execution, qualification and spending.
- Rollback: reverse-apply the uncommitted diff; M2A-M2E untouched otherwise.
- D-80 correction: boundary fixtures use observable lifecycle (test-owned ack-reader entry, fake clock, provider order); binding-return check covered by a scratch probe only; tests 4/5 now RED on baseline with the stop firing.
- Post-merge (R2-L0, 2026-10-30T07:50:13Z): committed as a3a9ad4, merged by PR #6 into review/tabwise-m2b-m2c (46749e0), then PR #3 into main (78cf379; tree equal to 46749e0). Owner-reported: independent D-79/D-80 review PASS. R2 qualification remains BLOCKED.
### F-03 / R2-L0 — post-merge reconciliation and production-binding readiness (docs only)
- Baseline: 78cf37953702998dc87a9eb61cae6e7c64ec339f; branch: chore/tabwise-r2-post-merge.
- Scope: reconcile STATE/PLAN/LOG and the M2E, post-final-stop and CI-H1 handoffs to the merged state; source-grounded binding gap table and R2-L1 spec in docs/engineering/Tabwise-worker-binding-blocker.md.
- Hosted CI: owner-reported combined offline preflight PASS, run 41016516810, before the PR #3 merge. No post-merge main-branch run is recorded.
- Excluded: code, tests, CI, frozen R1, qualification/review status, thresholds, dependencies, live execution, commits.
- Next: independent review of the R2-L0 docs diff; owner decision on R2-L1.
- Revision (2026-10-30T08:04:41Z, after independent review CONDITIONAL PASS): the R2-L1 gate-wiring helper was withdrawn. R2-L1 is now an offline page-journal compatibility adapter over injected synthetic data: one source feeds both an R2 snapshot view and a pageAck keydown view, with explicit completeness, sequence, focus and modifier checks, and writer use of the existing `page` lane only. Guard/executor/receipt composition is deferred to R2-L2, behind an independently reviewed production loader and separate authorization. Hosted observer history corrected (D-72 skipped, D-73 refused pre-runtime, D-74 the only runtime observation). Reconciliation facts unchanged.
