# F-02 D-43 independent technical review

**Verdict: APPROVE for publication of the exact reviewed code. Remaining material send-boundary or false-PASS blockers found: NO.**

Review completed: 2026-10-28T02:39:46Z, obtained with `date.exe -u`. This verdict covers source and offline software contracts. It does not approve enabling or triggering `.github/workflows/r1.yml`, running NVDA, using the personal desktop, or claiming R1 PASS. Those boundaries remain subject to the user's separate approval. The historical D-39 and D-42 BLOCK reports retain their original meaning and contents.

Evidence classification: **MODEL/L1** for this separate Codex agent's source judgments (same inherited model/vendor as the implementer, so correlated errors remain); **MACHINE/L3** for the narrowly scoped deterministic checks. `MEASURED` below identifies executed checks; `CITED` identifies inspected source or saved run output; `INFERENCE` identifies the resulting assessment. No OBSERVED/L4 Windows or assistive-technology evidence was generated. The exact runtime model ID is not exposed to this reviewer.

## Scope and exact-byte binding

CITED: D-43 in `docs/ledger/DECISIONS.md`, `docs/engineering/F-02-ownership-plan.md`, the experiment record, historical D-39/D-42 reports and specification, actual runner/workflow, foreground and send guards, capture/evidence/summary code, vendor integrity, and all eight changed vendored files. This review traced actual dispatch and lifecycle paths, rather than treating green tests as a safety verdict.

MEASURED FINAL-BYTES: every one of the **61** raw SHA-256 entries in the final source manifest matched the worktree. The manifest's raw SHA-256 is `c53997edeb322b4cabca10a7ebb8519fd70557164ab5b9ae3072482c4a198999`; its complete contents are reproduced below. The last refresh changed only `test/speech.test.mjs` to run the behavioral dependency-admission assertions before the unchanged source assertion; product bytes remained identical to the previously reviewed manifest.

MEASURED INTEGRITY: an independent read-only audit confirmed **12** normalized file/specification hashes, **10** exact upstream pins, **40** vendor files, **8** changed vendor files and **2** added files, with zero hash, pin or vendor-record errors. The vendor-tree hash is `d80eb577e272dd7c16135ebfeaa9e3dc9162308b0ea1323a9b158dcafb774e1d`. Normalized frozen PLAN lines 7-37 hash to `ca0c9feb568e7c9c4ea41832607f510af0cbf5548242adcd77f729e039af3362`, unchanged. `docs/evidence/` is absent. The writer's `final-hash-check.json` also records no original-checkout drift; this reviewer did not independently reconstruct that original-checkout snapshot.

## Material findings discovered and closed during this review

### D43-IR-B01: unexpected connection loss could retain a successful final capture — CLOSED

MEASURED SOCKET-LOSS: before correction, the actual vendored `NVDAClient`, loaded behind the inspected sandbox, received expected final-step speech and then a fake `ECONNRESET`. Its capture resolved successfully, the gate remained unstopped, and a summary built from otherwise complete synthetic attempts returned **PASS**. A next send would reveal the dead socket, but there need not be a next send. This was a material false-PASS path, not a measured wrong-window event.

CITED repair: `vendor/guidepup-0.36.4-r1/lib/windows/NVDA/NVDAClient.js:160` now routes post-connect error through `protocolError`; `:243` and `:244` invalidate unexpected end and close. `disconnect():249` detaches the current socket before destroying it, so intentional cleanup does not trigger the unexpected-loss handler.

MEASURED FINAL SOCKET-LOSS: the same independent probe now stops the gate with the connection-error reason and the summary returns **FAIL** without another key. Repository tests exercise error and close after final speech; mutation `25-disconnect` fails that behavioral test as well as vendor-byte checks.

### D43-IR-B02: a slow log read could confirm a key beyond the acknowledgement deadline — CLOSED

MEASURED ACK-DEADLINE: before correction, with a 20 ms acknowledgement budget, a Tab introduced after 35 ms was accepted when the fake page read returned after 50 ms. The real gate recorded one confirmation and remained unstopped. The outer reader margin did not enforce the exact acknowledgement deadline.

CITED repair: `src/speech/sendguard.mjs:78-85` checks elapsed monotonic time immediately after each awaited log read and before accepting events. The timeout diagnostic preserves the existing missing-key explanation.

MEASURED FINAL ACK-DEADLINE: the unchanged independent late-read probe now records zero confirmations, one missing acknowledgement and possible misdelivery; the gate stops. Mutation `26-ack-deadline` is detected by the specific behavioral regression.

## Other reviewed safety contracts

- CITED and MEASURED: `sendguard.mjs:185-230` requires the pre-send reader, sequences its read before the foreground request, and measures the foreground request, evidence-write and scheduling time through synchronous commit. Frozen gate methods, private admission metadata, action identity, epoch, capability identity and the 100 ms age bound prevent the historical D42-B01 stale-verdict path and D42-M01 missing-capability path. The actual NVDA chord and VBS paths retain commit immediately before dispatch; file preparation precedes admission.
- CITED and MEASURED: `sendguard.mjs:248-258` requires the correct acknowledgement class and an empty reasons array. Null cannot confirm a page-reaching key; contradictory success/failure results fail. Prior stray keys fail the mandatory pre-read. The approved indistinguishable identical-key residual after that snapshot remains.
- CITED and MEASURED: `capture.mjs:182-237` waits for quiescence, collects raw speech, then checks the terminal page log before closing the intended target. An unexplained key introduced during raw collection fails the run. Cleanup errors and raw-log loss remain visible to the summary.
- CITED and MEASURED: the actual TLS client frames newline-delimited messages across split/coalesced chunks and fails malformed, oversized, truncated or unexpectedly lost transport. Tests use fake streams and sockets, not a running relay.
- CITED and MEASURED: `NVDA.js:241-285`, `start.js`, `quit.js` and `isRunning.js` enforce reset/listener disappearance, bounded startup, owned-child liveness and exact relay-owner PID equality. Nonzero quit, persistent listener, owned child alive without a port, foreign relay PID and stop during ownership cannot establish a fresh process. `capture.mjs:281` also validates returned identity before marking `new_process` true. Lifecycle exports and dispatch tables are frozen and checked.
- CITED: `src/speech/browser.mjs:6` disables the three Playwright signal handlers; the runner reaches `finishRun` and its single teardown path. The existing bounded cleanup and Playwright process-exit limitation remain disclosed. Summary persistence, crash precedence, interference and evidence damage continue to rule out PASS.

## Verification and limits of test coverage

MEASURED REVIEWER RUNS:

| Check | Result | Practical limit |
|---|---|---|
| `node --test --test-timeout=10000 test/engineering.test.mjs test/browser.test.mjs` | 22 pass, 0 fail/cancelled | Actual guard, adapter and vendored methods with fake boundaries |
| Final `D39-S02 X04` selected test | 1 pass, 0 fail/cancelled | Executes the runner's dependency-admission expression with incomplete maps |
| Independent final connection-loss and delayed-reader probes | Both fail safely after correction | Synthetic events and complete synthetic attempt records |
| Actual `runR1 -> state.finish -> finishRun -> installTeardown` fake-run probes | Healthy path exits 0; stop failure and unexpected finish rejection exit 1 / FAIL | Runner control flow, not native process cleanup |
| Raw manifest and independent lock/vendor/gates audit | 61 matches; no integrity errors | Byte identity and narrow structural checks |

CITED WRITER RUNS, inspected rather than independently rerun: `full-final-04.txt` reports **191 pass, 0 fail, 0 cancelled**. `docs/engineering/F-02-mutation-results.json` records a 191/191 baseline and **32/32** mutations detected, with no syntax-error or whole-process-timeout result. Its inspected raw SHA-256 is `c17156ef79926a13040fe2d0e783173941425b14e8e238d57969e05b35352578`.

Mutation qualifications are retained: case `10` has 6 individually cancelled tests, `14b` has 7 and `14c` has 1; those processes complete and also contain assertion failures. These are not 32 clean assertion-only runs. The first defensive preload rejected fixture loopback requests before any mutation ran; the corrected baseline passed. The report records that harness correction instead of counting it as a detected mutation.

CITED test strengthening: existing fake readers now provide mandatory `before` and key-class results; fake startup returns process/reset evidence; fake TLS uses protocol delimiters; foreground helpers echo request IDs. These align test capabilities with required runtime contracts. The frozen ten steps, speech predicates, 3/3 requirement and gates were preserved.

Cases `07` and `08` now have behavioral detection beyond source assertions: `test/browser.test.mjs:47` executes the exact production completion block with every external dependency fake, and `:9` runs the production browser adapter with a fake engine that models signal defaults. This does not execute installed Playwright's native lifecycle or launch Chromium. X04 (`test/speech.test.mjs:1738`) executes the exact dependency-admission expression; the corrected focused mutation-17 TAP fails specifically with `runtime dependency admission must refuse a missing pin` before reaching the unchanged regex assertion. Its focused baseline passes. That is stronger than the historical source-only coverage, while still falling short of whole-executable CI execution.

## Nonblocking defensive note and execution boundary

CITED; MEASURED; INFERENCE: `installTeardown` still only logs a directly injected `state.finish` rejection (`capture.mjs:581`) and computes deadline exit from the current summary (`:574-576`). A standalone caller that supplies already-complete attempts but manually substitutes a rejecting finish function can therefore retain PASS/exit 0. No production-reachable instance of that artificial state was found: `runAttempt.finally` awaits the same once-memoized finish before `runR1` returns; an actual finish rejection propagates through `finishRun` as crashed/FAIL. The independent production-path rejection and stop-error probes confirm that propagation. Harden the generic helper before reusing it with a different caller/ownership model; this is not classified as a remaining material blocker in the reviewed runner.

Native delivery races, the cscript startup gap, consumed NVDA control keys, identical-key attribution, host cancellation and post-bound exit behavior remain practical limits. Exact relay/launcher PID behavior, foreground browser PID mapping, hosted desktop/audio/VBScript behavior and native cleanup have not been observed. Any isolated preflight must be separately approved and preserve setup/failed evidence and the scored-run rule; failure must not be repaired by weakening these checks or thresholds.

This reviewer used the sandbox before loading vendored code. No real NVDA, Chromium, PowerShell foreground/ownership query, native input, network/API request, Actions run, installation, commit or push was performed. Shared edits were limited to this authorized report. Temporary probe scripts and results remain under `%TEMP%/d43-safety-review-9bc471bf684f4e90883374d4a4a44463/`; writer verification artifacts are under `%TEMP%/tabwise-owner-4563fa9d/`.

**Final code-publication verdict: APPROVE for the manifest-bound bytes below. Material blockers remaining: none found. This is not activation approval, execution approval, an R1 result, or a claim of general input safety. Source-byte changes require corresponding re-review.**

## Final reviewed raw-byte manifest

```json
{
  ".github/workflows/r1.yml": "e1353c1dc5460d0e8569499239dcb7e87443896b18909ffff47ad604f131355c",
  "fixtures/r1/lock.json": "22e6df50adb909b4c9b0dbff4b62efa2ac6b8fec5699eeac292e4d393ebb66ed",
  "fixtures/r1/signup.html": "b1aa57334130d30d1d695b06fa68d9041fc9c261a9fc6a33066d16dff1e172a2",
  "fixtures/r1/steps.json": "150a95825dd418e719018a5185608865d1353dc9b20b2080c3087fc542828a89",
  "package.json": "368ad6bf72d196d139ab7e75e813a0ab27c45c33d876d5a382ca9e52d371b6db",
  "scripts/r1.mjs": "3f5e82940ecc656406f9adc7237c5e2421716066c3def338f8509210b94b1335",
  "src/speech/browser.mjs": "04a835f37303276df812799cbc1e8b53a76a4cf5c4795256f2030e5d04de08c6",
  "src/speech/capture.mjs": "059f08557655f6c4e6f9f7157adefb87948e4585e289fa036a6f1d4fbb9a0c57",
  "src/speech/foreground.mjs": "2ffc711fdb36499561f0ac1c1b4615e62cce27ed01e1034c5f401c83a60d4e50",
  "src/speech/runguard.mjs": "8884901cb7f690c8beb3c8f208d59d10989cd2e2464fee6bb5fe927593149222",
  "src/speech/sendguard.mjs": "d4882268594466266d85e4eeb82e26bfdfe90dfd08fc98f95f4ca39fd6aff4bd",
  "src/speech/validate.mjs": "85a45ea66e7242714779cbeb690ecf84090ebb7f1a67f9e2ff057eb1fba11054",
  "src/speech/vendortree.mjs": "8cca91e780a5f90d07b87e665b936eb1901cb6686c0cb798aa74f33672931298",
  "test/broker.test.mjs": "e4655b7224c5ed67fe01f272c95435ecb92ead51383383c2571982710238778d",
  "test/browser.test.mjs": "7a73cb24d0a51a130da6272a73727c1dae8fba1ab1311c0cdf04119f480da696",
  "test/client.test.mjs": "d4b8cf0f4dc4eba44c36ae197a18581692ffa912a60fec59a50cbd2a54f664d4",
  "test/engineering.test.mjs": "a000f56876ff73e6da2c36039b72baf6258589e66589cee36e9f767a12d5c6ed",
  "test/helpers/sandbox.mjs": "2412ce2f009ebdfb6c1ab326e733c68f05ece764aba7f8c7af02ab51528b59f0",
  "test/sendguard.test.mjs": "9acf3dfa9b1ef988adec27aa58b6aa5121f694b798dac8d73c739437159bfba3",
  "test/speech.test.mjs": "dc0e53874d4acacb34b93dd77a9ef3db7b29ef0838ef619a9dbe9448dd602c4d",
  "test/vendor.test.mjs": "ce227898ba999ae3015351dd97a9ff85cfbb77b853cfb344de11cdefac76cd08",
  "vendor/guidepup-0.36.4-r1/LICENSE": "b0feed1635af5ff585da04590b584e997fede3700ec1d3f61ebcb697ad21764f",
  "vendor/guidepup-0.36.4-r1/VENDORED.md": "45d3f3dacf9b9241f9a70325a6b443e6c19bfd4126fea3f56c140043012960e4",
  "vendor/guidepup-0.36.4-r1/lib/constants.js": "8286f94992c283ac11d1cafcd47005e3577ed7d1f5eb1138b0c3901409bc128f",
  "vendor/guidepup-0.36.4-r1/lib/deepMerge.js": "01413c626c4347b1aeb18a5216c5bbb7da8467956cd5b220b72a0c568433c9a5",
  "vendor/guidepup-0.36.4-r1/lib/delay.js": "b64a1593572f267b92262d364d4729db7d39474aff33d93cbc1e065fb39a46e4",
  "vendor/guidepup-0.36.4-r1/lib/isKeyCode.js": "1c6ea9eeed4ca74f48ab4bbf2001ac392c93e5da2c3484c2d55ee93c616fa279",
  "vendor/guidepup-0.36.4-r1/lib/parseKey.js": "4712e44dd39623e7403dfa416b95581692bbec1d10ceba790cf7671735100694",
  "vendor/guidepup-0.36.4-r1/lib/resolveCachePath.js": "ec9fc9b8260f60aecc4d8bce5181d7838ba8077150be19bc670f9597370f002d",
  "vendor/guidepup-0.36.4-r1/lib/teardown.js": "0f1d069f1c07b0360bfd3286510b8548512d314453f0ad9bdad10c20c4c4648f",
  "vendor/guidepup-0.36.4-r1/lib/waitForCondition.js": "b6af411ea33ae608e4a4052fa2f5101e723153479f6082ba79dcb3328a6aeacb",
  "vendor/guidepup-0.36.4-r1/lib/windows/Key.js": "d5fb803700c2e879419a0b43f17636ea08aaf6d810fed18b1ab11294b8824973",
  "vendor/guidepup-0.36.4-r1/lib/windows/KeyCodes.js": "aea1800090e6979fb6d0b3e3d6786b805330e9eb7bf0bf53b232a4f6d755a6bb",
  "vendor/guidepup-0.36.4-r1/lib/windows/Modifiers.js": "de086ef258be9c730e5c85bc456635d0ac9d47df7b291c97bd83c8949f051d6d",
  "vendor/guidepup-0.36.4-r1/lib/windows/NVDA/NVDA.js": "03b4c16a5eb2e87327e9b849826d5803c44cf1697c4d54734f49821dbb989583",
  "vendor/guidepup-0.36.4-r1/lib/windows/NVDA/NVDAClient.js": "f8e5feb2487a64de1f0c5d13c15f899b52ecdd84bee37e37ec839c87bc8700f7",
  "vendor/guidepup-0.36.4-r1/lib/windows/NVDA/config/buildIni.js": "471957ab2ce827e2a3a90015f30b428c548f80e04f32c4d799c2f7de35260072",
  "vendor/guidepup-0.36.4-r1/lib/windows/NVDA/config/createGuidepupConfig.js": "e9048c2dea70527c220c1ee2e2697dd2c90b0861e4a505975d9251b59d7c8aad",
  "vendor/guidepup-0.36.4-r1/lib/windows/NVDA/config/deleteGuidepupConfig.js": "f6d096cee07579088dc829b83d4d5205faaf9aaddcc93dada38f6cf2f57ad063",
  "vendor/guidepup-0.36.4-r1/lib/windows/NVDA/config/getConfig.js": "fdaf154375c67d5dba3d76cbdb9ea31d20c9949ba6f381b51292a4f866aca95b",
  "vendor/guidepup-0.36.4-r1/lib/windows/NVDA/config/getConfigKey.js": "2617675b0028d6e42eccf3625b12ae35e6548215342ed59c3bf21d07f6cc89c9",
  "vendor/guidepup-0.36.4-r1/lib/windows/NVDA/config/index.js": "320ded11ea40ee653a9aa142c2382471be52838b46967c7ad1de210f06f63ac9",
  "vendor/guidepup-0.36.4-r1/lib/windows/NVDA/config/parseIni.js": "50702c737bfd3ca2709a31c25c8cba07a1d28c77fb102b2ca80a6a6654a81103",
  "vendor/guidepup-0.36.4-r1/lib/windows/NVDA/config/resolveGuidepupUserConfigPath.js": "540c819c5994d5d41258e808bded03459299f27b4944e370d5838173aafffaeb",
  "vendor/guidepup-0.36.4-r1/lib/windows/NVDA/config/resolveSessionUserConfigPath.js": "a64039046fda945a2bfc1c6f972135370c831f5b591abf1c9f3c5eeecb9e4fbb",
  "vendor/guidepup-0.36.4-r1/lib/windows/NVDA/config/setConfig.js": "9268747f8cf73078b6f2671e98662dda24e773ebf7284cdd14e89d985bed5b68",
  "vendor/guidepup-0.36.4-r1/lib/windows/NVDA/constants.js": "c4db47cd2af098b521f7283de48773e12708186d405041c358aeb6098a4ab813",
  "vendor/guidepup-0.36.4-r1/lib/windows/NVDA/getNVDAInstallationPath.js": "4954fe1de9cc6d9d48f2811de838cc59b9e7904a891697f9d231402d67f69b18",
  "vendor/guidepup-0.36.4-r1/lib/windows/NVDA/isNVDAInstalled.js": "b3789b21066b59f7a8a0ae5c2baadf1902199fe9920a19e44bc10ffa0c04b5f8",
  "vendor/guidepup-0.36.4-r1/lib/windows/NVDA/isRunning.js": "973c6f8eff00584b39bbee8ccc63c7f9270bd1767afae9620bd28eafafc55a1d",
  "vendor/guidepup-0.36.4-r1/lib/windows/NVDA/keyCodeCommands.js": "37093f9e4685c4aa3300b8af9d7fc56f7344d726f66a6bd212cbc4dcfc553081",
  "vendor/guidepup-0.36.4-r1/lib/windows/NVDA/quit.js": "c65841bb3b5a2b96a5c4d742a93256c2ba500b4a2408af92e1dc9ab79092b8e7",
  "vendor/guidepup-0.36.4-r1/lib/windows/NVDA/start.js": "7d234a6d8515015121d894066fc9f95485cce64baa935c71009250f6123ca318",
  "vendor/guidepup-0.36.4-r1/lib/windows/NVDA/waitForRunning.js": "300df0a03dd3245992d8f8386a51da49532b14af998238acd42fce4aa6bac2f8",
  "vendor/guidepup-0.36.4-r1/lib/windows/errors.js": "bb09a97c7c354c8f4ea7e1634270e625fa6f634bbaa1cb5095cfe53efaf7394e",
  "vendor/guidepup-0.36.4-r1/lib/windows/isWindows.js": "7aa9563a4438aa1a26ff1c6e919a4d31c9a82caca161e5ee1e6c6deea6a67398",
  "vendor/guidepup-0.36.4-r1/lib/windows/r1Gate.js": "836c3333bffa5f78f361219be01f2339a32f8818a44ba05afbd34b25b06f484f",
  "vendor/guidepup-0.36.4-r1/lib/windows/runVbsScript.js": "ddd6cd35e656d1d6e97ce81e6a5cc8ca8e14e9110a1cbca3794e0d0679ba072d",
  "vendor/guidepup-0.36.4-r1/lib/windows/sendKeys.js": "4d8b920d91f0a262687bb502952885dee25e0343e6a0d162c883af4767fa4438",
  "vendor/guidepup-0.36.4-r1/manifest.json": "d495365a2e3700e016b10c3eaa72e799014c2134c37a86740cf36d234b25022c",
  "vendor/guidepup-0.36.4-r1/package.json": "74cc5ef6ca02718abd6db089989d89323f57d57870f98907699c13cc73d29a87"
}
```
