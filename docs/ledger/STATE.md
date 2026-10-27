# STATE — overwrite each session, ≤40 lines

Updated: 2026-10-27T05:57:35Z · by: claude

## Team (D26: the user divides work; tracked as "us")
- Product (provisional, D22): sharpened C3, accessibility regression testing for forms and dialogs.
- Test rulebook frozen (D23): `PLAN.md` R0–R3 and R7. Gates hash re-checked 05:57Z: unchanged (ca0c9feb…3362).
- Budget (D25): $150 strict ceiling; broker hard stop $100. `npm run spend` → $0.00 spent, no calls made.
- Now: F-01 done and committed (D-31); **R0 passes** (FEATURES.json `passes: true`). NVDA 0.2.1-2026.2 is installed per-user by the user; the zip's sha256 matches Guidepup's manifest.
- Next:
  1. The user commits the R0 changes (proposed message below) and pushes `main`.
  2. FEATURES R0 `result` and `verify` are user-only fields. Suggested: result `PASS`, verify `npm test && npm run spend && npm run versions`.
  3. R1 real speech ($0, ≤1.5 h): spec by MCQ. NVDA + Guidepup on a local page we wrote, keyboard-only 10 steps, 3/3 fresh speech logs.
- Blocked: nothing. Live Meta calls are not needed until R2.
- Last verification (2026-10-27T05:57:35Z): `npm run versions` → NVDA found; `npm test` → 16 pass, 0 fail; `npm run spend` → $0.00; `git check-ignore .env` → ignored.

## Notes for whoever resumes
- Every Meta call goes through `respond()` in `src/meta/client.mjs` (D-29 Contributor guard).
- Two machines spending at once share no database. Set `BUDGET_CAP_USD` in each `.env` (sum ≤ $100).
- Run Guidepup CLI commands from `app/` with `npx --no-install guidepup …`. The installer finds Guidepup from the current folder. Plain `npx @guidepup/setup` installs nothing on Windows.
- NVDA has not been run yet. R1 is the first run. Per AGENTS, it drives only local fixture pages that we wrote.
- Lockfile has 1 GPL-3.0 package: ffmpeg-static, optional and not shipped, and its binary was not downloaded.
- Run tests via `npm test`.

## Handoff
Uncommitted in `app/`: none (all committed). Remote: `origin/main` awaiting user `git push`.
Verified by: `npm run versions` (NVDA found), `npm test` (16 pass), `npm run spend` ($0.00).
Proposed next step: user pushes `main`; proceed to R1 spec approval by MCQ.
Review needed from: user
