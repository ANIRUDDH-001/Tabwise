# Vendored @guidepup/guidepup 0.36.4 (R1, D-39)

R1 loads Guidepup from this folder, never from `node_modules`. Every key it sends passes the send gate in `src/speech/sendguard.mjs`.

## Source
- Package: `@guidepup/guidepup` 0.36.4 from npm (`https://registry.npmjs.org/@guidepup/guidepup/-/guidepup-0.36.4.tgz`).
- npm integrity, from `package-lock.json`: `sha512-LgF945tl7dYQmUwD8wRgBcUM0sM5SWJd2M4Mmefq6ly7nXwopHre1Xd82DL8luWninvuTHQLrW97viOzgM5ovg==`.
- License: MIT, © 2023 Craig Morten. `LICENSE` is the upstream file, unchanged.
- Contents: `package.json`, `manifest.json`, `LICENSE`, plus the `require()` closure of `lib/windows/NVDA/NVDA.js`.
- Every file not listed below is byte-identical to the installed upstream file.
- `vendor/** -text` in `.gitattributes` keeps line endings as npm ships them.

## Changed and added files
Each changed file starts with an R1 modification and MIT attribution header. Original five files retain D-39; start.js, quit.js and isRunning.js identify D-43. D-43 updates are described below; prior review records are retained.

| File | Upstream sha256 | Vendored sha256 | Change |
|---|---|---|---|
| `lib/teardown.js` | `85c5de413c0e46ab607c9e06c489286dfd2abcbaacd43eb095d3e3908edc01d6` | `0f1d069f1c07b0360bfd3286510b8548512d314453f0ad9bdad10c20c4c4648f` | No process signal listeners; the single runner teardown owns lifetime. |
| `lib/windows/NVDA/NVDA.js` | `b6d00ae05ea4a26832167de80d3a9bfff27181d496f09a82d1e561f88c757e1d` | `03b4c16a5eb2e87327e9b849826d5803c44cf1697c4d54734f49821dbb989583` | Sequential click chords; frozen tables, prototypes and lifecycle exports; bounded reset/start/cleanup with owned process and relay PID equality. |
| `lib/windows/NVDA/NVDAClient.js` | `5b2fe4bdda79b780048a3520fb223e0fe465c8502d634d7206b41395ee10372b` | `f8e5feb2487a64de1f0c5d13c15f899b52ecdd84bee37e37ec839c87bc8700f7` | Private gated chord writes; awaited stop speech; bounded handshake/write, no reconnect; newline framing; fail closed on malformed, truncated, oversized input or unexpected connection loss. |
| `lib/windows/runVbsScript.js` | `5635545b7b97ea88fb6d754f0cb4d66a47d914ee3dc547fb9d81f0c5c66382fe` | `ddd6cd35e656d1d6e97ce81e6a5cc8ca8e14e9110a1cbca3794e0d0679ba072d` | Generic VBS disabled; allow-listed single-character cscript dispatch after file preparation, admission and synchronous commit; bounded exit and cancellation. |
| `lib/windows/sendKeys.js` | `06a0a436ca0c38e02154f033f5bab22ad9830c54f0437e5807e9f0a9516543d2` | `4d8b920d91f0a262687bb502952885dee25e0343e6a0d162c883af4767fa4438` | Exactly one allow-listed character, then gated runSendKeys. |
| `lib/windows/NVDA/start.js` | `20e7d28399595971cebfa96d0b25582d6362a411235745342f8df846ecf272c8` | `7d234a6d8515015121d894066fc9f95485cce64baa935c71009250f6123ca318` | One owned child; bounded readiness and read-only relay ownership query, never blind retry. |
| `lib/windows/NVDA/quit.js` | `d678d767cc05cac34715a64807a8c326d02e59dddbe3baf0958a268a4688b7fc` | `c65841bb3b5a2b96a5c4d742a93256c2ba500b4a2408af92e1dc9ab79092b8e7` | Asynchronous bounded quit; nonzero status fails; listener disappearance and owned exit required. |
| `lib/windows/NVDA/isRunning.js` | `d3086fd7540e1179b7776741a87c6d9bc6c17998d2933639f81e40edce9cb18e` | `973c6f8eff00584b39bbee8ccc63c7f9270bd1767afae9620bd28eafafc55a1d` | Bounded loopback probe; only ECONNREFUSED establishes absence. |
| `lib/windows/r1Gate.js` | — | `836c3333bffa5f78f361219be01f2339a32f8818a44ba05afbd34b25b06f484f` | Added. One-shot gate registry; no dispatch without a complete gate. |

### NVDAClient changes
- Every chord is admitted by the gate:
  - Admission runs the bounded foreground check.
  - In the same turn, the gate commits and the downs, then the reversed ups, are queued.
  - The last write callback is bounded by `writeMs`. On timeout, the socket is ended, then destroyed.
  - `release` then runs the page acknowledgement and the post-check.
- Key fields are validated. The bytes are built in the order upstream `Key.toJSON` uses, never by calling the key's own `toString`.
- The only other writes are the two handshake messages. Connect resolves only after both have been written and the channel is joined; a failed handshake write rejects connect.
- No reconnect:
  - a socket error after connect leaves the client dead;
  - connect retries stop once the gate has stopped.
- The stop-speech Control is awaited, so a refused or failed one rejects the action.
- The prototype and the module's exports are frozen.

### runVbsScript changes
- `runVbsScript` is disabled (`R1_VBS_DISABLED`).
- `runSendKeys(character)`:
  - takes one character from `[A-Za-z0-9@.]`;
  - writes a one-line SendKeys script;
  - asks the gate, then commits and launches `cscript` hidden, in the same turn;
  - bounds the child's exit by `sendMs`, then by `killMs` after a kill;
  - releases a child that still has not exited as not ended. That child settles when it exits.
- `execFile` is captured at load.

## Limits (D-40)
- Stopping the gate prevents every later send.
- It cannot recall an OS operation that has already launched:
  - a chord already written to the NVDA socket;
  - a character `cscript` has already sent.
- A stop kills a running `cscript`, and the run reports any send still live at teardown. Both are best effort.

## Checks
- `node --test test/vendor.test.mjs` runs the vendored code in a sandbox with no NVDA, cscript, socket or desktop input. It also compares this tree with the installed upstream package (`checkVendor`).
- `fixtures/r1/lock.json` `vendor_tree` pins the hash of the whole tree (`treeHash`).
