# Commit/push only after the owner approves the external reviewed-state seal and cross-tool verdict.
param(
  [Parameter(Mandatory = $true)][string]$ReviewedManifest,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{64}$')][string]$ReviewedManifestSha256
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$env:GIT_PAGER = 'cat'
$env:PAGER = 'cat'
$taskWorktree = 'C:\Users\ANIRUDDH\.codex\worktrees\tabwise-r1-safety\app'
$expectedOrigin = 'https://github.com/ANIRUDDH-001/Tabwise'
$baseSha = '6eceb0e64075ba522866f344719a643f3744ca59'
$reviewBranch = 'test/d51-reliability'
$approvedPaths = @(
  'test/broker.test.mjs', 'test/engineering.test.mjs', 'test/sendguard.test.mjs',
  'test/speech.test.mjs', 'test/vendor.test.mjs', 'test/helpers/faults.mjs',
  'test/helpers/sandbox.mjs', 'test/helpers/reliability.mjs',
  'docs/CODEMAP.md', 'docs/ledger/DECISIONS.md', 'docs/ledger/LOG.jsonl',
  'docs/ledger/PLAN.md', 'docs/ledger/STATE.md',
  'docs/reviews/D51-report.md', 'docs/reviews/D51-results.json',
  'docs/reviews/D51-review.md', 'docs/reviews/D51-publish.ps1'
)
$gitExecutable = (Get-Command git -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source

# .NET Framework has no ProcessStartInfo.ArgumentList. Quote each Windows argv value directly;
# no shell parses these arguments. Concurrent pipe reads avoid stderr/stdout deadlocks in both shells.
function ConvertTo-D51NativeArgument {
  param([AllowEmptyString()][string]$Value)
  if ($Value.IndexOf([char]0) -ge 0) { throw 'NUL in native argument.' }
  $builder = New-Object Text.StringBuilder
  [void]$builder.Append('"'); $slashes = 0
  foreach ($ch in $Value.ToCharArray()) {
    if ($ch -eq '\') { $slashes++; continue }
    if ($ch -eq '"') { [void]$builder.Append(('\' * (2 * $slashes + 1))) }
    else { [void]$builder.Append(('\' * $slashes)) }
    [void]$builder.Append($ch); $slashes = 0
  }
  [void]$builder.Append(('\' * (2 * $slashes))); [void]$builder.Append('"')
  return $builder.ToString()
}
function Invoke-D51GitResult {
  param([string[]]$GitArguments)
  $start = New-Object Diagnostics.ProcessStartInfo
  $start.FileName = $gitExecutable
  $start.Arguments = ((@('--no-pager', '--no-replace-objects', '-c', 'core.quotepath=false') + $GitArguments | ForEach-Object { ConvertTo-D51NativeArgument $_ }) -join ' ')
  $start.WorkingDirectory = $taskWorktree
  $start.UseShellExecute = $false; $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
  $start.StandardOutputEncoding = New-Object Text.UTF8Encoding($false)
  $start.StandardErrorEncoding = New-Object Text.UTF8Encoding($false)
  $process = New-Object Diagnostics.Process
  $process.StartInfo = $start
  try {
    if (-not $process.Start()) { throw 'Could not start Git.' }
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    return [pscustomobject]@{ ExitCode = $process.ExitCode; Stdout = $stdout.GetAwaiter().GetResult(); Stderr = $stderr.GetAwaiter().GetResult() }
  } finally { $process.Dispose() }
}
function Invoke-D51Git {
  param([string[]]$GitArguments)
  $result = Invoke-D51GitResult $GitArguments
  if ($result.Stderr) { Write-Host $result.Stderr }
  if ($result.ExitCode -ne 0) { throw "git exit $($result.ExitCode): $($GitArguments -join ' ')`n$($result.Stdout)`n$($result.Stderr)" }
  if ($result.Stdout.Length) { return $result.Stdout.TrimEnd([char[]]"`r`n") -split '\r?\n' }
}
function Assert-D51Paths {
  param([string[]]$Actual, [string]$Label)
  if (@($Actual).Count -ne $approvedPaths.Count -or @(Compare-Object ($approvedPaths | Sort-Object -CaseSensitive) ($Actual | Sort-Object -CaseSensitive) -CaseSensitive).Count -ne 0) { throw "$Label differs from exactly the 17 approved paths." }
}
function Assert-D51VisibleIndex {
  if (@(Invoke-D51Git @('ls-files', '-v') | Where-Object { $_ -cmatch '^[a-zS] ' }).Count -ne 0) {
    throw 'Hidden index flags (assume-unchanged/skip-worktree); no commit or push. Flags were left untouched.'
  }
}
function Get-D51FileSha256 {
  param([string]$Path)
  $stream = [IO.File]::OpenRead($Path)
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
  finally { $hasher.Dispose(); $stream.Dispose() }
}
function Get-D51Remote {
  $main = $null; $branch = $null
  foreach ($row in @(Invoke-D51Git @('ls-remote', '--heads', 'origin', 'refs/heads/main', "refs/heads/$reviewBranch"))) {
    $parts = $row -split '\s+'
    if ($parts.Count -ne 2 -or $parts[0] -notmatch '^[0-9a-f]{40}$') { throw 'Malformed remote ref reply.' }
    if ($parts[1] -ceq 'refs/heads/main') { if ($null -ne $main) { throw 'Duplicate remote main.' }; $main = $parts[0] }
    elseif ($parts[1] -ceq "refs/heads/$reviewBranch") { if ($null -ne $branch) { throw 'Duplicate remote review branch.' }; $branch = $parts[0] }
  }
  return [pscustomobject]@{ Main = $main; Review = $branch }
}
function Assert-D51RemoteBeforePush {
  Assert-D51Origin
  $remote = Get-D51Remote
  if ($remote.Main -cne $baseSha) { throw 'Remote main changed or is missing.' }
  if ($null -ne $remote.Review) { throw 'The review branch already exists remotely; do not overwrite it.' }
}
function Assert-D51Origin {
  foreach ($kind in @('fetch', 'push')) {
    $argsForUrl = if ($kind -eq 'push') { @('remote', 'get-url', '--all', '--push', 'origin') } else { @('remote', 'get-url', '--all', 'origin') }
    $urls = @(Invoke-D51Git $argsForUrl)
    if ($urls.Count -ne 1 -or ($urls[0].TrimEnd('/') -cne $expectedOrigin -and $urls[0].TrimEnd('/') -cne "$expectedOrigin.git")) { throw "Unexpected $kind origin." }
  }
}
function Assert-D51ReviewedFiles {
  param([string]$Revision = '')
  foreach ($entry in $seal.files) {
    $file = Join-Path $taskWorktree $entry.path
    if ((Get-D51FileSha256 $file) -cne $entry.rawSha256) { throw "Reviewed bytes changed: $($entry.path)" }
    $treePath = if ($Revision) { "${Revision}:$($entry.path)" } else { ":$($entry.path)" }
    $blob = (Invoke-D51Git @('rev-parse', '--verify', $treePath)) -join ''
    if ($blob -cne $entry.gitBlob) { throw "Reviewed Git contents changed: $($entry.path)" }
    $row = if ($Revision) { (Invoke-D51Git @('ls-tree', $Revision, '--', $entry.path)) -join '' } else { (Invoke-D51Git @('ls-files', '--stage', '--', $entry.path)) -join '' }
    if (($row -split '\s+')[0] -cne $entry.mode) { throw "Reviewed Git mode changed: $($entry.path)" }
  }
}
function Assert-D51Source {
  foreach ($entry in $results.correction.finalCode.PSObject.Properties) {
    if ($entry.Name -match '(^|/)\.\.(/|$)|^[A-Za-z]:|^/') { throw 'Invalid source manifest path.' }
    $text = [IO.File]::ReadAllText((Join-Path $taskWorktree $entry.Name)).Replace("`r`n", "`n")
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $actual = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
    if ($actual -cne $entry.Value) { throw "Final qualification source changed: $($entry.Name)" }
  }
}

Set-Location -LiteralPath $taskWorktree
if ([IO.Path]::GetFullPath(((Invoke-D51Git @('rev-parse', '--show-toplevel')) -join '')) -ne [IO.Path]::GetFullPath($taskWorktree)) { throw 'Wrong worktree.' }
if (((Invoke-D51Git @('rev-parse', 'HEAD')) -join '') -cne $baseSha) { throw 'HEAD is not the reviewed base.' }
if (((Invoke-D51Git @('branch', '--show-current')) -join '') -cne $reviewBranch) { throw 'Wrong branch.' }
Assert-D51VisibleIndex
Assert-D51RemoteBeforePush
if (@(Invoke-D51Git @('diff', '--cached', '--name-only')).Count -ne 0) { throw 'The index already contains work; nothing was staged by this script.' }
foreach ($changed in @(Invoke-D51Git @('diff', '--name-only'))) { if ($approvedPaths -cnotcontains $changed) { throw "Unapproved tracked change: $changed" } }
$sealPath = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $ReviewedManifest).Path)
$workspacePrefix = [IO.Path]::GetFullPath($taskWorktree).TrimEnd([char[]]'\/') + [IO.Path]::DirectorySeparatorChar
if ($sealPath.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Keep the reviewed-state seal outside the worktree.' }
$sealBytes = [IO.File]::ReadAllBytes($sealPath)
$sealHasher = [Security.Cryptography.SHA256]::Create()
try { $sealHash = ([BitConverter]::ToString($sealHasher.ComputeHash($sealBytes))).Replace('-', '').ToLowerInvariant() } finally { $sealHasher.Dispose() }
if ($sealHash -cne $ReviewedManifestSha256.ToLowerInvariant()) { throw 'Reviewed-state seal hash mismatch.' }
$seal = [Text.Encoding]::UTF8.GetString($sealBytes).TrimStart([char]0xfeff) | ConvertFrom-Json
if ($seal.format -cne 'tabwise-d51-reviewed-state-v2' -or $seal.base -cne $baseSha -or $seal.branch -cne $reviewBranch) { throw 'Wrong reviewed-state seal.' }
Assert-D51Paths @($seal.files | ForEach-Object { $_.path }) 'Seal inventory'
foreach ($entry in $seal.files) {
  if ($approvedPaths -cnotcontains $entry.path -or $entry.gitBlob -notmatch '^[0-9a-f]{40}$' -or $entry.mode -notmatch '^100(644|755)$' -or $entry.rawSha256 -notmatch '^[0-9a-f]{64}$') { throw 'Invalid reviewed-state entry.' }
}
$results = [IO.File]::ReadAllText((Join-Path $taskWorktree 'docs/reviews/D51-results.json')) | ConvertFrom-Json
$qualified = @($results.correction.qualification.results)
if ($qualified.Count -lt 20 -or @($qualified | Where-Object { -not $_.ok -or $_.tests -ne 206 -or $_.pass -ne 206 -or $_.cancelled -ne 0 }).Count -ne 0) { throw 'New final-source qualification is incomplete or failed.' }
Assert-D51Source
foreach ($entry in $seal.files) {
  if ((Get-D51FileSha256 (Join-Path $taskWorktree $entry.path)) -cne $entry.rawSha256) { throw "Reviewed bytes changed before staging: $($entry.path)" }
}
Invoke-D51Git (@('--literal-pathspecs', 'add', '--') + $approvedPaths)
Assert-D51Paths @(Invoke-D51Git @('diff', '--cached', '--name-only')) 'Staged inventory'
Assert-D51ReviewedFiles
$approvedTree = (Invoke-D51Git @('write-tree')) -join ''
Invoke-D51Git @('diff', '--cached', '--check')
Invoke-D51Git @('diff', '--cached', '--stat')
Invoke-D51Git @('diff', '--cached', '--')
& node scripts/preflight.mjs
if ($LASTEXITCODE -ne 0) { throw 'Integrity verification failed; no commit or push.' }
& node --test --test-timeout=10000 --test-reporter=tap 'test/*.test.mjs'
if ($LASTEXITCODE -ne 0) { throw 'Offline verification failed; no commit or push.' }
& node scripts/preflight.mjs
if ($LASTEXITCODE -ne 0) { throw 'Post-test integrity failed; no commit or push.' }
Assert-D51Source
Assert-D51ReviewedFiles
if (((Invoke-D51Git @('write-tree')) -join '') -cne $approvedTree) { throw 'Staged tree changed during verification.' }
Assert-D51VisibleIndex
Invoke-D51Git @('diff', '--exit-code', '--')
Assert-D51RemoteBeforePush
$trackedBytes = @{}
foreach ($path in @(Invoke-D51Git @('ls-tree', '-r', '--name-only', $approvedTree))) {
  $trackedBytes[$path] = Get-D51FileSha256 (Join-Path $taskWorktree $path)
}
$commitMessage = @'
test(r1): eliminate residual CI timing races (D-51)

F-02 / D-51: separate positive fake-operation budgets from timeout fault
cases, synchronize cleanup and late work, and assert exact failure causes.
Preserve production safety, source locks, fixtures, dependencies and workflows.

Seal the reviewed staged tree across hooks and verify the exact committed
parent, paths, contents and message before pushing its immutable commit ID.

Verification: node scripts/preflight.mjs; node --test --test-timeout=10000
--test-reporter=tap "test/*.test.mjs"; final-source qualification, mutations
and PowerShell 5.1/7 scratch checks are recorded in D51-results.json.
'@
$messageFile = [IO.Path]::GetTempFileName()
try {
  [IO.File]::WriteAllText($messageFile, $commitMessage, (New-Object Text.UTF8Encoding($false)))
  Invoke-D51Git @('commit', '--file', $messageFile)
} finally { Remove-Item -LiteralPath $messageFile }
$verifiedCommit = (Invoke-D51Git @('rev-parse', '--verify', 'HEAD')) -join ''
$parents = @(); $trees = @()
foreach ($header in @(Invoke-D51Git @('cat-file', 'commit', $verifiedCommit))) {
  if ($header -ceq '') { break }
  if ($header -cmatch '^parent ([0-9a-f]{40})$') { $parents += $Matches[1] }
  if ($header -cmatch '^tree ([0-9a-f]{40})$') { $trees += $Matches[1] }
}
if ($parents.Count -ne 1 -or $parents[0] -cne $baseSha) { throw 'Committed parent is not exactly the reviewed base; no push.' }
if ($trees.Count -ne 1) { throw 'Malformed committed tree header; no push.' }
$committedTree = $trees[0]
if ($committedTree -cne $approvedTree) { throw 'Committed tree differs from the approved staged tree; no push.' }
Assert-D51Paths @(Invoke-D51Git @('diff-tree', '--no-commit-id', '--name-only', '-r', $baseSha, $verifiedCommit)) 'Committed inventory'
Assert-D51ReviewedFiles $verifiedCommit
Assert-D51VisibleIndex
if (((Invoke-D51Git @('write-tree')) -join '') -cne $committedTree -or @(Invoke-D51Git @('diff', '--cached', '--name-only', $verifiedCommit)).Count -ne 0) { throw 'Extra staged modifications remain after commit; no push.' }
Invoke-D51Git @('diff', '--exit-code', $verifiedCommit, '--')
foreach ($path in $trackedBytes.Keys) {
  if ((Get-D51FileSha256 (Join-Path $taskWorktree $path)) -cne $trackedBytes[$path]) { throw "Tracked worktree bytes changed during hooks: $path; no push." }
}
$writtenMessage = ((Invoke-D51Git @('show', '-s', '--format=%B', $verifiedCommit)) -join "`n").TrimEnd()
if ($writtenMessage -cne $commitMessage.Replace("`r`n", "`n").TrimEnd()) { throw 'Commit message changed; no push.' }
Assert-D51RemoteBeforePush
# No retry: a nonzero/exceptional push may already have updated the remote.
$push = $null; $pushError = $null
try { $push = Invoke-D51GitResult @('push', '--no-follow-tags', 'origin', "${verifiedCommit}:refs/heads/$reviewBranch") } catch { $pushError = $_.Exception.Message }
if ($null -ne $push) { if ($push.Stdout) { Write-Host $push.Stdout }; if ($push.Stderr) { Write-Host $push.Stderr } }
try { $remote = Get-D51Remote } catch { throw "Push outcome is uncertain; do not retry. Ref inspection failed: $($_.Exception.Message)" }
if ($pushError -or $null -eq $push -or $push.ExitCode -ne 0) {
  $detail = if ($pushError) { $pushError } else { "Git exit $($push.ExitCode): $($push.Stderr)" }
  throw "Push reported an error; do not retry. Observed review=$($remote.Review), main=$($remote.Main), intended=$verifiedCommit. $detail"
}
if ($remote.Review -cne $verifiedCommit -or $remote.Main -cne $baseSha) { throw "Post-push ref mismatch; do not retry. Review=$($remote.Review), main=$($remote.Main), intended=$verifiedCommit" }
Write-Host "Published and read back exact review commit $verifiedCommit; main unchanged."
Invoke-D51Git @('status', '--short')
