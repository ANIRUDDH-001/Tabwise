# R2 owner publication checklist (D-89)

**Owner only.** Claude does not stage, commit, push or open the PR (AGENTS.md D14/D15). The block below is fail-closed: any check that fails throws, and nothing is staged before the inventory, status, manifest and digest checks pass. It runs in Windows PowerShell 5.1 or pwsh. Paste it whole into a console opened anywhere.

## Before running

1. Read `docs/engineering/R2-final-handoff.md`, especially §F (blockers) and §I (verification).
2. Review the diff:
   ```powershell
   git -C 'D:\Projects\Meta AI\app-r2-final-handoff' diff
   ```
   Then read the 7 new files.
3. Optionally re-run the suites from §D of the handoff.
4. Confirm that nothing else should go in. The allowlist is exactly 15 paths.

## What the block checks, in order

1. **Worktree, branch and baseline.**
   - The worktree is `D:\Projects\Meta AI\app-r2-final-handoff`.
   - The branch is `feat/tabwise-r2-final-handoff`.
   - `HEAD` is `71228ae2af198a4f0dcdb47e7cb68c5f5d165c82`, and nothing is staged.
2. **Inventory.** `git status --porcelain --untracked-files=all` must equal the 15 expected lines exactly.
3. **R2 is off.** `r2-status.json` must show `enabled:false` and `verdict:BLOCK`, and must be unchanged against `HEAD`. So must `.github/`, the other status files, `package.json`, `package-lock.json` and `vendor/`.
4. **Hashes and digests.**
   - The lockfile sha256 must match.
   - `r2Digest`, `R2_FILES.length` (19) and the plan digest are recomputed with Node and compared.
5. **Clean text.** No conflict markers; `git diff --check` passes.
6. **Tests.** The R2 suite passes (`node --test test/r2*.test.mjs`).
7. **Staging.**
   - Stage the allowlist only.
   - The staged names must equal the allowlist.
   - `git diff --cached --check` must pass.
   - The staged `r2-status.json` must still be absent from the index diff.
8. **Typed confirmation.** The block shows the staged summary, and you must type `PUSH`. Anything else unstages and stops.
9. **Publish.** Commit, then push with an explicit refspec (the branch was created tracking `origin/main`), then print the compare URL for the PR.

If anything fails after staging, the block runs `git reset -q -- <allowlist>`, which unstages only; working files are untouched.

## The block

```powershell
& {
  $ErrorActionPreference = 'Stop'
  $wt = 'D:\Projects\Meta AI\app-r2-final-handoff'
  $branch = 'feat/tabwise-r2-final-handoff'
  $baseline = '71228ae2af198a4f0dcdb47e7cb68c5f5d165c82'
  $lockSha = '2306bb99ff313aecee64e63117534cb084b26262b3c58c41ad7db0175f7fb820'
  $r2Sha = '5e38d6b0dd2d40e9b882b00c7483093d25e978dc296d879326db423a711640e3'
  $planSha = '8bb82898703fbaf4d8a4f70fd2223b02913a2c5f0cbbd85d7a17fedb251bc0b4'
  $modified = @('docs/CODEMAP.md','docs/ledger/DECISIONS.md','docs/ledger/LOG.jsonl','docs/ledger/PLAN.md','docs/ledger/STATE.md','scripts/tabwise/r2-policy.mjs','test/r2-evidence.test.mjs','test/r2-review.test.mjs')
  $added = @('docs/engineering/R2-final-handoff.md','docs/engineering/R2-owner-publication-checklist.md','fixtures/r2/plans/README.md','fixtures/r2/plans/a5-validation-smoke.json','fixtures/r2/plans/validation/broken.html','fixtures/r2/plans/validation/healthy.html','src/r2/arm-inputs.mjs')
  $allow = @($modified + $added | Sort-Object)
  function Invoke-Git { & git.exe @args; if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') failed ($LASTEXITCODE)" } }
  function Same($a, $b) { return (@(Compare-Object @($a) @($b) -SyncWindow 0).Count -eq 0) }

  Set-Location -LiteralPath $wt
  if ((Invoke-Git rev-parse --show-toplevel) -ne ($wt -replace '\\','/')) { throw 'not the final-handoff worktree' }
  if ((Invoke-Git branch --show-current) -ne $branch) { throw "branch is not $branch" }
  if ((Invoke-Git rev-parse HEAD) -ne $baseline) { throw "HEAD is not baseline $baseline" }
  & git.exe diff --cached --quiet; if ($LASTEXITCODE -ne 0) { throw 'something is already staged; unstage it first' }

  $expected = @($modified | ForEach-Object { " M $_" }) + @($added | ForEach-Object { "?? $_" }) | Sort-Object
  $actual = @(Invoke-Git -c core.quotepath=off status --porcelain=v1 --untracked-files=all) | Sort-Object
  if (-not (Same $expected $actual)) { Compare-Object $expected $actual | Format-Table | Out-String | Write-Host; throw 'inventory differs from the allowlist' }

  $status = Get-Content -Raw -LiteralPath 'scripts/tabwise/r2-status.json' | ConvertFrom-Json
  if ($status.enabled -ne $false -or $status.verdict -ne 'BLOCK') { throw 'r2-status.json is not enabled:false / BLOCK' }
  & git.exe diff --quiet HEAD -- scripts/tabwise/r2-status.json scripts/tabwise/qualification-status.json scripts/tabwise/review-status.json .github package.json package-lock.json vendor
  if ($LASTEXITCODE -ne 0) { throw 'a status file, workflow, manifest or vendor file changed' }
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath 'package-lock.json').Hash.ToLower() -ne $lockSha) { throw 'package-lock.json hash differs' }

  $digest = & node --input-type=module -e "import {r2Digest, R2_FILES, r2PlanDigest} from './scripts/tabwise/r2-policy.mjs'; import {readFileSync} from 'node:fs'; console.log([R2_FILES.length, r2Digest(), r2PlanDigest(readFileSync('fixtures/r2/plans/a5-validation-smoke.json'))].join(' '))"
  if ($LASTEXITCODE -ne 0) { throw 'digest computation failed' }
  if ($digest -ne "19 $r2Sha $planSha") { throw "digest mismatch: $digest" }

  $markers = Select-String -LiteralPath $allow -Pattern '^(<<<<<<<|>>>>>>>) |^=======$' -CaseSensitive
  if ($markers) { $markers | Out-String | Write-Host; throw 'conflict markers present' }
  Invoke-Git diff --check | Out-Null

  $r2Tests = @(Get-ChildItem -Path 'test' -Filter 'r2*.test.mjs' | ForEach-Object { 'test/' + $_.Name })
  & node --test --test-timeout=20000 @r2Tests | Select-Object -Last 8
  if ($LASTEXITCODE -ne 0) { throw 'R2 tests failed' }

  try {
    Invoke-Git add -- $allow
    $staged = @(Invoke-Git -c core.quotepath=off diff --cached --name-only) | Sort-Object
    if (-not (Same $allow $staged)) { throw 'staged set differs from the allowlist' }
    Invoke-Git diff --cached --check | Out-Null
    Invoke-Git diff --cached --stat
    $answer = Read-Host 'Type PUSH to commit and push this branch'
    if ($answer -cne 'PUSH') { throw 'not confirmed' }
  } catch { & git.exe reset -q -- $allow; throw }

  $msg = [IO.Path]::GetTempFileName()
  $lines = @(
    'feat(r2): O-11 arm-input custody, A-5 candidate plan, final handoff (D-89)',
    '',
    'F-03 / R2-L2. Adds src/r2/arm-inputs.mjs (tabwise-r2-arm-inputs/1): a sealed',
    'sibling directory recomputed from a verified run; non-zero-exit pages are never',
    'opened; every page is refused today (genuine class unavailable). Adds the',
    'candidate run plan fixtures/r2/plans/a5-validation-smoke.json (2 development',
    'pages, not approved). R2_FILES 18 -> 19. R2 stays disabled/BLOCK.',
    '',
    'Verify: node --test --test-timeout=20000 test/r2*.test.mjs;',
    'node scripts/offline-tests.mjs --profile ordinary --seed 1;',
    'node scripts/offline-tests.mjs --profile stress --seed 426136;',
    'node scripts/check-r1-baseline.mjs; node scripts/preflight.mjs.',
    '',
    'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
  )
  [IO.File]::WriteAllLines($msg, $lines, (New-Object Text.UTF8Encoding($false)))
  try { Invoke-Git commit -q -F $msg } finally { Remove-Item -LiteralPath $msg }
  Invoke-Git log --oneline -1
  Invoke-Git push -u origin "${branch}:${branch}"
  Write-Host "Open the PR: https://github.com/ANIRUDDH-001/Tabwise/compare/main...${branch}?expand=1"
}
```

## After publication

1. Open the PR at the printed URL.
2. Paste the title and description from the session report, §9.
3. Request an independent reviewer (blocker B-11).
4. Do not change `r2-status.json` in this PR.
