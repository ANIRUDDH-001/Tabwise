# Codex review brief: R1 vendored Guidepup patch (D-39, D-40)

Written 2026-10-27 by claude for the one independent Codex D-39 review (D-39, D-40). The user gives this brief to Codex. Status: **review not started**.
Codex: report findings only, in `docs/reviews/R1-D39-review-codex.md`. Do not run `npm run r1`, start NVDA or any vendored `NVDA.start()`, trigger any workflow, call the Meta API, commit or push. NVDA is installed on this laptop (`%LOCALAPPDATA%\guidepup`).
Safe to run: `npm test` (the vendored code runs inside the T0 sandbox in `test/helpers/sandbox.mjs`: every `child_process` function, `net`/`tls` connect throw unless a test fakes them; writes only to `os.tmpdir()`), `node scripts/r1.mjs --hashes` (prints, starts nothing), read-only git. Mutations: in a copy outside the repo only (see "Mutations" for a copy layout that keeps T11 meaningful).

**Stop condition (D-39):** if a material send-boundary blocker remains, this R1 implementation stops and the reduced-scope alternatives go to the user. Please say plainly whether any finding is such a blocker.

## Context (read first)
- Your D-37 review: `docs/reviews/R1-D37-review-codex.md` (BLOCK: D37-B01, D37-B02, D37-M01..M04).
- The user's words: `docs/ledger/DECISIONS.md` D-39 and D-40 "D-39 patch spec rev 2 approved, with qualifications". **Numbering note:** an unrelated entry first recorded as a second D-40 ("Partner inference credits as backup", 13:47Z) was renumbered D-41 by the user for uniqueness. D-40 is the patch approval everywhere (this brief, the lock, `VENDORED.md`).
- Spec: `docs/reviews/R1-D39-patch-spec.md` rev 3, and `docs/ledger/PLAN.md` § F-02 amendments A7–A11 and S10–S13 between the spec markers. Claude wrote the PLAN wording; check that it matches D-39, D-40 and the code.
- Vendoring record: `vendor/guidepup-0.36.4-r1/VENDORED.md` (source, npm integrity, the 5 changed and 1 added file with upstream and vendored sha256, "Limits (D-40)").

## The diff
Nothing since D-36 is committed, so `git diff HEAD` holds D-36, D-37 and D-39 together. D-39 is everything that differs from the state you reviewed in D-37.

| File | D-39 change |
|---|---|
| `vendor/guidepup-0.36.4-r1/` | NEW. `package.json`, `manifest.json`, `LICENSE` and the `require()` closure of `lib/windows/NVDA/NVDA.js` from installed 0.36.4. Changed: `lib/teardown.js` (records handlers only), `NVDA/NVDA.js` (sequential `click`, deep freeze), `NVDA/NVDAClient.js` (admit → same-turn commit and queued downs/reversed ups; bounded write callback, `end` then `destroy`; no reconnect; awaited stopSpeech; validated key fields), `runVbsScript.js` (`runVbsScript` disabled; `runSendKeys(char)` allow-list, file prepared before admit, same-turn commit and hidden `execFile`, `sendMs`/`killMs` bounds), `sendKeys.js` (one character only). Added: `lib/windows/r1Gate.js` (one gate, set once, checked complete) |
| `src/speech/sendguard.mjs` | REWRITTEN. `sendGate()`: arm/disarm per action, `admit` (integrity + bounded foreground check, epoch, one in flight), `commit` (age ≤ `maxAgeMs`, same epoch), `launched`/`release`/`settled`, sticky `stop`, live-send tracking, `quiesce`; `pageAck()` window rule; `judgeKeys`/`pageKeyOf`. The D-37 `installSendGuard` hooks are gone |
| `src/speech/vendortree.mjs` | NEW. `treeHash`, `checkVendor` (tree on disk vs installed upstream and `VENDORED.md`), `upstreamLoaded`, `vendorIntegrity` (run in every admit) |
| `src/speech/capture.mjs` | Page-key ack per send; `sends-N.jsonl` intent/action lines; partial record on abort; `recover()` → `recovered-<name>`; `writeSummary` stable-summary loop (≤3 writes); `installTeardown` (B02) replaces `installAbort`; `scrubLog`; live-send wait at cleanup (`LIVE_WAIT_MS` 60 000); one `setImmediate` turn after each action (see "Calls") |
| `scripts/r1.mjs` | Order: CLI (`--hashes`, `--scrub-log`), CI guard, win32, file lock, upstream pins, `RUNNER_TEMP`, clean check, workflow guard, `treeHash` vs `lock.vendor_tree`, `checkVendor`, probe warm-up, `upstreamLoaded` (before), `setGate`, vendored `NVDA.js` load, `upstreamLoaded` (after), `setIntegrity`, first integrity check, Playwright import. `launchServer` with `handleSIGINT/SIGTERM/SIGHUP: false`; `addInitScript` keydown counter (`window.__r1Keys`, capture phase) before `page.goto`. After `installTeardown` nothing exits or kills except the teardown |
| `.github/workflows/r1.yml` | Gated CI config (approved in the spec). Job diagnostic: `nvda.log` through `node scripts/r1.mjs --scrub-log`, `summary_files` in `_runner/job.json`. New last step `Evidence contract` (`if: always()`, no `uses:`). Still exactly 3 pinned actions |
| `.gitattributes` | `vendor/** -text` |
| `fixtures/r1/lock.json` | Re-locked 2026-10-27T14:21:16Z: 11 files (adds `vendortree.mjs`), the 7 upstream pins kept as `dependencies` (A11; the spec's "replaces" wording is superseded), `vendor_tree`; the earlier locks under `supersedes` |
| `test/helpers/sandbox.mjs`, `test/vendor.test.mjs` | NEW. T0 sandbox; vendored boundary tests |
| `test/sendguard.test.mjs` | REWRITTEN for `sendGate`/`pageAck` (old → new below) |
| `test/speech.test.mjs` | D-39 runner, teardown, evidence, summary and workflow tests (old → new below) |
| Ledgers | PLAN A7–A11/S10–S13, DECISIONS D-39/D-40, CODEMAP, PROVENANCE (vendored MIT row, new-work row), STATE, LOG |

Pre-D-39 diffs you already reviewed and that D-39 did not touch: `AGENTS.md` (D-36 security line) and `fixtures/r1/steps.json` (D-36 focus wait). Its hash equals the D-37 lock's (`150a9582…`).

## Claude's measurements (2026-10-27, host; please reproduce)
- `node --test test/speech.test.mjs` → tests 92, pass 92, fail 0.
- `node --test test/vendor.test.mjs` → tests 26, pass 26, fail 0 (after adding the 3 tests under "Mutations").
- `npm test` (14:39:40Z) → tests 156, pass 156, fail 0.
- `node scripts/r1.mjs --hashes` vs `fixtures/r1/lock.json` → 0 mismatches (11 files, 7 dependencies, `vendor_tree`).
- Gates hash (PLAN "## Pre-registered Day-1 tests" to "## Day plan", CRLF → LF): `ca0c9feb568e7c9c4ea41832607f510af0cbf5548242adcd77f729e039af3362`, unchanged.
- `git status --short --ignored` before and after `npm test`: see "Isolation" below.

## D-39 categories → tests
| Category (D-39) | Tests |
|---|---|
| Delayed sends | T1, T1 order (vendor); T3, T4, T21 (sendguard); T21 vendored ×2; "a send that arrives after its action resolved is refused" (speech); T5, T20 |
| Cancellation | T3, T22, "stop calls the cancel of a live dispatch" (sendguard); T1, T6, "a gate stop kills the running child" (vendor); T12 ×5, B02, "D-39 abort: a signal during the foreground check" (speech) |
| Cleanup | T5 runner, T6 runner, T12 live/quiet/deadline/crash, M02, "D-37 abort: the aborted summary is on disk before cleanup" |
| Evidence failures | T13 ×2, T14, T15, T24 diag, T24 workflow, T24 scrubLog, "evidence folder deleted mid-run" |
| Focus loss | T7 ×2 runner, T7 gate, "gate pre-check fails before the first send", "a hung probe", T19 runner, T26 runner |

## Replaced tests (old → new)
`test/speech.test.mjs` (14):
| Old (D-37) | New |
|---|---|
| SIGINT mid-step: cleanup tried, partial evidence "aborted", exit 130 | SIGINT mid-step: one teardown: … exit 130 |
| second SIGINT exits at once even while cleanup hangs | B02: later signals during teardown are logged, not an exit; one exit after cleanup (**spec change**: B02 reverses C3's immediate exit; the teardown keeps its own deadline) |
| D-37 runner: every physical send has a passing check right before and right after it | D-39 runner: … ; page keys acknowledged |
| D-37 runner: window changes during a send -> … | T7 runner: same, plus T7 overlapped with SIGINT |
| D-37 runner: guard pre-check fails before the first send -> … | D-39 runner: gate pre-check fails … |
| D-37 runner: a hung probe inside the guard … | D-39 runner: a hung probe inside the gate … |
| D-37 runner: an action timeout stops the guard … | D-39 runner: an action timeout stops the gate … |
| D-37 runner: repository change before a step … (M-07) | D-39 runner: same (M-07) |
| D-37 summary: cleanup errors, a missing raw log, a guard stop or a crash rule out PASS (M-02) | M02 summary: same, plus safety first even when aborted |
| D-37 abort: the aborted summary is on disk before cleanup starts; the guard is stopped (M-05) | D-37 abort: … the gate is stopped (M-05) |
| D-37 runner: a send that arrives after its action resolved is refused … | D-39 runner: same |
| D-37 cleanup: a send that outlived its bound keeps the page open; NVDA still stops (B-02) | T5 runner, T6 runner, T12 live send at a signal |
| D-37 abort: a signal during the foreground check before a key -> that key is never sent (M-01) | D-39 abort: same |
| r1.mjs: send guard hooked and checked, dependency lock and workflow guard, all before Guidepup loads (D-37) | T11/T12/T17/T18 r1.mjs source test |

`test/sendguard.test.mjs` (22 D-37 tests; the file was never committed, names from this session's transcript):
| Old (D-37) | New |
|---|---|
| guard: armed and in front -> checked immediately before and after the one physical send | gate: armed -> pre-check, one dispatch, ack, post-check, in that order |
| guard: a send outside an action is refused and stops the guard | gate: a send outside an action is refused before any check … |
| guard: pre-check mismatch -> zero sends, stopped, later sends refused too | gate: a check that throws, returns no verdict, or a mismatch -> zero sends |
| guard: a check that throws, rejects, returns no verdict or is missing -> zero sends | same; gate: no check, no ack reader, or a failing integrity check -> refused |
| guard: a check that times out -> zero sends, and its late "ok" cannot release the key | T4 gate |
| guard: stop or disarm while the pre-check is pending -> the key is not sent | T3 gate; "the action ended between check and commit" |
| guard: post-check mismatch -> one send, stopped as possibly misdelivered | T7 gate |
| guard: a send that throws or hangs is uncertain -> … | gate: a dispatch that throws …; T5 (vendor) |
| guard: concurrent sends run one at a time, each with its own pre and post check | T9 gate, T9 vendor (concurrency is now refused, not queued) |
| guard: idle() waits for a send in flight, and reports a timeout | gate: idle waits … |
| install: patches the real NVDAClient.prototype.sendKeyCode and runVbsScript export; verify and uninstall | gone with the hooks; r1Gate (vendor), T10 integrity |
| install: verify() reports a hook that was replaced or removed after install | T10 ×2 (vendor) |
| install: an ESM import of Guidepup sees the same patched module (one cached copy) | T11 (vendor), `upstreamLoaded` before and after in r1.mjs |
| inventory: every key-sending call site in lib/windows is one of the two hooked paths | T25 call-site inventory over the vendored tree |
| inventory: sendKeyCode lines 185/188 … 97/98 are the connect handshake | T25; NVDA key: canonical bytes (vendor) |
| lock: the hooked Guidepup files match their pinned sha256 (raw bytes) and version 0.36.4 | T16 ×2 (vendor); lock `dependencies` kept |
| real NVDAClient + sendKeys: typing "ad" … checks every Control and every character | T14 (speech); runSendKeys: one gated cscript per character |
| real NVDAClient capture: foreground lost before the Control send -> no key written at all | stop-speech is awaited and gated before the action key; T8 |
| real NVDAClient capture: the internal stopSpeech Control and the NVDA command are each checked … | stop-speech is awaited and gated …; D-39 runner every send checked |
| real NVDAClient capture: window changes during the Control send -> stopped, Tab never written | T8; T7 runner |
| real NVDAClient: a stopSpeech Control from a late loop, outside any action, is refused | gate: a send outside an action is refused; D-39 runner late send |
| real NVDAClient: a timed-out action that resumes later cannot send its key | D-39 runner: an action timeout …; T21 vendored ×2 |
| real sendKeys: each typed character is one checked SendKeys script; none when disarmed | runSendKeys: one gated cscript per character; T23 |
| runVbsScript hook: anything but one SendKeys line is refused and stops the guard | T23 (allow-list, `runVbsScript` disabled) |

**Test edited in this cycle (please judge):** `test/vendor.test.mjs`, written test-first in D-39, first expected the generic VKs Shift 16 and Control 17. Upstream `KeyCodes.js` sends the left-hand codes 160 and 162. Claude changed the 4 expectations to 160/162 and added 2 assertions that tie them to the vendored `Modifiers.Shift` and `keyCodeCommands.stopSpeech` bytes. No threshold or rule changed.

## Disclosures (D-40 and design choices)
- **Cancellation (D-40).** A gate stop prevents every later send. It cannot recall an OS operation already launched: a chord already written to the NVDA socket, a character `cscript` has already sent. A stop kills a running `cscript`; a send still live at teardown is reported and the page is left open. Both best effort. Wording in `VENDORED.md` "Limits (D-40)" and PLAN.
- **Cleanup is best effort (D-40).** `LIVE_WAIT_MS` 60 s; the deadline is `liveWaitMs + 8 × cleanup_timeout_ms`. GitHub Actions can end a cancelled step sooner (CITED, your GH-CANCEL: 7.5 s, then 2.5 s); then nothing of ours runs. The summary is written synchronously first.
- **NVDA control keys in the page counter (D-40, T26).** INFERENCE, not measured on real NVDA: the stop-speech Control and Insert can reach the page as `keydown`. `pageAck` ignores Control, Shift and Insert inside a window, so they neither fail an unrelated action's ack nor stand in for it. A window ends at the first Control after the first non-ignored key. T26 covers before, between, after and late.
- **One `setImmediate` turn after each action (INFERENCE design choice).** `key()` in `capture.mjs` waits one event-loop turn after `guard.disarm()` and before `idle()`. Without it, a send queued as the action ended was refused only after the next action had sent its own stopSpeech, which made the physical-send count wrong (a test failure, 3 vs 2). The turn catches only sends queued at that moment. Later strays are left to the gate's refusals (no action armed) and the page acks.
- **Evidence contract** is stricter than S-04's text: once R1 ran, every `r1-*` folder must hold `summary.json`, and there must be at least one. An early refusal (exit 2, no folder) therefore also fails the contract step, after the upload.
- **`--scrub-log`** runs before the CI guard (like `--hashes`), so the diagnostic step can use it after a refusal. It reads one file and writes one file; it starts nothing.

## Mutations (scratch copy outside the repo)
Layout: the tracked and untracked files (`git ls-files --cached --others --exclude-standard`, so no `.env`) copied to the scratchpad; `node_modules/@guidepup` copied physically, every other `node_modules` entry a junction. A single junction for all of `node_modules` made T11 fail at baseline, because Node caches the upstream modules under their real path outside the copy.

Measured 2026-10-27, second run (`mutate.mjs`, 156 tests at baseline). Each mutation is applied, `node --test test/*.test.mjs` runs in the copy, the file is restored.

| # | Mutation | Result | Behaviour tests that fail (besides the T16 tree-hash tests) |
|---|---|---|---|
| 1 | drop the commit check (NVDAClient) | CAUGHT, 3 of 156 | T21 vendored NVDA key |
| 1b | drop the commit check (runVbsScript) | CAUGHT, 3 | T21 vendored runSendKeys |
| 2 | admit before the temp-file preparation | CAUGHT, 3 | T1 runSendKeys order |
| 3 | restore the reconnect after connect | CAUGHT, 3 | T2 |
| 4 | un-await stopSpeech | CAUGHT, 3 | T8 |
| 5 | un-freeze `NVDAClient.prototype` | CAUGHT, 3 | T10 |
| 6 | remove the character allow-list | CAUGHT, 3 | T23 |
| 7 | restore `killAll()` in r1.mjs | CAUGHT, 1 | T11/T12/T17/T18 r1.mjs source test only |
| 8 | remove the Playwright signal options | CAUGHT, 1 | same source test only |
| 9 | restore the teardown.js signal handlers | CAUGHT, 3 | T18 |
| 10 | skip the page ack (sendguard) | CAUGHT, 8 | gate order, T19 ×2, T20, … |
| 11 | skip the stable-summary loop | CAUGHT, 2 | T13, "evidence folder deleted mid-run" |
| 12 | remove the sandbox's `tls.connect` stub | CAUGHT, 13 | T0, r1Gate, NVDA key ×2, … |

Caught 13 of 13; restored copy: tests 156, pass 156, fail 0.
In the first run (before the 3 tests were added), 1, 1b and 2 were caught only by the T16 hashes; the T21 vendored ×2 and T1 order tests were added for that reason. Mutations 7 and 8 are caught only by a source-text test of r1.mjs: there is no offline test that runs r1.mjs end to end.

## Isolation
`git status --short --ignored` saved before the mutation runs and again after them and the final `npm test` (14:39Z): identical. Nothing under `docs/evidence/` changed. The mutation runs used only the scratch copy.

## Questions
1. **Send boundary (D37-B01).** Is every path in the vendored tree that reaches the NVDA socket `.write`, `execFile` or any process/input call gated by `admit` → same-turn `commit`? Check T25's patterns against the source yourself. Can anything in the tree, in Playwright (`page.evaluate` is the only page call besides `goto`/`addInitScript`), or in `r1.mjs` send input without the gate?
2. **Commit and freshness.** Is "admit (check) → commit in the same turn → write/launch" true on both paths? Is `maxAgeMs` 100 enforced at commit? Can a stale or other-epoch token commit?
3. **Page ack (decision 1, T19, T26).** Is the window rule sound? Can an ignored key hide a misdelivered key? Is `final()` enough for keys after the last ack? Is `{ack: null}` for NVDA-consumed sends correctly not counted as confirmed?
4. **Teardown (D37-B02, B02).** One exit path from every signal, crash and the run's end? Can anything exit, close or kill the browser while a send is live? Is the order (gate stop → partial + summary sync → quiesce → close only if quiet → `nvda.stop` last → rewrite → exit once) followed? Is ignoring a later entry right?
5. **Evidence (M02, M03, S-04).** Safety-first result rules, the 3-write stable loop, `recovered-*`, stderr fallback, the contract step and `summary_files`.
6. **Your D-37 findings.** For each of D37-B01, D37-B02, D37-M01..M04: fixed, partly fixed, or not fixed, with the evidence.
7. **Vendoring and provenance.** Is the vendored tree byte-identical to the installed 0.36.4 except the 5 changed and 1 added files? Are the MIT attribution and header lines adequate? Is keeping `dependencies` in the lock (A11) right?
8. **Mutations.** Re-run the set above and add your own; a mutation no test catches, or one caught only by a hash, is a finding.

## Calls Claude made (not chosen by the user; flag any you disagree with)
- The `setImmediate` turn in `key()` (above).
- `--scrub-log` exits 0 when the log is missing (prints "no log at …"); a scrub failure fails the diagnostic step but not the upload (`if: always()`).
- The evidence contract strictness (above).
- The versions record names Guidepup `0.36.4 (vendored, D-39)` and reads NVDA's version from the vendored `manifest.json`.
- `r1.mjs` runs `vendorIntegrity` once before Playwright loads, as well as in every admit.
- The page counter is a non-writable, non-configurable `window.__r1Keys` filled by a capture-phase `keydown` listener on `window`.
- Three tests added after the first mutation run: T21 vendored (NVDA and runSendKeys) and T1 order.

## Known limits (do not claim otherwise)
- The OS delivery race between the foreground read and the key reaching a window remains. The ack and the post-check detect a misdirected key afterwards; they do not prevent it.
- NVDA-consumed keys (NVDA+T, the stop-speech Control) cannot be acknowledged by the page; only their foreground checks apply.
- A whole chord is one send: one check before the first key-down, one after the ack.
- `quit` (`spawnSync`, 30 s) is not supervised.
- Behaviour on the real hosted desktop is measured only by the R1 run; the offline tests fake Node's built-ins.
- The workflow-identity checks guard against accidental use; they do not attest the machine.
