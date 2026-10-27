# PROVENANCE — licenses and new-work disclosure

## Dependencies, fixtures, datasets
Licence rows are from research 13 §7 (pinned public notices, CHECKED). "Planned" means not yet installed; an install needs approval (AGENTS hard gates). Installed versions come from `node_modules/*/package.json`.

| Item | Kind | Version / source URL | License | Used for | Added (date, task) |
|---|---|---|---|---|---|
| @guidepup/guidepup | dependency | npm 0.36.4 (exact pin; 0.37/0.38 skipped: published 2026-10-25, under 7 days old) | MIT (package.json) | Drive NVDA, read speech | 2026-10-27, F-01 |
| @guidepup/setup | dev tool, not shipped | npm 0.29.3 | MIT (package.json) | One-time host setup of NVDA (the user runs it) | 2026-10-27, F-01 |
| ↳ ffmpeg-static (via @guidepup/record) | optional transitive, not shipped | npm 5.3.0; binary NOT downloaded (`--ignore-scripts`) | GPL-3.0-or-later | Unused (screen recording) | 2026-10-27, F-01 |
| ↳ parse-cache-control (via ffmpeg-static) | optional transitive, not shipped | npm 1.0.1 | BSD-style LICENSE file, no SPDX field | Unused | 2026-10-27, F-01 |
| NVDA | external tool (not shipped) | NOT INSTALLED yet (`npm run versions`); github.com/nvaccess/nvda @ 6e38e89 | GPL-2.0-or-later, two exceptions; controllerClient LGPL-2.1 | Real screen reader | planned, R1 |
| @playwright/test (+ playwright, playwright-core) | dependency | npm 1.64.1; Chromium build 1248 downloaded | Apache-2.0 (package.json) | Controlled actions | 2026-10-27, F-01 |
| @axe-core/playwright (+ axe-core) | dependency | npm 4.14.0 / 4.14.0 | MPL-2.0 (package.json) | Baseline rule checks | 2026-10-27, F-01 |
| Other transitive packages | dependencies | `package-lock.json`: 58 packages | MIT 45, Apache-2.0 4, ISC 3, MPL-2.0 2, BSD-3-Clause 1, BlueOak-1.0.0 1, GPL-3.0-or-later 1, none 1 (counted from the lockfile) | — | 2026-10-27, F-01 |
| Test fixtures | fixtures | written by us in this repo | ours | Healthy/broken pages | planned, R2 |

## New work during the event (building period 2026-10-27 → 2026-11-04)
| Component | Path | Built by (agent) | Dates | Notes |
|---|---|---|---|---|
| Governance and ledgers | `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.codex/`, `docs/` | claude (drafted 2026-10-26 in research, installed 2026-10-27) | 2026-10-27 | Process documents, not product code |
| Budget broker, Meta client, scripts | `src/budget/`, `src/meta/`, `scripts/`, `test/` | claude | 2026-10-27 | F-01; tests written first |
