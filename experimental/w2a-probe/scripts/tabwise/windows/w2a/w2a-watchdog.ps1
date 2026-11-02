# W2a independent watchdog (Windows PowerShell 5.1), Revision 2. Started by the workflow, outside every owned job; it
# never holds a job handle (that would defeat kill-on-close) and loads no native code.
#   Daemon  waits for <SignalDir>\T6.ready / T7.ready, kills that host by pinned identity (pid + creation time), records
#           host exit apart from member fate, watches the members for 10 s, cleans up, and writes <case>.done.
#   Sweep   final cleanup over every identity the hosts recorded, plus attributed descendants, in up to four rounds.
# Revision 2 rules (Codex HOLD):
#   - Identity state is alive | gone | mismatch | unknown:<reason>. Unknown is never read as gone.
#   - A descendant is attributed only when its parent's row in the SAME snapshot carries the creation time of a known
#     identity, and the child was created no earlier. Anything else is 'ambiguous': recorded, never terminated, and
#     cleanup is then not confirmed.
#   - Termination is never by name or tree; each target's creation time is re-checked immediately before Kill.
param(
  [Parameter(Mandatory=$true)][ValidateSet('Daemon','Sweep')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$Out,
  [string]$SignalDir,
  [string]$StopFile,
  [string[]]$HostRecords = @(),
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9]{1,20}$')][string]$DeadlineFileTime
)
$ErrorActionPreference = 'Stop'
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$Deadline = [DateTime]::FromFileTimeUtc([int64]$DeadlineFileTime)
function Now { [string][DateTime]::UtcNow.ToFileTimeUtc() }
function Rec($obj) { $obj['t'] = Now; [System.IO.File]::AppendAllText($Out, (ConvertTo-Json -InputObject $obj -Compress -Depth 10) + "`n", $Utf8) }
function Us($FileTime) { $rem = [int64]0; return [Math]::DivRem([int64]$FileTime, [int64]10, [ref]$rem) }
function Key($Ident) { return ([string]$Ident.pid) + '@' + [string](Us $Ident.created) }
function Final([string]$s) { return ($s -eq 'terminated' -or $s -eq 'gone' -or $s -eq 'mismatch') }

# @{state; process}. process is set only when state is 'alive'.
function Probe($Ident) {
  if (-not $Ident -or -not $Ident.created) { return @{state='unknown:no-identity'; process=$null} }
  try { $p = [System.Diagnostics.Process]::GetProcessById([int]$Ident.pid) } catch [System.ArgumentException] { return @{state='gone'; process=$null} }
  catch { return @{state=('unknown:' + $_.Exception.Message); process=$null} }
  try {
    $null = $p.Handle
    if ((Us $p.StartTime.ToFileTimeUtc()) -ne (Us $Ident.created)) { return @{state='mismatch'; process=$null} }
    if ($p.HasExited) { return @{state='gone'; process=$null} }
    return @{state='alive'; process=$p}
  } catch {
    try { $p.Refresh(); if ($p.HasExited) { return @{state='gone'; process=$null} } } catch { }
    return @{state=('unknown:' + $_.Exception.Message); process=$null}
  }
}
function TerminatePinned($Ident) {
  $pr = Probe $Ident
  if ($pr.state -ne 'alive') { return $pr.state }
  try { $pr.process.Kill(); if ($pr.process.WaitForExit(2000)) { return 'terminated' } else { return 'pending' } }
  catch { $again = Probe $Ident; if (Final $again.state) { return $again.state } ; return 'error:' + $_.Exception.Message }
}
function Snapshot {
  return @(Get-CimInstance -ClassName Win32_Process -Property ProcessId,ParentProcessId,Name,CreationDate -OperationTimeoutSec 10 | ForEach-Object {
    $c = $null; if ($_.CreationDate) { $c = [int64]$_.CreationDate.ToFileTimeUtc() }
    [pscustomobject]@{pid=[int]$_.ProcessId; ppid=[int]$_.ParentProcessId; name=[string]$_.Name; created=$c} })
}
# Live roots and attributed descendants in one snapshot, plus ambiguous rows that cannot be attributed safely.
function Attributed($Roots, $Rows) {
  $byPid = @{}; foreach ($row in $Rows) { $byPid[[string]$row.pid] = $row }
  $protect = @{}; $cur = $PID
  for ($i = 0; $i -lt 10; $i++) { $protect[[string]$cur] = $true; $row = $byPid[[string]$cur]; if (-not $row -or $row.ppid -eq $cur) { break }; $cur = $row.ppid }
  $known = @{}     # pid -> creation FILETIME of a known identity
  foreach ($r in $Roots) { if ($r.created) { $known[[string]$r.pid] = [int64]$r.created } }
  $live = @{}; $ambiguous = @{}
  foreach ($r in $Roots) {
    $row = $byPid[[string]$r.pid]
    if ($row -and $null -ne $row.created -and (Us $row.created) -eq (Us $r.created)) { $live[(Key $r)] = $row }
  }
  do {
    $grew = $false
    foreach ($row in $Rows) {
      if ($row.pid -le 4 -or $protect.ContainsKey([string]$row.pid) -or $row.pid -eq $row.ppid -or -not $known.ContainsKey([string]$row.ppid)) { continue }
      if ($null -ne $row.created -and $live.ContainsKey((Key $row))) { continue }
      $parentCreated = $known[[string]$row.ppid]
      $prow = $byPid[[string]$row.ppid]
      if ($null -eq $row.created) { $ambiguous[[string]$row.pid] = [ordered]@{pid=$row.pid; ppid=$row.ppid; name=$row.name; reason='no-creation-time'}; continue }
      if ($row.created -lt $parentCreated) { continue }                     # older than the parent identity: not its child
      if (-not $prow -or $null -eq $prow.created) {
        $ambiguous[[string]$row.pid] = [ordered]@{pid=$row.pid; ppid=$row.ppid; name=$row.name; created=[string]$row.created; reason='parent-not-in-snapshot'}
        continue
      }
      if ((Us $prow.created) -ne (Us $parentCreated)) { continue }          # the ppid now names another process
      $known[[string]$row.pid] = [int64]$row.created; $live[(Key $row)] = $row; $ambiguous.Remove([string]$row.pid); $grew = $true
    }
  } while ($grew)
  return @{live=@($live.Values); ambiguous=@($ambiguous.Values)}
}
function Cleanup($Roots) {
  $terminations = @(); $confirmed = $false; $last = $null; $snapshotErrors = @()
  $unresolved = @($Roots | Where-Object { -not $_.created })   # identities without a creation time can never be pinned
  for ($round = 1; $round -le 4 -and [DateTime]::UtcNow -lt $Deadline; $round++) {
    try { $last = Attributed $Roots (Snapshot) } catch { $snapshotErrors += $_.Exception.Message; Start-Sleep -Milliseconds 1000; continue }
    if ($last.live.Count -eq 0) { break }
    foreach ($a in $last.live) {
      $id = [ordered]@{pid=$a.pid; created=[string]$a.created}
      $terminations += [ordered]@{round=$round; pid=$a.pid; name=$a.name; created=[string]$a.created; result=(TerminatePinned $id)}
    }
    $Roots = @($Roots) + @($last.live | ForEach-Object { [pscustomobject]@{pid=$_.pid; created=[string]$_.created} })
    Start-Sleep -Milliseconds 1000
  }
  $final = $null
  try { $final = Attributed $Roots (Snapshot) } catch { $snapshotErrors += $_.Exception.Message }
  $remaining = @(); $ambiguous = @()
  if ($final) {
    $remaining = @($final.live | ForEach-Object { [ordered]@{pid=$_.pid; name=$_.name; created=[string]$_.created} })
    $ambiguous = @($final.ambiguous)
  }
  $confirmed = ($null -ne $final -and $remaining.Count -eq 0 -and $ambiguous.Count -eq 0 -and $unresolved.Count -eq 0 -and $snapshotErrors.Count -eq 0)
  return [ordered]@{confirmed=$confirmed; terminations=$terminations; remaining=$remaining; ambiguous=$ambiguous; unresolved=@($unresolved); snapshot_errors=$snapshotErrors}
}

if ($Mode -eq 'Daemon') {
  if (-not $SignalDir -or -not $StopFile) { throw 'Daemon needs -SignalDir and -StopFile' }
  Rec ([ordered]@{kind='watchdog-start'; pid=$PID; deadline=$DeadlineFileTime})
  $handled = @{}
  while ([DateTime]::UtcNow -lt $Deadline -and -not (Test-Path -LiteralPath $StopFile)) {
    foreach ($case in @('T6','T7')) {
      $ready = Join-Path $SignalDir "$case.ready"
      if ($handled.ContainsKey($case) -or -not (Test-Path -LiteralPath $ready)) { continue }
      $handled[$case] = $true
      $res = [ordered]@{kind='crash-result'; case=$case}
      try {
        $r = ConvertFrom-Json -InputObject ([System.IO.File]::ReadAllText($ready, $Utf8))
        $res.leaked_handle = [bool]$r.leaked_handle; $res.host = $r.host; $res.unknown_at_arm = @($r.unknown)
        $members = @($r.members)
        # Host termination is recorded on its own; it is not evidence about the members.
        $hp = Probe $r.host
        $res.host_state_before_kill = $hp.state
        if ($hp.state -eq 'alive') {
          try { $hp.process.Kill(); $res.host_exit_confirmed = $hp.process.WaitForExit(5000) } catch { $res.host_kill_error = $_.Exception.Message; $res.host_exit_confirmed = $false }
        } else { $res.host_exit_confirmed = $false }
        $res.killed_at = Now
        $res.all_gone_at = $null
        $watchEnd = [DateTime]::UtcNow.AddSeconds(10)
        do {
          $states = @($members | ForEach-Object { (Probe $_).state })
          if (-not @($states | Where-Object { -not (Final $_) }).Count) { $res.all_gone_at = Now; break }
          Start-Sleep -Milliseconds 500
        } while ([DateTime]::UtcNow -lt $watchEnd)
        $res.members_at_10s = @($members | ForEach-Object { [ordered]@{pid=$_.pid; created=[string]$_.created; state=(Probe $_).state} })
        $res.survivors_at_10s = @($res.members_at_10s | Where-Object { $_.state -eq 'alive' })
        $res.unknown_at_10s = @($res.members_at_10s | Where-Object { $_.state -ne 'alive' -and -not (Final $_.state) })
        $roots = @($members) + @($r.host) + @($r.unknown | ForEach-Object { [pscustomobject]@{pid=$_.pid; created=$null} })
        $res.cleanup = Cleanup $roots
      } catch { $res.error = $_.Exception.Message }
      Rec $res
      [System.IO.File]::WriteAllText((Join-Path $SignalDir "$case.done"), (Now), $Utf8)
    }
    Start-Sleep -Milliseconds 250
  }
  $reason = 'stop-file'; if (-not (Test-Path -LiteralPath $StopFile)) { $reason = 'deadline' }
  Rec ([ordered]@{kind='watchdog-end'; handled=@($handled.Keys); reason=$reason})
  exit 0
}

# Sweep
$roots = @{}; $inputErrors = @()
foreach ($file in $HostRecords) {
  if (-not (Test-Path -LiteralPath $file)) { $inputErrors += "missing $file"; continue }
  foreach ($line in [System.IO.File]::ReadAllLines($file, $Utf8)) {
    if (-not $line) { continue }
    try { $o = ConvertFrom-Json -InputObject $line } catch { $inputErrors += "unparseable line in $file"; continue }
    $ids = @()
    if ($o.kind -eq 'tracked') { $ids = @($o) } elseif ($o.kind -eq 'members' -or $o.kind -eq 'members-at-end') { $ids = @($o.members) + @($o.unknown) } elseif ($o.kind -eq 'host-start') { $ids = @($o.host) }
    foreach ($i in $ids) {
      if (-not $i -or -not $i.pid) { continue }
      if ($i.created) { $roots[(Key $i)] = [pscustomobject]@{pid=[int]$i.pid; created=[string]$i.created} }
      else { $roots['nocreated:' + $i.pid] = [pscustomobject]@{pid=[int]$i.pid; created=$null} }
    }
  }
}
$result = Cleanup @($roots.Values)
$confirmed = $result.confirmed -and $inputErrors.Count -eq 0
Rec ([ordered]@{kind='sweep'; roots=$roots.Count; confirmed=$confirmed; input_errors=$inputErrors; terminations=$result.terminations; remaining=$result.remaining;
  ambiguous=$result.ambiguous; unresolved=$result.unresolved; snapshot_errors=$result.snapshot_errors})
if ($confirmed) { exit 0 } else { exit 1 }
