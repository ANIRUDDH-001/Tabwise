# DECISIONS — append-only (format: docs/governance/PROTOCOLS.md §3)

Research decisions D1–D10 (with rejections X1–X9 and unknowns U1–U7) are in `../research/meta-hackathon-2026/07_DECISION_AND_RISK_LEDGER.md` §1. D11–D26 are in `../research/meta-hackathon-2026/LEDGER.md`. D21–D26 are copied below because they govern this folder. New entries start at D-27.

## D21 2026-10-27 — Finalise verified drafts
User answer: "yes you may finalise all the drafts which were verified by codex and you / including but not limited to gitignore"
Consequence: drafts installed in `app/` with Codex's fixes (13 CX28–CX35) | Reversal: user asks to revert

## D22 2026-10-27 — Product direction to test
Options: Sharpened C3 only (rec) / Test C3 and C4 together / Commit to C3 now, no tests
User answer: "Sharpened C3 only (Recommended)"
Consequence: only C3 is tested today (R0–R3, R7). C4 is untested and inherits nothing | Reversal: R1, R2 or R3 fails (PLAN decision rule)

## D23 2026-10-27 — Freeze the test rulebook (completes D18)
Options: Adopt Codex §8 as frozen (rec) / Adopt, but keep Oct 28 a hard decision
User answer: "Adopt Codex §8 as frozen (Recommended)"
Consequence: PLAN.md Day-1 tests, decision rule and kill checks are frozen. Hash of the PLAN.md text from "## Pre-registered Day-1 tests" up to "## Day plan" (UTF-8): `ca0c9feb568e7c9c4ea41832607f510af0cbf5548242adcd77f729e039af3362` (MEASURED 2026-10-27T05:07:41Z) | Reversal: new MCQ

## D24 2026-10-27 — Where governance is installed
Options: New build folder in this project (rec) / Root of the current repo / Wait until the product is picked
User answer: "New build folder in this project (Recommended)"
Consequence: `D:\Projects\Meta AI\app\`. The user runs `git init` there; it becomes the public submission. The research repo ignores `app/` | Reversal: user MCQ

## D25 2026-10-27 — Credits and spend
User answer (MCQ): "Yes, on one account". Follow-up: "dont worry about meta" … "do track meta spending dude / just saying we have got the api and 150$ credits / it's a strict cap!"
Consequence: API access and $150 of credit are available. $150 is a strict ceiling; the broker hard-stops at $100 total and every call is logged in `COSTS.jsonl` | Reversal: user changes the cap

## D26 2026-10-27 — One team, no developer split
User answer: "consider us being the only one working today / i will divide the task with my teammate myself / for you everything is being worked by us only"
Consequence: plans and STATE track work for "us", with no Dev A/B owners. Independent checks (R7) are assigned by the user | Reversal: user asks for a split

## D-27 2026-10-27 — Repository initialization and modular initial commits
User answer: "make meaningful modular and multiple commits as per the need https://github.com/ANIRUDDH-001/Tabwise-.git new repo" … "just commit!!!!"
Consequence: `app/` initialized as standalone git repo on `main` branch with remote `https://github.com/ANIRUDDH-001/Tabwise-.git`. Initial codebase committed in modular conventional commits. | Reversal: git reset


## D-28 2026-10-27 — F-01 budget broker + R0 prerequisites spec
Options: Approve as written (rec) / Approve, but TypeScript / Revise first
User answer: "Approve as written (Recommended)"
Consequence: spec copied verbatim into `PLAN.md` § F-01; installs approved: @guidepup/guidepup, @guidepup/setup, @playwright/test + Chromium, @axe-core/playwright (exact pins). The user runs `npx @guidepup/setup` | Reversal: rollback in the spec
Installed 2026-10-27 (project scope, `npm install --save-exact --ignore-scripts`, 0 vulnerabilities reported): @guidepup/guidepup 0.36.4, @guidepup/setup 0.29.3, @playwright/test 1.64.1, @axe-core/playwright 4.14.0; Chromium build 1248 via `npx playwright install chromium`. Versions chosen by Claude: newest at least ~7 days old

## D-29 2026-10-27 — Spark mode on our fixtures
Options: Contributor on our fixtures (rec) / Standard only
User answer: "Contributor on our fixtures (Recommended)"
Consequence: `muse-spark-1.3-contributor` only for our own synthetic fixture pages; never personal, sensitive or confidential input (Terms §6.2). Everything else uses Standard | Reversal: user MCQ

## D-30 2026-10-27 — Branch for F-01
Options: Current branch, you commit (rec) / You create feat/F-01-broker
User answer: "Current branch, you commit (Recommended)"
Consequence: Claude edits the working tree on the checked-out branch (`main`); the user commits at their own pace ("i will commit at my own pace and requirements") | Reversal: user creates a branch

## D-31 2026-10-27 — Modular commits for F-01 build
User answer: "again"
Consequence: F-01 committed modularly in 5 conventional commits (deps, budget broker, meta client, scripts, ledgers & codemap). | Reversal: git reset

## D-32 2026-10-27 — Remote URL update to Tabwise
User answer: "repo name update https://github.com/ANIRUDDH-001/Tabwise"
Consequence: origin remote URL updated from `https://github.com/ANIRUDDH-001/Tabwise-.git` to `https://github.com/ANIRUDDH-001/Tabwise.git`. Verified with `git ls-remote origin`. | Reversal: git remote set-url


## D-33 2026-10-27 — F-02 R1 real-speech spec
Options: Approve / Revise further (rec, with three corrections) / Approve as is
User answer: "Approve F-02 with the three corrections exactly as specified. Proceed with test-first implementation, lock the specification and fixture hashes, and run the offline validator tests. Do not start the real NVDA run automatically. I will execute `npm run r1` manually after implementation and review. Keep all failed and partial evidence. No threshold changes or fixture tuning after the first scored run. F-03 remains scheduled after R1 and must pass independent Codex review before any R2 Meta API calls."
The three corrections (user's review): set and record NVDA's typed-character echo before the scored run, keeping steps 2 and 4; "unchecked" cannot satisfy "checked", with negative validator tests; SIGINT cleanup and partial evidence, "Do not claim cleanup is guaranteed after forced termination"
Consequence: spec in `PLAN.md` § F-02; Claude builds and runs only offline tests; the user runs `npm run r1`; evidence goes in `docs/evidence/r1/` (synthetic speech only, relative paths, run IDs, hashes, versions, failures kept). F-03 (broker: per-experiment cap; on overrun record the actual charge, flag it and block calls until reconciled) runs after R1 and before any R2 call, with Codex review | Reversal: user MCQ

## D-34 2026-10-27 — F-02 amendments after reading Guidepup 0.36.4
Options per item: recommended / alternative (own 1.5 s NVDA listener; title and load speech both; exact a/d/a phrases)
User answer: "Approve the three recommended options for F-02: 1. Guidepup's native 1.0-second silence window, with an 8-second timeout per individual key action. 2. NVDA-reported window-title focus verification using the unique attempt nonce, retaining the other freshness conditions. 3. Punctuation-and-whitespace normalization for typing assertions, while preserving the original speech and recording individual character actions. Record these as explicit amendments to the approved F-02 specification. Update and lock the specification, fixture and validator hashes before the first scored run. Preserve the original 10 steps, 3/3 requirement, $0 cost, 1.5-hour ceiling, failed-attempt evidence and one-scored-run rule."
Sources: NVDAClient.js `SPEAK_DEBOUNCE_TIMEOUT = 1000` (module constant); guidepup-playwright `navigateNVDAtoWebContent.ts` (reportTitle + Alt+Escape, up to 10); NVDAClient joins parts with ", " and phrases with ". "
Consequence: amendments A1-A3 in `PLAN.md` § F-02; `fixtures/r1/lock.json` hashes the spec, fixture, steps and validator | Reversal: user MCQ

## D-35 2026-10-27 — Modular commits for F-02 build
User answer: "again commits"
Consequence: F-02 committed modularly in 4 conventional commits (fixtures, speech harness, scripts, and ledgers/codemap). | Reversal: git reset
