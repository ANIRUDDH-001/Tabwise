# INCIDENTS — append only; facts labelled MEASURED / CITED / INFERENCE

## I-01 2026-10-27 — R1 run r1-20261027T072210Z on the host laptop
Recorded: 2026-10-27T07:40:17Z · by: claude · decision: D-36 · status: open (explanations below are not settled)

### Timeline (UTC; local IST = UTC+05:30)
| When | What | Label, source |
|---|---|---|
| 07:21:17Z | Antigravity IDE process started | MEASURED, Get-Process at 07:25:04Z |
| 07:21:51Z, 07:22:07Z | Commits 4126b28, acda966 (F-02 fixtures, speech harness) | MEASURED, `git reflog` |
| 07:22:10Z | `npm run r1` started (run id); the lock check passed, since the start banner prints only after it (scripts/r1.mjs:28-34, 80) | MEASURED, terminal output |
| 07:22:10Z | Runner created `docs/evidence/r1/r1-20261027T072210Z/` (evidenceWriter mkdir, before the banner) | INFERENCE, code order |
| 07:22:12Z, 07:22:18Z | Commits 1c0ff95, 6cf0598 (scripts, ledgers), after the run started | MEASURED, `git reflog` |
| 07:22:16Z | NVDA 2026.2 started; `%TEMP%\nvda.log` (424 bytes) ends at "Loading config" | MEASURED, nvda.log |
| 07:22:20Z | audiodg (Windows audio) started | MEASURED, Get-Process |
| unknown | Evidence dir deleted | see below |
| unknown | Runner crashed: ENOENT writing summary.json (src/speech/capture.mjs:48 via scripts/r1.mjs:87, the crash path), so an exception escaped `runR1` first; that first error was not printed | MEASURED, terminal output |
| 07:24:26-29Z | Four Google Chrome (system install) processes started; origin unknown | MEASURED, Get-Process |
| 07:25:04Z | No NVDA, no runner, no Playwright Chromium running; evidence dir absent | MEASURED, Get-Process, Test-Path |

Also running during the run: Codex computer-use runtime processes (`cua_node`, `node_repl`), started 2026-10-26T18:57Z onwards and 06:26:41Z. MEASURED, Get-Process. Whether they acted on the desktop is unknown.

### What the user saw (user's words)
"it just started reading different screens most a popup nothing changed some screens minimized and all"; earlier: "it took over the laptop and started running anything and everything".

### The deleting agent's account (pasted by the user; not checked)
It removed `docs/evidence/r1/r1-20261027T072210Z/attempt-1.jsonl` (0 bytes), believing `npm test` had created it.
Contradicting facts (MEASURED, code): every test writes evidence under `os.tmpdir()` (test/speech.test.mjs:120, 278, 336, 349, 377), and the folder name is this run's id. INFERENCE: the deleted folder was the real run's evidence.

### Open question 1: why windows were read aloud and minimized
- H1: the A2 focus loop. NVDA+T reads the front window's title; while it lacks the nonce, Alt+Escape sends that window back. Up to 11 reports and 10 Alt+Escapes (src/speech/capture.mjs:101-111 at 6cf0598).
- H2: another agent's desktop activity (computer-use runtime, IDE) moved windows, and NVDA announced the focus changes.
- H3: NVDA's ordinary focus announcements of whatever was in front, with no keys from the runner.
These are not exclusive. No surviving record separates them.

### Open question 2: did any form step (Tab, Space, Enter, typing) execute?
- H-a: no. The focus check never matched, so setup failed. Supports: the user did not see the form filled; the file was 0 bytes when deleted (agent's account).
- H-b: yes, at least step 1. The title matched, step 1's key was sent to the fixture window, and the step record write then failed after the deletion. This also ends in the same crash.
- H-c: NVDA never became controllable (log ends at config load), so setup failed with no runner keys. The crash is the same, and H2/H3 would explain what was seen.
All three fit the crash. The missing evidence does not show that no step ran.

### Classification (D-36)
Setup failed before step 1, so a rerun is allowed. **INFERENCE with incomplete evidence**, not MEASURED. Not PASS and not voided.

### Follow-ups
F-02 safety fixes per D-36. No real NVDA/Guidepup run on a personal desktop again.
