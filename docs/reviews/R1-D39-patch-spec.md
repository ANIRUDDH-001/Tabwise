# Spec for approval: vendored Guidepup send boundary for R1 (D-39)

Draft by claude, 2026-10-27, rev 3. Rev 2 was red-teamed (round 1, the table at the end) and **approved by the user (D-40)** with decisions 1 page-keydown ack, 2 sequential click, 3 cscript per character with ack. Rev 3 adds only the qualifications D-40 asked for (marked D-40).
On approval its rules move into `docs/ledger/PLAN.md` § F-02 as amendments A7–A11 and S10–S13. Gates (lines 7–37) stay untouched.

## Goal
Every key that Guidepup's Windows NVDA code sends during R1:
- gets a foreground check right before it is committed, with no awaited work between the commit and the hand-off to Node or the OS;
- is confirmed after dispatch, where it can be: our page saw the key;
- gets a foreground check after that.

When the run stops, nothing admitted but not yet committed can still dispatch. **(D-40) Cancellation prevents new sends; it cannot recall an OS operation already launched**: bytes already handed to the socket, or a cscript process already started, may still deliver their key. Stopping kills a live cscript child and ends the socket, best effort, and the run is then FAIL (possibly misdelivered) unless the ack and post-check show the key landed on our page. The target page is not removed while a send might still land, within a stated time bound.
**What remains, stated honestly (D-39):**
- (a) The native race between the last foreground read and Windows delivering the key. A check cannot remove it.
- (b) For the 19 typed characters, a process start-up gap after the commit: cscript starts and parses its script, then calls SendKeys. This is **not** the native gap. Decision 3 chooses how to handle it.
- (c) NVDA's own processing after the socket hand-off.

The page acknowledgement detects a key that went elsewhere afterwards; it does not prevent it. R1 runs only on the disposable GitHub-hosted Windows VM (D-36, D-39).

## Facts this rests on
| # | Fact | Label |
|---|---|---|
| F1 | Guidepup 0.36.4 Windows keys leave the process at exactly 2 places: `NVDAClient #send` → `socket.write` (NVDA commands, `press`, `perform`, the `stopSpeech` Control) and `runVbsScript` → `execFile("cscript")` (one SendKeys script per typed character) | CITED, installed `lib/windows/NVDA/NVDAClient.js`, `runVbsScript.js`, `sendKeys.js`; Codex D-37 Q1 |
| F2 | `runVbsScript` awaits `realpath`, `mkdtemp` and `writeFile` before `execFile`. `#send` awaits `connect()` when the socket is destroyed. `connect` retries up to 20 times, every 500 ms, on `error` | CITED, `runVbsScript.js:11-25`; `NVDAClient.js #send`, `#connect` |
| F3 | `#stopReading` calls `sendKeyCode(stopSpeech)` without awaiting it. `click` sends chords concurrently | CITED, `NVDAClient.js #stopReading`; `NVDA.js:755` |
| F4 | `sendKeyCode` writes each key-down and key-up with an `await` between them. Messages are JSON built by `Key.toJSON` from `scanCode`, `extended`, `keyCode` | CITED, `NVDAClient.js`; `Key.js:15-27` |
| F5 | The require closure of `lib/windows/NVDA/NVDA.js` is 36 files (35 `.js` + `manifest.json`), 132 671 bytes, needing only Node built-ins. 8 of those files start processes, open connections or write files: `start.js` spawn, `quit.js` spawnSync, `isRunning.js` net.connect, `config/*` rmSync/cpSync under the Guidepup cache, `NVDAClient.js` tls, `runVbsScript.js` execFile | MEASURED, closure walk 2026-10-27; red-team round 1 |
| F6 | Playwright 1.64.1 installs SIGINT/SIGTERM/SIGHUP handlers that close launched browsers (and exit 130 on SIGINT), and an `exit` handler that kills them. The launch options `handleSIGINT/SIGTERM/SIGHUP: false` turn off the signal handlers; the exit handler stays | CITED, `playwright-core/lib/coreBundle.js:9971-10030`; Playwright docs `params.md` `browser-option-handlesigint` via ctx7 `/microsoft/playwright`; `types.d.ts:18278-18283` (red-team) |
| F7 | Guidepup's `teardown.js` handles SIGINT/SIGTERM/SIGQUIT/SIGHUP/beforeExit and runs `nvda.stop` → `client.stop` → blocking `spawnSync` quit (up to 30 s), alongside any handler of ours | CITED, `lib/teardown.js:16-22`; `NVDA.js` stop; `quit.js` |
| F8 | Guidepup is MIT, © 2023 Craig Morten | CITED, installed `LICENSE`, `package.json` |
| F9 | This dev laptop has a Guidepup NVDA cache under `%LOCALAPPDATA%\guidepup`. Code that reaches `nvda.start()` here would start real NVDA | MEASURED, `existsSync` 2026-10-27; red-team round 1 |
| F10 | `core.autocrlf=true` here, and `.gitattributes` has no rule for `vendor/` | MEASURED, `git config`, `.gitattributes` |
| F11 | R1 steps: pressed keys `Tab`, `Space`, `Enter`, `Shift+Tab` (8 sends) and typed characters drawn from `Ada@exmpl.ts` (19 sends). No SendKeys special characters (`+^%~(){}[]`, quotes, newlines) | MEASURED, `fixtures/r1/steps.json` |

## What gets vendored (narrow)
- `vendor/guidepup-0.36.4-r1/` holds the 36-file closure (F5) at the same relative paths, plus the upstream `LICENSE` and `package.json`, unchanged.
- Two files are added: `VENDORED.md` and `lib/windows/r1Gate.js`.
  - `VENDORED.md` gives the source, version, licence and reason, and lists every changed file with its upstream and patched SHA-256 and a one-line reason.
- No macOS, Linux or other package code is copied.
- `.gitattributes` gains `vendor/** -text` (F10), so the bytes stay identical to npm's.
- `package.json` and `package-lock.json` do not change; nothing is installed or upgraded. The installed `@guidepup/guidepup@0.36.4` stays, because `@guidepup/setup` uses it to prepare the VM and install NVDA.
- `scripts/r1.mjs` loads `vendor/…/lib/windows/NVDA/NVDA.js` and never imports `@guidepup/guidepup`. Before and after loading, and before every action, it refuses if any `node_modules/@guidepup/guidepup/lib/` module is in `require.cache`.
- Each changed upstream file starts with: `Modified for R1 (D-39) from @guidepup/guidepup 0.36.4, MIT © 2023 Craig Morten; see VENDORED.md`.

## The patch: 5 files changed, 1 added; all other vendored files byte-identical to upstream
| File | Change |
|---|---|
| `lib/windows/r1Gate.js` (new) | `setGate(gate)` is one-shot: a second call throws. `getGate()` throws if no gate is set (fail closed). The exports are frozen. |
| `lib/windows/NVDA/NVDAClient.js` | **(1)** Two private write paths. `#handshake(msg)` accepts only the 2 constant join/protocol messages. `#sendChord(keys)` is the only key path, and it builds each message itself from validated integers (`scanCode`, `vk`, `extended` boolean), not from `Key.toString`. **(2)** No reconnect, ever. A missing or destroyed socket throws `R1_NO_SOCKET` and writes nothing. A socket `error` after a successful connect sets the client dead (no retry). Retries happen only before the first successful connect, and stop at once when the gate is stopped. **(3)** `token = await gate.admit(info)` (bounded foreground check). Then, synchronously in one turn: `gate.commit(token)` (throws unless still valid), then `socket.write` of **all** key-down then key-up messages of the chord, in order. That turn only queues them; the kernel flush may take later turns, which is disclosed. Then it awaits the last write callback, bounded. On a timeout it ends the socket (flushing what is queued, key-ups included) before destroying it, and the send is possibly misdelivered. Then `await gate.release(token)`. **(4)** `#stopReading` awaits `sendKeyCode(stopSpeech)`, so a refused or failed Control rejects the action. This adds the check time to each stop-speech pass; disclosed, no threshold changes. **(5)** `Object.freeze` on `NVDAClient.prototype`. |
| `lib/windows/runVbsScript.js` | **(1)** `runSendKeys(ch)` accepts exactly one character from the allow-list `[A-Za-z0-9@.]` (covers F11). Anything else throws before any work. **(2)** It makes the temp dir and file first, then `await gate.admit(info)`. Then, synchronously: `gate.commit(token)` and `execFile("cscript", …)`, with `execFile` captured at module load. Then it awaits the child's `exit`. If the gate stops or the bound passes, it kills the child and awaits `exit`. Then `gate.release(token)` and removes the dir. **(3)** The generic `runVbsScript` export throws `R1_VBS_DISABLED`. |
| `lib/windows/sendKeys.js` | Calls `runSendKeys(character)`. A modifier or multi-character command throws. |
| `lib/windows/NVDA/NVDA.js` | `click` sends one chord after another instead of `Promise.all` (decision 2). After load, `Object.freeze` on `Key.prototype`, `keyCodeCommands`, `KeyCodes`, `Modifiers` and their entries. |
| `lib/teardown.js` | Installs **no** process signal or `beforeExit` handlers; `addTeardownHandler` only records. Our single teardown calls `nvda.stop()` itself, last (F7). |

Our gate (`src/speech/sendguard.mjs`, rewritten; the name is kept):
- `admit(info)` throws, with a sticky stop, when any of these holds:
  - the gate is stopped;
  - it is not armed;
  - another send is in flight;
  - the integrity check fails.

  Otherwise it runs the bounded check (PID + nonce, `checkMs` 2000); a failed, thrown, timed-out or missing verdict stops the gate and throws. It returns `{id, action, epoch, at}`.
- `commit(token)` is synchronous. It returns true only when:
  - the gate is not stopped;
  - `token.epoch` is the current epoch;
  - the gate is still armed for `token.action`;
  - nothing is in flight;
  - `now − token.at ≤ maxAgeMs` (100 ms).

  Every stop bumps the epoch.
- `release(token, outcome)`:
  - **Acknowledgement first (decision 1).** For keys that reach the page (Tab, Space, Enter, Shift+Tab, typed characters), it waits up to `ackMs` (1000) for our page's key log to show the expected key exactly once since the last acknowledged position. (D-40) Modifier-only events (`Control`, `Shift`, `Insert`), which NVDA's own control keystrokes and SendKeys' Shift produce, are tolerated in any window and never count as the action's key. The counter is a capture-phase `keydown` listener the runner installs with `page.addInitScript`. It is read with `page.evaluate`, which sends no input; the fixture file is unchanged. A missing or extra key means possibly misdelivered: FAIL. NVDA-consumed keys (`NVDA+T`, `stopSpeech` Control) are recorded `ack: null` (they cannot be confirmed) and disclosed.
  - Then `settleMs` 50 and the post-check. A mismatch, a send error or a missing ack is a sticky stop with `misdelivered`.
  - It clears the in-flight mark only after dispatch has positively ended: the write callback fired or the socket was destroyed, or the child exited.
- `quiesce(ms)` returns `{quiet: true}` only when nothing is in flight and no child is alive.
- `integrity()` checks:
  - the vendored prototypes and tables are frozen;
  - `getGate()` is this gate;
  - no upstream Guidepup `lib/` module is loaded.

## Lifecycle and evidence fixes
| ID | Fix |
|---|---|
| B02 | **One teardown, `teardown(reason)`, entered from every path:** completion, an exception, an unhandled rejection, the first and any later SIGINT/SIGTERM/SIGBREAK/SIGHUP, and the crash deadline. Its steps: (1) stop the gate (epoch bump). (2) Write the summary synchronously (M03). (3) `quiesce`: kill live cscript children and await their `exit`, up to `liveWaitMs` (60 s). (4) If quiet: close the page (kill if the close fails), awaited, errors kept. (5) If still not quiet after `liveWaitMs`: do not close or kill the page; log `live send at teardown`; rewrite the summary; then exit on purpose. Disclosed: Playwright's exit handler (F6) then kills the browser while a child may be alive. (6) `nvda.stop()` last, because its `spawnSync` blocks the event loop (F7). (7) Exit. A later signal during teardown does not exit immediately; it is logged, and teardown continues within its budget. Launch options `handleSIGINT/SIGTERM/SIGHUP: false` (F6). `killAll()` and every other `process.exit` path in `r1.mjs` are removed except teardown's. **Budget:** `liveWaitMs` plus cleanup stays under the R1 step's 30-min timeout, so the `always()` upload step still runs. INFERENCE: GitHub runs `always()` steps after a step times out; we are relying on that. |
| M02 | `writeSummary` loops until the summary is stable, at most 3 rounds: build → write → re-read the journal check **and** the write errors (including `summary.json`'s) → rebuild if anything changed. Still unstable after 3 rounds, or the final write failed: the returned summary is `result: FAIL` (`summary.json not persisted` / `summary not stable`) and goes to stderr. **Safety first:** possible misdelivery, a missing ack, an unsettled send, interference or damaged evidence makes it FAIL even when `status` is `aborted` or `crashed`; a clean abort stays PARTIAL. |
| M03 | (1) Before each physical send, an `intent` line (step, action, key, send number). After each action, an `action` line with its phrase and ack. (2) On abort or crash, the partial step record (`partial: true`) is written in teardown step 2, before anything slow. (3) Summary not persisted → the scrubbed summary and the writer diagnostics go to stderr (the CI log). (4) A file found missing or changed → `recovered-<name>` from the journal; the damage flag stays; if that write fails, the journal goes to stderr. **Budget:** CITED, Codex GH-CANCEL: GitHub escalates after 7.5 s, then 2.5 s. The summary write is synchronous and comes first, so it fits. Cleanup may not; the VM ends what is left. Disclosed. |
| M04 | The gate is called from inside private write paths that outside code cannot reach. The prototypes and command tables are frozen. Messages are built from validated integers. `integrity()` runs in every `admit`. Tests replace or redefine the public methods and tables after start and show zero ungated writes or `execFile` calls (T10). |
| M-06 | The first error goes to the CI log before the step record write. |
| S-04 | Workflow step `Evidence contract` (`if: always()`, after upload): fails the job when the R1 step ran and no `r1-evidence/r1-*/summary.json` exists. `_runner/job.json` lists `summary_files`. `nvda.log` is copied through `scrub()` and capped at 1 MB. |
| N-02 | New append-only `docs/ledger/RUNS.md`, the scored-run register: run id, workflow run id, commit, approving decision, result. The PLAN F-02 amendment states that D-36 replaces the frozen host wording. FEATURES.json is not edited. |

## Tests first (offline: no NVDA, no cscript, no network, no desktop input)
**T0 sandbox (red-team blocker):** `test/helpers/sandbox.mjs` is imported first by every test file that loads vendored code. Before any vendored module loads, it does three things:
- replaces every `child_process` function (`spawn`, `spawnSync`, `exec*`, `execFile*`, `fork`), `net.connect`/`createConnection` and `tls.connect` with stubs that **throw**, unless a test installs its own fake;
- sets `GUIDEPUP_SCREEN_READERS_PATH` and `LOCALAPPDATA` to an empty temp folder, so `isNVDAInstalled()` is false and the config code touches only temp (F9);
- uses a fresh module cache for the vendored tree in each test.

T0 itself checks that each stub throws and that the real cache is not used. Tests drive the vendored `NVDAClient`, `sendKeys` and `runSendKeys` directly, with fakes at those built-ins. They never call the vendored `NVDA.start()`.

| # | Negative test | Expected |
|---|---|---|
| T1 | VBS preparation held past the bound, gate stopped, then the hold released | 0 `execFile` calls |
| T2 | Socket destroyed before a key; socket `error` after connect | 0 writes, 0 connects, action rejects, run stops |
| T3 | Gate stopped while `admit`'s check is pending; the check then says OK | 0 sends; epoch refusal recorded |
| T4 | Pre-check OK after its timeout | 0 sends |
| T5 | Write callback never fires | key-ups flushed via `end`, then destroy; misdelivered; FAIL; page not closed until quiet |
| T6 | cscript child never exits | killed, exit awaited ≤ `liveWaitMs`; no page close while live; then a deliberate exit, logged |
| T7 | Focus change during a send (post-check mismatch), also overlapped with SIGINT | FAIL, not PARTIAL; no further sends |
| T8 | `stopSpeech` refused or failing | action rejects; no unhandled rejection; stop |
| T9 | Two concurrent chords | second `commit` refused; stop |
| T10 | Replacing or redefining `sendKeyCode`, `sendKeys`, `runSendKeys`, `Key.prototype.toJSON` or a `keyCodeCommands` entry after a passing start | throws or no effect; 0 ungated writes or `execFile`; `integrity()` stops the run |
| T11 | An upstream Guidepup `lib/` module present via `require` and via `import()` | runner refuses |
| T12 | `r1.mjs` epilogue and all signal, deadline and crash entries go through `teardown`, live and quiet | live: no close or kill until `liveWaitMs`; quiet: one awaited close; one exit path |
| T13 | Only `summary.json` fails (EACCES, no extra file); summary not stable after 3 rounds | FAIL, `persisted: false`, diagnostics on stderr |
| T14 | Abort while typing character 2 of step 2 | `intent`/`action` lines for A and d, and a `partial` record on disk, before slow cleanup |
| T15 | Evidence file deleted mid-run | `recovered-<name>`; damage flag; FAIL |
| T16 | Vendor tree, walked on disk (not from a list): every file other than the 5 changed and 1 added is byte-identical to the installed upstream; no extra files (including extensionless); no CR bytes; the closure walk equals the file set; `VENDORED.md` hashes match | pass; any drift fails |
| T17 | Lock `vendor_tree` hash (walked: sorted paths + per-file SHA-256) mismatch | runner refuses before loading anything vendored |
| T18 | Launch options include `handleSIGINT/SIGTERM/SIGHUP: false`; vendored `teardown.js` adds no process listeners | pass |
| T19 | Ack: counter short by 1, or 1 extra; ack late after `ackMs` | possibly misdelivered; FAIL |
| T20 | Write callback delayed, then the post-check | the post-check runs only after the callback (no early post-check) |
| T21 | Event-loop stall longer than `maxAgeMs` between `admit` and `commit` | commit refused; 0 sends |
| T22 | `connect` error retries after the gate stopped | no further retries; no handshake writes |
| T23 | A character outside the allow-list (`+`, `"`, newline, `{`) and a multi-character `sendKeys` | throws; 0 `execFile` |
| T24 | M-06 order; S-04 contract step and `nvda.log` scrub in `r1.yml` | first error before record; workflow assertions pass |
| T26 | (D-40) NVDA control keystrokes in the page counter: the `stopSpeech` Control and the NVDA key (Insert) appear as page `keydown` events before, between and after an action's own key, including late ones from an earlier send | they do not invalidate the action's ack (modifier-only events are tolerated); the action's own key is still required exactly once; any other extra key still FAILs |
| T25 | Call-site inventory over the vendored tree: `.write(` only in the 2 private paths; `execFile` only in `runSendKeys`; spawn calls only in `start.js`/`quit.js` | pass |

Existing tests of the D-37 wrappers (`installSendGuard`, hooking upstream modules) are **replaced, not weakened**. The brief lists each replaced test next to the test that now covers its property, for example the SENDKEYS refusal → T23. This is recorded as a spec change.

## Files touched
- **New:**
  - `vendor/guidepup-0.36.4-r1/**`
  - `test/vendor.test.mjs`
  - `test/helpers/sandbox.mjs`
  - `docs/ledger/RUNS.md`
  - `docs/reviews/R1-D39-review-brief.md`
- **Changed:**
  - `src/speech/sendguard.mjs`
  - `src/speech/capture.mjs`
  - `scripts/r1.mjs`
  - `test/sendguard.test.mjs`
  - `test/speech.test.mjs`
  - `.gitattributes`
  - `.github/workflows/r1.yml` (gated CI config)
  - `fixtures/r1/lock.json` (re-lock; `vendor_tree` replaces `dependencies`; the upstream pins stay as T16's reference)
  - `docs/ledger/PLAN.md` F-02 amendments
  - `PROVENANCE.md` (vendored MIT row, new-work row)
  - `CODEMAP.md`, `DECISIONS.md`, `LOG.jsonl`, `STATE.md`
- **Not touched:** `package.json`, `package-lock.json`, `node_modules/`, `fixtures/r1/signup.html`, `steps.json`, AGENTS.md, the gates section, FEATURES.json.

## Acceptance (before the Codex re-review)
- `npm test` gives 0 failures, with counts quoted from the run. T0–T26 are present and pass; the brief maps each D-39 category (delayed sends, cancellation, cleanup, evidence failures, focus loss) to its tests.
- Mutations run on a scratch copy outside the repo, and each one is caught:
  - drop the `commit` check;
  - `admit` before the temp-file preparation;
  - restore the reconnect;
  - un-await `stopSpeech`;
  - un-freeze;
  - remove the allow-list;
  - restore `killAll()`;
  - remove the Playwright signal options;
  - restore the teardown.js handlers;
  - skip the ack;
  - skip the stable-summary loop;
  - remove a sandbox stub, which T0 must catch.
- `git status --ignored` is identical before and after `npm test`, and `docs/evidence/` is untouched.
- `--hashes` shows 0 mismatches after the re-lock, and the gates hash `ca0c9feb…3362` is unchanged.
- One independent Codex re-review (D-39). **Stop condition:** if any material send-boundary blocker remains, this R1 implementation stops and the reduced-scope alternatives go to the user.

## Cost and time
- $0: no Meta calls, no Actions run, no NVDA.
- INFERENCE: one to one and a half working days including the Codex round. Feature freeze is 2026-11-02 23:59 IST.

## Known limits (stated, not claimed away)
- The native race (a) and NVDA's processing (c) remain. For typed characters the start-up gap (b) remains under decision 3 option A. The ack and post-check detect a misdirected key afterwards; they do not prevent it.
- NVDA-consumed keys (NVDA+T, the stop-speech Control) cannot be acknowledged by the page; only their foreground checks apply.
- A whole chord is one send: one check before the first key-down, one after the ack.
- Bytes handed to the kernel cannot be recalled. Ending the socket on a timeout tries to deliver the key-ups; partial delivery could leave an NVDA key held until `nvda.stop` (INFERENCE).
- The live-send wait is bounded (60 s) and **best effort (D-40)**: GitHub Actions can forcibly terminate a cancelled or timed-out step earlier (CITED, Codex GH-CANCEL: 7.5 s, then 2.5 s), and then nothing of ours runs. After the wait the process exits on purpose, and Playwright's exit handler kills the browser.
- `quit` (`spawnSync`, 30 s) is not supervised. Ctrl+C can also end the PowerShell probe; checks then fail closed.
- Behaviour on the real hosted desktop is measured only by the R1 run; the offline tests fake Node's built-ins.
- The workflow-identity checks guard against accidental use; they do not attest the machine.

## Red-team round 1 (subagent, read-only, 2026-10-27) and response
| # | Finding (severity) | Response |
|---|---|---|
| 1 | Tests could reach real spawn, spawnSync, net, tls or the Guidepup cache; NVDA is installed on this laptop (BLOCKER) | **Accepted.** T0 sandbox, fake cache path, no vendored `NVDA.start()` in tests; F9 measured |
| 2 | The post-check can come before real injection; only the first write is "same turn"; destroying can drop the key-ups (MAJOR) | **Accepted.** Page-key ack (decision 1), `end` before destroy, "queued" wording, T5/T19/T20 |
| 3 | The typing start-up gap is not the native gap (MAJOR) | **Accepted.** Goal wording fixed; decision 3 |
| 4 | Guidepup's teardown.js is a second, blocking teardown (MAJOR) | **Accepted.** 5th changed file; `nvda.stop` last; T18 |
| 5 | "Do not exit" is broken by the second signal, the deadline and SIGBREAK, and waiting forever endangers the upload (MAJOR) | **Accepted.** One teardown from every entry, bounded `liveWaitMs`, SIGBREAK, T12 |
| 6 | CRLF breaks "byte-identical" (MAJOR) | **Accepted.** `vendor/** -text`, no-CR check in T16 |
| 7 | The SENDKEYS refusal is lost; `Key` and the command tables are mutable (MAJOR) | **Accepted.** Allow-list, messages from validated integers, freezing; T10/T23 |
| 8 | Missing tests (MINOR) | **Accepted.** T19–T25 |
| 9 | The lock can be bypassed by an extra file (MINOR) | **Accepted.** T16/T17 walk the tree on disk |
| 10 | Awaiting stopSpeech changes timing (MINOR) | **Accepted as disclosed.** Keeping it unawaited would collide with one-send-in-flight; no threshold changes |

## Decisions for the user
1. Post-send confirmation: the page-key ack (recommended; it detects a misdirected key directly, and the fixture file is unchanged) or settle-only with the gap disclosed.
2. `click`: sequential (recommended) or upstream, with the gate refusing concurrent chords.
3. The typing start-up gap (b): **A**, keep cscript per character with the gap disclosed and the ack detecting misdelivery (recommended: narrow, same SendKeys COM path as upstream). **B**, a SendKeys helper started in advance (WScript.Shell through one persistent process), with the commit triggering one call. A smaller gap, but more patch surface and a new process protocol.
