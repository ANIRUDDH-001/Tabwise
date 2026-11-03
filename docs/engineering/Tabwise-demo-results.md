# Tabwise local demo preparation — results

Task: F-03/demo-polish. Initial run ID: `demo-polish-20261103`; correction run ID: `demo-polish-correction-20261103`. This is a local engineering report, not R2/R3/R7 qualification. Initial measurements below are historical; the correction section records checks rerun for the revised candidate.

## Base and delivered changes

Exact base and unchanged HEAD: `4ccc54442bdba81febe1cac7f1c97700ead3fe76`.
Branch: `feat/F-03-demo-polish`.
Worktree: `C:/Users/ANIRUDDH/.codex/worktrees/tabwise-demo-polish/app`.

- `web/app/globals.css`: screen-only slate/blue palette, local system typography, clearer archive panel, shared shell and control styling, responsive spacing; fixes for low-contrast navigation/pipeline labels and quiet-link hover. Print styling retained.
- `web/app/page.tsx`: explicit archived R1 session label and simpler subject-specific introduction. Archived quote, metrics, anchors and scope unchanged.
- `web/app/w/demo/page.tsx`: explains that local Fernway recording and archived R1 evidence are separate fixtures.
- Correction: `web/components/PassRunDetail.tsx` and archive links now describe reading a transcript and explicitly disclose text rather than audio playback. The full integrated STATE is preserved verbatim, followed by a separate demo update.
- `docs/engineering/Tabwise-demo-plan.md`: planned 2:30 storyboard, narration, evidence categories, recording setup, caption/credit instructions and fallback conditions. No video recorded or uploaded.
- This report, normal STATE/PLAN/DECISIONS/LOG session entries and the existing CODEMAP engineering-docs row.

The complete revised unstaged patch, including new documents, is `cache/demo-polish/revision/exact.diff`. Its companion `inventory.json` contains paths, line counts, content identities, protected-path audit and patch SHA-256. `corrections.diff` isolates this correction from the previous candidate. Reproduction tools and logs stay in ignored cache directories; no existing tests were changed or registered. The revised finalizer checks STATE preservation without overwriting it; the old destructive STATE-generation helper has been retired.

## MEASURED — initial candidate checks (historical)

Node `v24.22.1`; Chromium `156.0.8078.4`; production Next build, credential-disabled loopback server. Installed root/web/contracts dependencies reused through ignored directory junctions. No dependency install or lockfile change.

| Exact command | Result | Local output |
|---|---|---|
| `node --test web/test/*.test.mjs packages/contracts/test/*.test.mjs` | PASS: 148 tests, zero failures/skips | `cache/demo-polish/units.log` |
| `npm run typecheck --prefix web` | PASS, exit 0 | `cache/demo-polish/types.log` |
| `npm run build --prefix web -- --webpack` | PASS, exit 0 | `cache/demo-polish/build.log` |
| `node --test web/test/web-smoke.browser.mjs web/test/product-integration.browser.mjs web/test/recorder.browser.mjs` with `TABWISE_SMOKE_URL=http://localhost:3100` | PASS: 15 tests, zero failures/skips | `cache/demo-polish/browser.log` |
| `node cache/demo-polish/audit.mjs` | PASS: 30 axe scans across 15 routes at desktop/mobile; zero violations. 45 layout combinations at widths 375/768/1440; zero horizontal overflow. Skip-to-main, visible focus and print navigation/report assertions pass. Zero uncaught page errors. | `cache/demo-polish/audit.json`, `.log`, `qa-*.png`, `report-print.png` |
| `node --test test/tabwise-r3-rerun.test.mjs` | PASS: 4 synthetic tests; baseline/correct/wrong browser control, candidate binding, staging and hard-stop checks. No native NVDA acceptance. | `cache/demo-polish/r3-synthetic.log` |
| `node scripts/check-r1-baseline.mjs` | PASS: `ok:true`, `errors:[]` | `cache/demo-polish/r1.log` |
| `node scripts/preflight.mjs` | PASS, exit 0; pre-registered gate hash intact | `cache/demo-polish/preflight.log` |
| `node cache/demo-polish/finalize.mjs` | PASS: exact changed-path allowlist; protected tracked content identical to base; original active checkout status/HEAD preserved; full patch inventory generated | `cache/demo-polish/inventory.json` |
| `git diff --check` plus new-document no-index whitespace checks | PASS, exit 0 | `cache/demo-polish/whitespace.log` |

These are MACHINE checks, narrow L3 deterministic assertions; visual critique is an INFERENCE from rendered frames. Same-lineage synthetic repair material remains L0 for demo purposes and cannot be a native verdict. The archived R1 speech retains its existing OBSERVED/L4 attribution, scope and run ID; this task did not recapture or independently qualify it.

## Findings and corrections

- Baseline build and 148 web/contracts checks passed before UI edits. Initial contracts execution lacked a local `ajv` resolution path; reusing the existing contracts dependency directory resolved it without installation.
- Initial API run with `127.0.0.1` hit the existing same-origin refusal (403 rather than the expected unconfigured-auth 503). Repeating with `localhost`, matching Next's request URL origin, passed. No application guard or test was changed.
- The first audit harness used `browser.newPage()`; axe required an explicit browser context. The harness now uses the same `newContext()` pattern as the existing project browser checker. Context7 CLI was unavailable with `npx --no-install ctx7`; no CLI was installed. This did not affect product code or change any library API in the product.
- Initial visual audit found navigation-label contrast failures and borderline pipeline contrast on the new workspace background. Text was darkened; final scans pass. Initial audit output is preserved in `audit-first-pass.json`.
- Independent Codex review found a P2 quiet-link hover regression. A specific override restores blue text on pale blue. Reviewer independently reproduced the corrected production hover on both archive and report, and reported no remaining blockers in the presentation diff/storyboard. Results-document review was outside that reviewer’s scope.
- Browser console includes expected 503 responses from unavailable account APIs: workspace, ops limits, owned patch and verification. These states render explanatory UI and are covered by disabled API checks. They are not claimed as working authenticated flows.
- Visually inspected desktop landing/demo/editor and mobile landing, plus print diagnostic report and successful archive. Screenshots are local engineering artifacts, not native evidence.

## Preservation and limits

No changes to `src/`, `scripts/`, `test/`, `packages/`, `fixtures/`, `supabase/`, `.github/`, `ci/`, governance, dependencies, locks, web API/server/lib/data, qualification status, FEATURES or evidence. No native input, NVDA, model calls, credentials, hosted DB, workflow dispatch, commits, push, deploy or merge. The active checkout remains at `d79c066228a16e3c69c0c38f696d5525fe9dd6ab` with its original untracked `fx-wPC4q4/` and `web/AGENTS.md` untouched. R2/R3 candidate and integration refs remain unchanged.

Full root/stress/real database/native/hosted suites were not rerun for this presentation-only task; the base integration results are historical, not reasserted as current results. Browser/axe checks cannot establish screen-reader usability, standards compliance or native repair success. The storyboard's simulation segment is an editorial illustration; no fake diagnosis or native-success screen was added to the app.

Required Claude cross-tool review remains outstanding under PROTOCOLS §4–5. No qualification status or acceptance flag was promoted. Local UI/demo preparation is ready for that review; publication and recording software operation remain with the user. The temporary local server is stopped at handoff.

## Owner-requested correction — current verification

The revised planned 2:30 cut prioritizes actual product interaction: keyboard recording, checkpoint/reordering, saved-version reload and inspection, archived key/speech pairing, provenance and incomplete-evidence handling. Simulated repair is a brief explicitly labelled L0 illustration. The native diagnostic is separate from the historical R1 failure shown in the app. No live Muse diagnosis, native repaired-journey verification or completed R7 acceptance is claimed.

MEASURED, owner-reported in this correction request: [GitHub run 41584715963, attempt 2](https://github.com/ANIRUDDH-001/Tabwise/actions/runs/41584715963/attempts/2): authorization PASS; installation PASS; NVDA startup failed on owner query timeout; zero physical sends; artifact integrity PASS; native qualification BLOCK. This task records the supplied outcome; it did not download or independently validate that artifact, rerun NVDA or infer qualification from artifact integrity.

MEASURED `demo-polish-correction-20261103`, MACHINE/L3 narrow checks:

| Exact command | Current result | Output under `cache/demo-polish/revision/` |
|---|---|---|
| `node --test web/test/*.test.mjs packages/contracts/test/*.test.mjs` | PASS: 148 tests; zero failures/skips | `units.log` |
| `npm run typecheck --prefix web` | PASS, exit 0 | `types.log` |
| `npm run build --prefix web -- --webpack` | PASS, exit 0 | `build.log` |
| `TABWISE_SMOKE_URL=http://localhost:3100 node --test web/test/web-smoke.browser.mjs web/test/product-integration.browser.mjs web/test/recorder.browser.mjs` | PASS: 15 tests; zero failures/skips | `browser.log` (environment set using PowerShell) |
| `node cache/demo-polish/revision/labels.mjs` | PASS: all three transcript links navigate correctly; text-only disclosure visible; no audio/video elements | `labels.log` |
| `node cache/demo-polish/revision/audit.mjs` | PASS: 30 axe scans / 15 routes, zero violations; 45 layouts, zero horizontal overflow; keyboard focus/skip and print assertions pass | `audit.json`, `audit.log`, rendered screenshots |
| `node scripts/check-r1-baseline.mjs` | PASS: `ok:true`, `errors:[]` | `r1.log` |
| `node scripts/preflight.mjs` | PASS, exit 0 | `preflight.log` |
| `node cache/demo-polish/revision/finalize.mjs` | PASS: full base STATE retained as exact prefix; line limit preserved; only approved paths changed; protected tracked content identical to base; exact revised and incremental patches generated | `inventory.json`, `exact.diff`, `corrections.diff` |
| `git diff --check` and new-document no-index whitespace checks | PASS; tracked check exit 0; new-document check has expected difference exit 1 with no whitespace diagnostics | `whitespace.log` |

Independent Codex reviewer confirmed exact integrated STATE prefix preservation and found no blockers in the requested source/storyboard corrections. The native outcomes were reviewed as owner-reported facts. This does not replace Claude cross-tool review or R7 acceptance. Synthetic R3 tests in the initial section were not rerun for these wording/document corrections and are not represented as new native evidence. No guard, frozen file, runtime execution, API, workflow, qualification policy, evidence, status or acceptance record was changed. No commits, remote writes, deployment, paid calls or native execution occurred.
