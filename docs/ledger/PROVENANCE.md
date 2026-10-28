# PROVENANCE — licenses and new-work disclosure

## Dependencies, fixtures, datasets
Licence rows are from research 13 §7 (pinned public notices, CHECKED). "Planned" means not yet installed; an install needs approval (AGENTS hard gates). Installed versions come from `node_modules/*/package.json`.

| Item | Kind | Version / source URL | License | Used for | Added (date, task) |
|---|---|---|---|---|---|
| @guidepup/guidepup | dependency | npm 0.36.4 (exact pin; 0.37/0.38 skipped: published 2026-10-25, under 7 days old) | MIT (package.json) | Drive NVDA, read speech | 2026-10-27, F-01 |
| @guidepup/guidepup, vendored copy | vendored dependency (R1 only) | `vendor/guidepup-0.36.4-r1/`: `package.json`, `manifest.json`, `LICENSE` and the `require()` closure of `lib/windows/NVDA/NVDA.js` from npm 0.36.4 (integrity `sha512-LgF945tl…5ovg==`, package-lock.json); 8 files modified (5 D-39, 3 lifecycle files D-43), `lib/windows/r1Gate.js` added; per-file upstream and vendored sha256 in `VENDORED.md`; tree hash in `fixtures/r1/lock.json` `vendor_tree` | MIT, © 2023 Craig Morten (upstream LICENSE kept; header line on each modified file) | R1 gated input, bounded lifecycle and framed speech transport | 2026-10-27, F-02 (D-39, D-40) |
| @guidepup/setup | dev tool, not shipped | npm 0.29.3 | MIT (package.json) | One-time host setup of NVDA (the user runs it) | 2026-10-27, F-01 |
| ↳ ffmpeg-static (via @guidepup/record) | optional transitive, not shipped | npm 5.3.0; binary NOT downloaded (`--ignore-scripts`) | GPL-3.0-or-later | Unused (screen recording) | 2026-10-27, F-01 |
| ↳ parse-cache-control (via ffmpeg-static) | optional transitive, not shipped | npm 1.0.1 | BSD-style LICENSE file, no SPDX field | Unused | 2026-10-27, F-01 |
| NVDA | external tool (not shipped) | Guidepup portable build 0.2.1-2026.2: `guidepup-nvda-0.2.1-2026.2.zip` from github.com/guidepup/nvda releases (sha256 7df0ca3c1c9e8c6521bc7553486ca360ed6f0b4f9bdbd6603131e38b5c1497a1, matches @guidepup/guidepup 0.36.4 manifest.json); nvda.exe sha256 d239fd2be81fc7d97f62616a6acdfb08010b92de6df65ca314e19f2d8c03c8b0; per-user in %LOCALAPPDATA%/guidepup; upstream github.com/nvaccess/nvda @ 6e38e89 | GPL-2.0-or-later, two exceptions; controllerClient LGPL-2.1 | Real screen reader | 2026-10-27, F-01 (installed by the user) |
| @playwright/test (+ playwright, playwright-core) | dependency | npm 1.64.1; Chromium build 1248 downloaded | Apache-2.0 (package.json) | Controlled actions | 2026-10-27, F-01 |
| @axe-core/playwright (+ axe-core) | dependency | npm 4.14.0 / 4.14.0 | MPL-2.0 (package.json) | Baseline rule checks | 2026-10-27, F-01 |
| Other transitive packages | dependencies | `package-lock.json`: 58 packages | MIT 45, Apache-2.0 4, ISC 3, MPL-2.0 2, BSD-3-Clause 1, BlueOak-1.0.0 1, GPL-3.0-or-later 1, none 1 (counted from the lockfile) | — | 2026-10-27, F-01 |
| R1 fixture | fixture | `fixtures/r1/signup.html`, `steps.json`: written by us, synthetic, no external resources or personal data | ours | R1 real-speech page | 2026-10-27, F-02 |
| Test fixtures | fixtures | written by us in this repo | ours | Healthy/broken pages | planned, R2 |
| GitHub Actions: actions/checkout, actions/setup-node, actions/upload-artifact | CI tools, not shipped | pinned to commit SHAs (D-37, S-01): checkout v7.0.1 `3d3c42e5aac5ba805825da76410c181273ba90b1`, setup-node v7.1.0 `949feb2413d6458794dcd2491c4babbbce0c15c1`, upload-artifact v7.0.2 `cf430e030ddbb5b0abf93d22962f4752f3646cd9` | MIT (LICENSE at each pinned SHA, raw.githubusercontent.com, read 2026-10-27) | R1 workflow (D-36, D-37) | 2026-10-27, F-02 (proposed, not yet run) |

## New work during the event (building period 2026-10-27 → 2026-11-04)
| Component | Path | Built by (agent) | Dates | Notes |
|---|---|---|---|---|
| Governance and ledgers | `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.codex/`, `docs/` | claude (drafted 2026-10-26 in research, installed 2026-10-27) | 2026-10-27 | Process documents, not product code |
| Budget broker, Meta client, scripts | `src/budget/`, `src/meta/`, `scripts/`, `test/` | claude | 2026-10-27 | F-01; tests written first |
| R1 speech harness | `src/speech/`, `scripts/r1.mjs`, `fixtures/r1/`, `test/speech.test.mjs` | claude | 2026-10-27 | F-02; tests written first; no new dependencies |
| R1 safety fixes and CI workflow | `src/speech/foreground.mjs`, `src/speech/runguard.mjs`, `src/speech/capture.mjs`, `scripts/r1.mjs`, `.github/workflows/r1.yml`, `test/speech.test.mjs` | claude | 2026-10-27 | D-36 after I-01; tests written first; no new dependencies |
| R1 send guard and Codex fixes | `src/speech/sendguard.mjs`, `test/sendguard.test.mjs`, `src/speech/{capture,runguard}.mjs`, `scripts/r1.mjs`, `.github/workflows/r1.yml`, `test/speech.test.mjs`, `fixtures/r1/lock.json` | claude | 2026-10-27 | D-37 after Codex BLOCK on D-36; no new dependencies; awaiting Codex re-review |
| R1 vendored Guidepup patch | `vendor/guidepup-0.36.4-r1/` (5 modified files, `r1Gate.js`), `src/speech/{sendguard,vendortree,capture}.mjs`, `scripts/r1.mjs`, `.github/workflows/r1.yml`, `test/{vendor,sendguard,speech}.test.mjs`, `test/helpers/sandbox.mjs`, `fixtures/r1/lock.json` | claude | 2026-10-27 | D-39 spec rev 3, D-40 decisions; tests written first; no new dependencies; Codex D-39 review BLOCK (kept) |
| R1 D-39 exception fixes (D-42) | `src/speech/{sendguard,capture,vendortree}.mjs`, `scripts/r1.mjs`, `test/{sendguard,speech}.test.mjs`, `fixtures/r1/lock.json`, `docs/ledger/RUNS.md` | claude | 2026-10-27 | D-42; tests written first (10 new, 2 changed and disclosed); no new dependencies; awaiting the focused Codex re-review |

| R1 engineering repairs | `src/speech/`, vendored lifecycle and transport, `test/{engineering,browser,sendguard,speech,vendor}.test.mjs` | Codex | 2026-10-27 | D-43/D-44; no installs; original historical failures retained; only offline/fake transport results until approved isolated execution |
