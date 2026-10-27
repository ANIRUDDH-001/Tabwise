# STATE — overwrite each session, ≤40 lines

Updated: 2026-10-27T05:48:44Z · by: codex

## Team (D26: the user divides work; tracked as "us")
- Product (provisional, D22): sharpened C3, accessibility regression testing for forms and dialogs.
- Test rulebook frozen (D23): `PLAN.md` R0–R3 and R7. Gates hash: ca0c9feb…3362.
- Budget (D25): $150 strict ceiling; broker hard stop $100. `npm run spend` → $0.00 spent.
- Now: F-01 committed modularly on `main` (D-31). Broker, Meta client, scripts, 16 tests pass.
- Next:
  1. User runs `git push` to push F-01 commits to `origin/main`.
  2. The user runs `npx @guidepup/setup`. Then `npm run versions` must show NVDA found → R0 complete.
  3. R1 real speech ($0): NVDA + Guidepup on a local page we wrote.
- Blocked: R0 completion and R1 on NVDA setup. Live Meta calls: none needed yet; no `.env` key checked.
- Last verification: `npm test` → 16 pass, 0 fail; `npm run spend` → $0.00 of $100.

## Notes for whoever resumes
- Every Meta call goes through `respond()` in `src/meta/client.mjs` (D-29).
- Two machines spending at once share no database. Set `BUDGET_CAP_USD` in each `.env` (sum ≤ $100).
- Lockfile has 1 GPL-3.0 package (ffmpeg-static, optional, via @guidepup/setup). Binary not downloaded.
- Run tests via `npm test`.

## Handoff
Uncommitted in `app/`: none (all committed). Remote: `origin/main` awaiting user `git push`.
Verified by: `npm test` (16 pass), `npm run spend` ($0.00).
Proposed next step: user pushes commits to GitHub; run `npx @guidepup/setup`.
Review needed from: user
