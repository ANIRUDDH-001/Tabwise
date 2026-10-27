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

### F-02 R1 real NVDA speech capture — status: in progress
Approved: D-33 (spec + corrections C1-C3), D-34 (amendments A1-A3), 2026-10-27T06:52:43Z
Owner: agent claude · Branch: current (`main`), the user commits · The user runs `npm run r1`; Claude never starts NVDA
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

- Reset before each attempt: 1 `nvda.stop()`, then `nvda.start()` (new process). 2 A new Chromium window opens `127.0.0.1:<port>/r1/signup.html?nonce=<8 hex>`; the title includes the nonce. 3 Wait up to 15 s for NVDA to speak the nonce; recorded, not a step (amended by A2). 4 `clearSpokenPhraseLog()`, steps 1-10, browser closes. 5 `nvda.stop()` and the browser close run in `finally`.
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
- A2: before steps, Guidepup's focus routine: NVDA report title (NVDA+T); if the title lacks this attempt's nonce, Alt+Escape and retry, up to 10; still absent = setup FAIL. Fresh uses the reported title for "load speech contains this attempt's nonce"; the other freshness conditions stay.
- A3: typing steps match after lowercasing and removing everything but letters and digits from the joined speech. Raw phrases kept as spoken; `keys[i]` and `phrases[i]` record each character action.
<!-- F-02 spec end -->
Progress: D-33, D-34 recorded 2026-10-27T06:52:43Z. Tests written first (red: modules missing), then `validate.mjs`, `capture.mjs`, fixture, `scripts/r1.mjs`. Locked 2026-10-27T07:04:48Z in `fixtures/r1/lock.json` (6 hashes, CRLF normalised; LOG.jsonl). `npm test` 44 pass 0 fail. NVDA not run by Claude
Found while building (no spec change): Guidepup `getSetting(key)` is a flat lookup over nested ini sections, so the C1 read-back walks `getSettings()`; Guidepup adds its own SIGINT teardown (lib/teardown.js) that also stops NVDA; `core.autocrlf=true`, hence CRLF-normalised hashes
Next step: Codex reviews the diff; the user commits, then runs `npm run r1` from `app/` (hands off, about 3-5 min); Claude checks `docs/evidence/r1/<run_id>/`
