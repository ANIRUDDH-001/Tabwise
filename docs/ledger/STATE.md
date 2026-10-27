# STATE — overwrite each session, ≤40 lines

Updated: 2026-10-27T07:22:00Z · by: codex

## Team (D26: the user divides work; tracked as "us")
- Product (provisional, D22): sharpened C3, accessibility regression testing for forms and dialogs.
- Test rulebook frozen (D23): `PLAN.md` R0–R3 and R7. Gates hash: ca0c9feb…3362 (unchanged).
- Budget (D25): $150 strict ceiling; broker hard stop $100. `npm run spend` → $0.00 spent.
- Now: F-02 (R1 real NVDA speech) committed modularly on `main` (D-35); locked and verified.
- Next:
  1. The user runs `git push`.
  2. The user runs `npm run r1` from `app/`: hands off keyboard and mouse ~3–5 min; NVDA speaks.
  3. Claude checks `docs/evidence/r1/<run_id>/` against the validator; FEATURES R1 `passes` only then.
  4. F-03 broker hardening (per-experiment cap; overrun → record, flag, block until reconciled) after R1, Codex review before any R2 call (D-33).
- Blocked: nothing. No Meta calls until F-03 passes review.
- Last verification (2026-10-27T07:22:00Z): `npm test` → 44 pass 0 fail; `node scripts/r1.mjs --hashes` → 0 mismatches vs `fixtures/r1/lock.json`.

## Notes for whoever resumes
- Spec: `PLAN.md` § F-02 between the spec markers (D-33 corrections C1–C3, D-34 amendments A1–A3).
- Any edit to the 6 locked items makes `npm run r1` refuse; re-lock only before the first scored run, logged.
- No threshold changes or fixture tuning after the first scored run; keep all failed/partial evidence (D-33).
- Rerun only if setup fails before attempt 1 reaches step 1 (summary `rerun_allowed: true`).
- Every Meta call goes through `respond()` in `src/meta/client.mjs` (D-29). Run tests via `npm test`.

## Handoff
Uncommitted in `app/`: none (all committed). Remote: `origin/main` awaiting user `git push`.
Verified by: `npm test` (44 pass); `node scripts/r1.mjs --hashes` (0 mismatches).
Proposed next step: user pushes `main`, then runs `npm run r1`.
Review needed from: user
