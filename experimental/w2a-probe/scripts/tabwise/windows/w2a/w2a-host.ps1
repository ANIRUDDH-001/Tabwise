# W2a containment feasibility host (Windows PowerShell 5.1), Revision 2. Diagnostic only, for one disposable hosted VM.
# Modes:
#   Run         run the listed cases and append one JSON record per line to -Out
#   SelfReport  print this process's job facts as one JSON line (started inside the owned job by w2a-child.mjs)
#   Breakaway   inside the owned job: try CREATE_BREAKAWAY_FROM_JOB, and spawn one ordinary child as a control
# The native boundary (JobProbe.cs) is compiled only after its bytes match -ExpectedSourceSha256. Every FILETIME and
# every value that can exceed 2^53 is written as a decimal string.
# Revision 2 rules (Codex HOLD):
#   - A failed observation is "unknown", never "gone"; unknown members or survivors make a case inconclusive.
#   - Descendants are adopted only when the parent's pid AND creation time match a known identity (no pid-only links).
#   - Each case has one context that owns its job, children and out-of-job identities; Finish-Case always runs.
#   - Every wait is bounded by -DeadlineFileTime minus a cleanup reserve.
param(
  [Parameter(Mandatory=$true)][ValidateSet('Run','SelfReport','Breakaway')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$Source,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{64}$')][string]$ExpectedSourceSha256,
  [string]$Out,
  [string]$Cases,
  [string]$NodeExe,
  [string]$Child,
  [string]$SignalDir,
  [ValidatePattern('^[0-9]{1,20}$')][string]$DeadlineFileTime = '0',
  [int]$HoldMs = 0
)
$ErrorActionPreference = 'Stop'
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$PsExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$ReserveMs = 20000   # kept back from every wait so a case can still end its job and record cleanup

function Now { [string][DateTime]::UtcNow.ToFileTimeUtc() }
function Us($FileTime) { $rem = [int64]0; return [Math]::DivRem([int64]$FileTime, [int64]10, [ref]$rem) }
function Sha256File([string]$Path) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { $s = [System.IO.File]::OpenRead($Path); try { ([BitConverter]::ToString($sha.ComputeHash($s)) -replace '-','').ToLowerInvariant() } finally { $s.Dispose() } }
  finally { $sha.Dispose() }
}
function Rec($obj) {
  if (-not $Out) { return }
  $obj['t'] = Now
  [System.IO.File]::AppendAllText($Out, (ConvertTo-Json -InputObject $obj -Compress -Depth 10) + "`n", $Utf8)
}

# ---- Load the native boundary: hash the exact bytes, then compile those same bytes. ----------------------------------
$probe = [ordered]@{kind='probe-load'; mode=$Mode; host_pid=$PID}
$bytes = [System.IO.File]::ReadAllBytes($Source)
$sha = [System.Security.Cryptography.SHA256]::Create()
try { $probe.source_sha256 = ([BitConverter]::ToString($sha.ComputeHash($bytes)) -replace '-','').ToLowerInvariant() } finally { $sha.Dispose() }
if ($probe.source_sha256 -cne $ExpectedSourceSha256) {
  $probe.ok = $false; $probe.error = 'JobProbe.cs SHA-256 does not match the pinned value; nothing compiled'
  Rec $probe
  [Console]::Error.WriteLine($probe.error); exit 4
}
$runtimeDir = [System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()
$csc = Join-Path $runtimeDir 'csc.exe'
$probe.ps_version = $PSVersionTable.PSVersion.ToString()
$probe.clr_version = [Environment]::Version.ToString()
$probe.runtime_dir = $runtimeDir
$probe.netfx_release = [string](Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full' -Name Release).Release
if (Test-Path -LiteralPath $csc) {
  $probe.csc = [ordered]@{path=$csc; file_version=[System.Diagnostics.FileVersionInfo]::GetVersionInfo($csc).FileVersion; sha256=(Sha256File $csc)}
} else { $probe.csc = $null }
$sw = [System.Diagnostics.Stopwatch]::StartNew()
try {
  Add-Type -TypeDefinition ($Utf8.GetString($bytes)) -Language CSharp
} catch {
  $probe.ok = $false; $probe.error = 'Add-Type failed: ' + $_.Exception.Message
  Rec $probe
  [Console]::Error.WriteLine($probe.error); exit 4
}
$probe.compile_ms = [int]$sw.ElapsedMilliseconds
$asm = [TabwiseW2a.JobProbe].Assembly
$probe.assembly = [ordered]@{full_name=$asm.FullName; location=$asm.Location; sha256=$null; trusted=$false}
if ($asm.Location -and (Test-Path -LiteralPath $asm.Location)) { $probe.assembly.sha256 = Sha256File $asm.Location }
$probe.ok = $true
Rec $probe

# ---- Time ------------------------------------------------------------------------------------------------------------
# Milliseconds a wait may use: at most $Ms, and never past the absolute deadline minus the cleanup reserve.
function Budget([int]$Ms) {
  if ($DeadlineFileTime -eq '0') { return $Ms }
  $left = [int64]((([int64]$DeadlineFileTime) - [DateTime]::UtcNow.ToFileTimeUtc()) / 10000) - $ReserveMs
  if ($left -lt 0) { return 0 }
  return [int][Math]::Min([int64]$Ms, $left)
}

# ---- Identity --------------------------------------------------------------------------------------------------------
# state: identified | vanished (no such pid, Win32 87) | unknown:<error>. Only 'identified' carries a creation time.
function Identify([int]$ProcessId) {
  $err = 0
  $h = [TabwiseW2a.JobProbe]::OpenQueryEx($ProcessId, [ref]$err)
  if ($h -eq [IntPtr]::Zero) {
    if ($err -eq [TabwiseW2a.JobProbe]::ERROR_INVALID_PARAMETER) { return [ordered]@{pid=$ProcessId; created=$null; state='vanished'} }
    return [ordered]@{pid=$ProcessId; created=$null; state=('unknown:' + $err)}
  }
  try { return [ordered]@{pid=$ProcessId; created=[string][TabwiseW2a.JobProbe]::CreationTime($h); state='identified'} }
  catch { return [ordered]@{pid=$ProcessId; created=$null; state=('unknown:' + [TabwiseW2a.JobProbe]::Win32Code($_.Exception))} }
  finally { [TabwiseW2a.JobProbe]::Close($h) }
}
function Ident($i) { return [ordered]@{pid=[int]$i.pid; created=[string]$i.created} }
function Key($i) { return ([string]$i.pid) + '@' + [string](Us $i.created) }
# alive | gone | mismatch | unknown:<error>; an identity without a creation time is always unknown.
function State($i) {
  if (-not $i -or -not $i.created) { return 'unknown:no-identity' }
  return [TabwiseW2a.JobProbe]::IdentityState([int]$i.pid, [int64]$i.created)
}
function Final([string]$s) { return ($s -eq 'terminated' -or $s -eq 'gone' -or $s -eq 'mismatch') }

# Job facts for one identity. in_owned_job is $null unless the process was opened and its creation time matched.
function JobFacts([IntPtr]$Job, $I) {
  $err = 0
  $h = [TabwiseW2a.JobProbe]::OpenQueryEx([int]$I.pid, [ref]$err)
  if ($h -eq [IntPtr]::Zero) { return [ordered]@{pid=[int]$I.pid; created=[string]$I.created; open=$false; open_error=$err; in_owned_job=$null} }
  try {
    $f = [ordered]@{pid=[int]$I.pid; created=[string]$I.created; open=$true; open_error=0; in_owned_job=$null}
    $f.actual_created = [string][TabwiseW2a.JobProbe]::CreationTime($h)
    $f.identity_match = ((Us $f.actual_created) -eq (Us $I.created))
    if (-not $f.identity_match) { return $f }
    $f.in_any_job = [TabwiseW2a.JobProbe]::InAnyJobPublic($h)
    if ($Job -ne [IntPtr]::Zero) { $f.in_owned_job = [TabwiseW2a.JobProbe]::InJob($h, $Job) }
    try { $f.integrity_rid = [TabwiseW2a.JobProbe]::IntegrityRid($h) } catch { $f.integrity_error = $_.Exception.Message }
    return $f
  } catch { $f.query_error = $_.Exception.Message; $f.in_owned_job = $null; return $f }
  finally { [TabwiseW2a.JobProbe]::Close($h) }
}
# The job's own pid list, each pid identified. Unknown pids are kept, never dropped.
function Members([IntPtr]$Job) {
  $r = [ordered]@{identified=@(); vanished=@(); unknown=@()}
  foreach ($id in [TabwiseW2a.JobProbe]::JobPids($Job)) {
    $i = Identify $id
    if ($i.state -eq 'identified') { $r.identified += (Ident $i) }
    elseif ($i.state -eq 'vanished') { $r.vanished += $id }
    else { $r.unknown += $i }
  }
  return $r
}
# One 'members' record per case (the in-case measurement the verdict corroborates); EndJob writes 'members-at-end'.
function RecMembers($Ctx, $M, [string]$Kind = 'members') {
  foreach ($i in $M.identified) { if (-not ($Ctx.members | Where-Object { (Key $_) -eq (Key $i) })) { $Ctx.members += $i } }
  foreach ($u in $M.unknown) { $Ctx.unknown_members += $u }
  Rec ([ordered]@{kind=$Kind; case=$Ctx.case; members=$M.identified; vanished=$M.vanished; unknown=$M.unknown})
}
function Track([string]$Case, $I, [string]$Role) {
  if ($I) { Rec ([ordered]@{kind='tracked'; case=$Case; role=$Role; pid=[int]$I.pid; created=[string]$I.created}) }
}

# ---- Attribution (pid-reuse safe) --------------------------------------------------------------------------------------
function Snapshot {
  return @(Get-CimInstance -ClassName Win32_Process -Property ProcessId,ParentProcessId,Name,CreationDate -OperationTimeoutSec 10 | ForEach-Object {
    $c = $null; if ($_.CreationDate) { $c = [int64]$_.CreationDate.ToFileTimeUtc() }
    [pscustomobject]@{pid=[int]$_.ProcessId; ppid=[int]$_.ParentProcessId; name=[string]$_.Name; created=$c} })
}
# Descendants of a root identity in one snapshot. A row is adopted only when the row for its ppid in the SAME snapshot
# has the creation time of a known identity, and the row was created no earlier than that parent. A row whose parent
# is absent from the snapshot, or that has no creation time, is 'ambiguous': recorded, never adopted, never terminated.
function Tree($RootIdent) {
  $rows = Snapshot
  $byPid = @{}; foreach ($r in $rows) { $byPid[[string]$r.pid] = $r }
  $known = @{}; $known[[string]$RootIdent.pid] = [int64]$RootIdent.created
  $nodes = @(); $ambiguous = @{}
  $rootRow = $byPid[[string]$RootIdent.pid]
  $rootSeen = [bool]($rootRow -and $null -ne $rootRow.created -and (Us $rootRow.created) -eq (Us $RootIdent.created))
  do {
    $grew = $false
    foreach ($r in $rows) {
      if ($known.ContainsKey([string]$r.pid) -or $r.pid -eq $r.ppid -or -not $known.ContainsKey([string]$r.ppid)) { continue }
      $parentCreated = [int64]$known[[string]$r.ppid]
      $prow = $byPid[[string]$r.ppid]
      if ($null -eq $r.created) { $ambiguous[[string]$r.pid] = [ordered]@{pid=$r.pid; ppid=$r.ppid; name=$r.name; reason='no-creation-time'}; continue }
      if (-not $prow -or $null -eq $prow.created) {
        if ($r.created -ge $parentCreated) { $ambiguous[[string]$r.pid] = [ordered]@{pid=$r.pid; ppid=$r.ppid; name=$r.name; created=[string]$r.created; reason='parent-not-in-snapshot'} }
        continue
      }
      if ((Us $prow.created) -ne (Us $parentCreated)) { continue }   # the ppid now names another process: not ours
      if ($r.created -lt $parentCreated) { continue }               # created before the parent: not its child
      $known[[string]$r.pid] = $r.created
      $nodes += [ordered]@{pid=$r.pid; ppid=$r.ppid; parent_created=[string]$parentCreated; name=$r.name; created=[string]$r.created}
      $ambiguous.Remove([string]$r.pid)
      $grew = $true
    }
  } while ($grew)
  return [ordered]@{root_seen=$rootSeen; nodes=$nodes; ambiguous=@($ambiguous.Values)}
}

# ---- Child processes -------------------------------------------------------------------------------------------------
function WaitLine($ChildObj, [string]$Event, [int]$TimeoutMs) {
  $ms = Budget $TimeoutMs
  $deadline = [DateTime]::UtcNow.AddMilliseconds($ms)
  do {
    foreach ($l in $ChildObj.SnapshotStdout()) {
      if ($l.StartsWith('{"w2a":')) { $o = ConvertFrom-Json -InputObject $l; if ($o.w2a -ceq $Event) { return $o } }
    }
    Start-Sleep -Milliseconds 100
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "timed out after $ms ms waiting for '$Event' from pid $($ChildObj.Pid)"
}
function WaitExit($ChildObj, [int]$TimeoutMs) {
  $code = [uint32]0
  if ([TabwiseW2a.JobProbe]::WaitExit($ChildObj, [uint32](Budget $TimeoutMs), [ref]$code)) { return [int64]$code }
  return $null
}
function ChildOutput($c) {
  return [ordered]@{stdout=@($c.SnapshotStdout() | Select-Object -Last 40); stderr=@($c.SnapshotStderr() | Select-Object -Last 40);
    stdout_eof_at=[string]$c.StdoutEofFileTime; stdout_error=$c.StdoutError; stderr_eof_at=[string]$c.StderrEofFileTime; stderr_error=$c.StderrError}
}

# ---- Case context: the single cleanup owner for one case ---------------------------------------------------------------
function NewCtx([string]$Case, [bool]$InJob, [bool]$Inheritable) {
  $ctx = @{case=$Case; job=[IntPtr]::Zero; children=@(); outside=@(); members=@(); unknown_members=@(); ended=$false; end_ok=$false}
  if ($InJob) { $ctx.job = [TabwiseW2a.JobProbe]::CreateOwnedJob($Inheritable) }
  return $ctx
}
# Spawn into the case's job (or outside any job), and register the child with the context before anything can throw.
function SpawnIn($Ctx, [string]$App, [string[]]$ChildArgs, [string]$Role, [IntPtr[]]$Extra, [bool]$Breakaway) {
  $c = [TabwiseW2a.JobProbe]::Spawn($Ctx.job, $App, $ChildArgs, $Extra, $Breakaway, (Split-Path -Parent $Child))
  $Ctx.children += $c
  $i = [ordered]@{pid=$c.Pid; created=[string]$c.CreatedFileTime}
  if ($Ctx.job -eq [IntPtr]::Zero) { $Ctx.outside += $i }
  Track $Ctx.case $i $Role
  return $c
}
function SpawnNode($Ctx, [string[]]$ChildArgs, [string]$Role, [IntPtr[]]$Extra) { return SpawnIn $Ctx $NodeExe (@($Child) + $ChildArgs) $Role $Extra $false }

# Terminate the job, then confirm emptiness from the job itself and from each recorded member's identity state.
# ok only when the job reports no process, no pid remains, and every member is gone or mismatched (none alive or unknown).
function EndJob($Ctx, [string]$Reason) {
  if ($Ctx.ended -or $Ctx.job -eq [IntPtr]::Zero) { return $Ctx.end_ok }
  $Ctx.ended = $true
  $r = [ordered]@{kind='emptied'; case=$Ctx.case; reason=$Reason; errors=@()}
  try {
    try { RecMembers $Ctx (Members $Ctx.job) 'members-at-end' } catch { $r.errors += ('members: ' + $_.Exception.Message) }
    $r.members = @($Ctx.members); $r.unknown_members = @($Ctx.unknown_members)
    try { [TabwiseW2a.JobProbe]::TerminateJob($Ctx.job, [uint32]0xC0DE0001) } catch { $r.errors += ('terminate: ' + $_.Exception.Message) }
    $r.terminate_called_at = Now
    $r.active_processes = $null; $r.pids_after = $null
    $deadline = [DateTime]::UtcNow.AddMilliseconds([Math]::Max(1000, (Budget 5000)))
    do {
      try { $acc = [TabwiseW2a.JobProbe]::QueryAccounting($Ctx.job); $r.active_processes = [int]$acc.ActiveProcesses } catch { $r.errors += ('accounting: ' + $_.Exception.Message); break }
      if ($r.active_processes -eq 0) { break }
      Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    try { $r.pids_after = @([TabwiseW2a.JobProbe]::JobPids($Ctx.job)) } catch { $r.errors += ('pids: ' + $_.Exception.Message) }
    $r.terminated_at = Now
    $r.survivors = @(); $r.unknown_after = @()
    foreach ($m in $r.members) {
      $s = State $m
      if ($s -eq 'alive') { $r.survivors += [ordered]@{pid=$m.pid; created=$m.created; pin=[TabwiseW2a.JobProbe]::TerminatePinned([int]$m.pid, [int64]$m.created, 2000)} }
      elseif (-not (Final $s)) { $r.unknown_after += [ordered]@{pid=$m.pid; created=$m.created; state=$s} }
    }
  } finally {
    try { [TabwiseW2a.JobProbe]::Close($Ctx.job) } catch { $r.errors += ('close: ' + $_.Exception.Message) }
    $Ctx.job = [IntPtr]::Zero
    $r.ok = ($r.errors.Count -eq 0 -and $r.active_processes -eq 0 -and $null -ne $r.pids_after -and $r.pids_after.Count -eq 0 -and
      $r.survivors.Count -eq 0 -and $r.unknown_after.Count -eq 0 -and $r.unknown_members.Count -eq 0 -and $r.members.Count -gt 0)
    $Ctx.end_ok = $r.ok
    Rec $r
  }
  return $r.ok
}
# Always runs (finally of every case): end the job if the case did not, terminate out-of-job identities it created,
# release every process handle. Never throws; 'all_final' is false when any target ended alive, unknown or in error.
function Finish-Case($Ctx) {
  $rec = [ordered]@{kind='case-cleanup'; case=$Ctx.case; job_ended_here=$false; outside=@(); pumps_open=@()}
  try { if (-not $Ctx.ended -and $Ctx.job -ne [IntPtr]::Zero) { $rec.job_ended_here = $true; [void](EndJob $Ctx 'finally') } } catch { $rec.end_error = $_.Exception.Message }
  foreach ($o in $Ctx.outside) {
    $s = State $o
    if ($s -eq 'alive' -or $s.StartsWith('unknown')) { $s = [TabwiseW2a.JobProbe]::TerminatePinned([int]$o.pid, [int64]$o.created, 3000) }
    $rec.outside += [ordered]@{pid=$o.pid; created=$o.created; result=$s}
  }
  foreach ($c in $Ctx.children) {
    if (-not [TabwiseW2a.JobProbe]::PumpsFinished($c, 0)) { $rec.pumps_open += $c.Pid }   # recorded; never waited on
    [TabwiseW2a.JobProbe]::Release($c)
  }
  $rec.job_end_ok = $Ctx.end_ok
  $rec.all_final = -not @($rec.outside | Where-Object { -not (Final $_.result) }).Count
  Rec $rec
}
function Result([string]$Case, [string]$Status, $Data) { Rec ([ordered]@{kind='result'; case=$Case; status=$Status; data=$Data}) }

# ---- SelfReport and Breakaway (run as processes inside the owned job) --------------------------------------------------
if ($Mode -eq 'SelfReport') {
  $limits = [TabwiseW2a.JobProbe]::QueryLimits([IntPtr]::Zero)
  $l = $null; $inner = $null; $innerError = $null
  if ($limits) {
    $l = [ordered]@{flags=[string]$limits.LimitFlags; kill_on_close=$limits.KillOnClose; breakaway_ok=$limits.BreakawayOk; silent_breakaway_ok=$limits.SilentBreakawayOk;
      ui=[string]$limits.UiRestrictions; ui_known=$limits.UiKnown; ui_query_error=$limits.UiQueryError}
    # The pid list of this process's innermost job, for comparison with the owned job's list. Flags alone identify nothing.
    try { $inner = @([TabwiseW2a.JobProbe]::JobPids([IntPtr]::Zero)) } catch { $innerError = $_.Exception.Message }
  }
  [Console]::Out.WriteLine((ConvertTo-Json -Compress -Depth 5 -InputObject ([ordered]@{w2a='selfreport'; pid=$PID; created=[string][TabwiseW2a.JobProbe]::SelfCreationTime();
    in_any_job=[TabwiseW2a.JobProbe]::SelfInAnyJob(); innermost_job_limits=$l; innermost_job_pids=$inner; innermost_job_pids_error=$innerError})))
  [Console]::Out.Flush()
  if ($HoldMs -gt 0) { Start-Sleep -Milliseconds ([Math]::Min($HoldMs, 30000)) }
  exit 0
}
if ($Mode -eq 'Breakaway') {
  $ctrl = [TabwiseW2a.JobProbe]::Spawn([IntPtr]::Zero, $NodeExe, @($Child,'sleep','30000'), $null, $false, (Split-Path -Parent $Child))
  try {
    [Console]::Out.WriteLine((ConvertTo-Json -Compress -InputObject ([ordered]@{w2a='control'; pid=$ctrl.Pid; created=[string]$ctrl.CreatedFileTime})))
    $res = [ordered]@{w2a='breakaway'}
    $esc = $null
    try {
      $esc = [TabwiseW2a.JobProbe]::Spawn([IntPtr]::Zero, $NodeExe, @($Child,'sleep','30000'), $null, $true, (Split-Path -Parent $Child))
      $res.refused = $false; $res.escaped_pid = $esc.Pid; $res.escaped_created = [string]$esc.CreatedFileTime
      $res.pin = [TabwiseW2a.JobProbe]::TerminatePinned($esc.Pid, $esc.CreatedFileTime, 5000)
    } catch {
      # PowerShell wraps .NET exceptions; only a Win32 refusal counts, and the host requires ERROR_ACCESS_DENIED.
      $code = [TabwiseW2a.JobProbe]::Win32Code($_.Exception)
      $res.refused = ($code -ge 0); $res.error = $code; $res.message = $_.Exception.Message
    } finally { if ($esc) { [TabwiseW2a.JobProbe]::Release($esc) } }
    [Console]::Out.WriteLine((ConvertTo-Json -Compress -InputObject $res)); [Console]::Out.Flush()
  } finally { [TabwiseW2a.JobProbe]::Release($ctrl) }   # the control stays in the owned job; T3's EndJob ends it
  exit 0
}

# ---- Run ---------------------------------------------------------------------------------------------------------------
foreach ($p in @('Out','Cases','NodeExe','Child','SignalDir')) { if (-not (Get-Variable -Name $p -ValueOnly)) { throw "Run needs -$p" } }
if (-not [System.IO.Path]::IsPathRooted($NodeExe)) { throw 'NodeExe must be absolute' }
if ($DeadlineFileTime -eq '0') { throw 'Run needs -DeadlineFileTime' }
$selfIdent = [ordered]@{pid=$PID; created=[string][TabwiseW2a.JobProbe]::SelfCreationTime()}
Rec ([ordered]@{kind='host-start'; cases=$Cases; host=$selfIdent; deadline=$DeadlineFileTime; reserve_ms=$ReserveMs})

function Case-T0 {
  $ctx = NewCtx 'T0' $false $false
  try {
    $os = Get-CimInstance -ClassName Win32_OperatingSystem -OperationTimeoutSec 10
    $limits = [TabwiseW2a.JobProbe]::QueryLimits([IntPtr]::Zero)
    $ancestry = @(); $cur = $PID
    for ($i = 0; $i -lt 8; $i++) {
      $row = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId=$cur" -OperationTimeoutSec 10
      if (-not $row) { break }
      $a = [ordered]@{pid=[int]$row.ProcessId; name=[string]$row.Name; in_any_job=$null}
      $err = 0; $h = [TabwiseW2a.JobProbe]::OpenQueryEx([int]$row.ProcessId, [ref]$err)
      if ($h -ne [IntPtr]::Zero) { try { $a.in_any_job = [TabwiseW2a.JobProbe]::InAnyJobPublic($h) } finally { [TabwiseW2a.JobProbe]::Close($h) } } else { $a.open_error = $err }
      $ancestry += $a
      if ([int]$row.ParentProcessId -le 4 -or [int]$row.ParentProcessId -eq $cur) { break }
      $cur = [int]$row.ParentProcessId
    }
    $cp = SpawnNode $ctx @('chromium-path') 'chromium-path' $null
    $path = WaitLine $cp 'chromium-path' 60000
    [void](WaitExit $cp 30000)
    $chrome = [ordered]@{path=$path.executable; sha256=$null}
    if (Test-Path -LiteralPath $path.executable) { $chrome.sha256 = Sha256File $path.executable }
    $data = [ordered]@{os_caption=$os.Caption; os_version=$os.Version; os_build=$os.BuildNumber; session_id=[System.Diagnostics.Process]::GetCurrentProcess().SessionId;
      user_interactive=[Environment]::UserInteractive; user=[Environment]::UserName; node=$NodeExe; node_version=(& $NodeExe --version); node_sha256=(Sha256File $NodeExe);
      chromium=$chrome; host_in_any_job=[TabwiseW2a.JobProbe]::SelfInAnyJob(); host_innermost_job_limits=$null; ancestry=$ancestry}
    if ($limits) { $data.host_innermost_job_limits = [ordered]@{flags=[string]$limits.LimitFlags; kill_on_close=$limits.KillOnClose; breakaway_ok=$limits.BreakawayOk; silent_breakaway_ok=$limits.SilentBreakawayOk} }
    $complete = $chrome.sha256 -and $data.node_sha256 -and $ancestry.Count -gt 0
    Result 'T0' $(if ($complete) {'pass'} else {'inconclusive'}) $data
  } finally { Finish-Case $ctx }
}

function Case-T1 {
  $job = [TabwiseW2a.JobProbe]::CreateOwnedJob($false)
  try {
    $l = [TabwiseW2a.JobProbe]::QueryLimits($job); $inh = [TabwiseW2a.JobProbe]::HandleInheritable($job)
    $data = [ordered]@{flags=[string]$l.LimitFlags; kill_on_close=$l.KillOnClose; breakaway_ok=$l.BreakawayOk; silent_breakaway_ok=$l.SilentBreakawayOk;
      ui=[string]$l.UiRestrictions; ui_known=$l.UiKnown; ui_query_error=$l.UiQueryError; handle_inheritable=$inh}
    $status = 'fail'
    if (-not $l.UiKnown) { $status = 'inconclusive' }
    elseif ($l.KillOnClose -and -not $l.BreakawayOk -and -not $l.SilentBreakawayOk -and -not $inh -and $l.UiRestrictions -eq 0) { $status = 'pass' }
    Result 'T1' $status $data
  } finally { [TabwiseW2a.JobProbe]::Close($job) }
}

# T2 establishes only that a child and a grandchild started by Node inside the owned job are members of it. It does
# not identify which job object is the grandchild's innermost job; it compares that job's pid list with the owned one.
function Case-T2 {
  $ctx = NewCtx 'T2' $true $false
  try {
    $c = SpawnNode $ctx @('report', $PsExe, $PSCommandPath, $Source, $ExpectedSourceSha256, '3000') 'child' $null
    $ready = WaitLine $c 'ready' 120000
    $report = $ready.grandchild.report
    $gc = [ordered]@{pid=[int]$ready.grandchild.pid; created=[string]$report.created}
    Track 'T2' $gc 'grandchild'
    $m = Members $ctx.job; RecMembers $ctx $m
    $ownedPids = @($m.identified | ForEach-Object { [int]$_.pid })
    $ci = [ordered]@{pid=$c.Pid; created=[string]$c.CreatedFileTime}
    $cf = JobFacts $ctx.job $ci; $gf = JobFacts $ctx.job $gc
    $listed = { param($i) [bool]($m.identified | Where-Object { (Key $_) -eq (Key $i) }) }
    $ok = (& $listed $ci) -and (& $listed $gc) -and $cf.in_owned_job -eq $true -and $gf.in_owned_job -eq $true
    $node = 'grandchild-in-no-job'
    if ($report.in_any_job) {
      if ($null -eq $report.innermost_job_pids) { $node = 'innermost-pids-unreadable' }
      elseif ((@($report.innermost_job_pids | Sort-Object) -join ',') -eq (@($ownedPids | Sort-Object) -join ',')) { $node = 'innermost-pidset-equals-owned' }
      else { $node = 'innermost-pidset-differs' }
    }
    $code = WaitExit $c 60000
    $emptied = EndJob $ctx 'case'
    $status = 'fail'
    if ($m.unknown.Count -gt 0 -or $null -eq $cf.in_owned_job -or $null -eq $gf.in_owned_job) { $status = 'inconclusive' }
    elseif ($ok -and $emptied) { $status = 'pass' }
    Result 'T2' $status ([ordered]@{child=$cf; grandchild=$gf; child_exit=$code; node_job_measurement=$node; grandchild_report=$report; owned_pids=$ownedPids;
      establishes='node-spawned child and grandchild are members of the owned job'; output=(ChildOutput $c)})
  } finally { Finish-Case $ctx }
}

function Case-T3 {
  $ctx = NewCtx 'T3' $true $false
  try {
    $c = SpawnIn $ctx $PsExe @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$PSCommandPath,'-Mode','Breakaway',
      '-Source',$Source,'-ExpectedSourceSha256',$ExpectedSourceSha256,'-NodeExe',$NodeExe,'-Child',$Child) 'breakaway-host' $null $false
    $ctrl = WaitLine $c 'control' 120000
    $res = WaitLine $c 'breakaway' 60000
    $ci = [ordered]@{pid=[int]$ctrl.pid; created=[string]$ctrl.created}
    Track 'T3' $ci 'control'
    if (-not $res.refused -and $res.escaped_pid) { $e = [ordered]@{pid=[int]$res.escaped_pid; created=[string]$res.escaped_created}; $ctx.outside += $e; Track 'T3' $e 'escaped' }
    $m = Members $ctx.job; RecMembers $ctx $m
    $cf = JobFacts $ctx.job $ci
    $ok = $res.refused -and ([int]$res.error -eq [TabwiseW2a.JobProbe]::ERROR_ACCESS_DENIED) -and $cf.in_owned_job -eq $true
    [void](WaitExit $c 30000)
    $emptied = EndJob $ctx 'case'
    $status = 'fail'
    if ($res.refused -and ($m.unknown.Count -gt 0 -or $null -eq $cf.in_owned_job)) { $status = 'inconclusive' }
    elseif ($ok -and $emptied) { $status = 'pass' }
    Result 'T3' $status ([ordered]@{breakaway=$res; control=$cf; output=(ChildOutput $c)})
  } finally { Finish-Case $ctx }
}

# T4 establishes only that orphans created by Node spawn (detached:true, and the default) stay members of the owned
# job after their parent exits. It says nothing about other creation flags or about processes created by services.
function Case-T4 {
  $ctx = NewCtx 'T4' $true $false
  try {
    $c = SpawnNode $ctx @('orphan','60000') 'child' $null
    $ready = WaitLine $c 'ready' 60000
    $a = Identify ([int]$ready.detached_pid); $b = Identify ([int]$ready.attached_pid)
    Track 'T4' $a 'orphan-detached'; Track 'T4' $b 'orphan-attached'
    $code = WaitExit $c 30000
    Start-Sleep -Milliseconds 1000
    $m = Members $ctx.job; RecMembers $ctx $m
    $aState = State $a; $bState = State $b
    $af = $null; if ($aState -eq 'alive') { $af = JobFacts $ctx.job $a }
    $bf = $null; if ($bState -eq 'alive') { $bf = JobFacts $ctx.job $b }
    $emptied = EndJob $ctx 'case'
    $status = 'fail'
    if ($a.state -ne 'identified' -or $b.state -ne 'identified' -or $null -eq $code -or $aState -ne 'alive' -or $m.unknown.Count -gt 0 -or
        $null -eq $af.in_owned_job -or ($bState -eq 'alive' -and $null -eq $bf.in_owned_job) -or $bState.StartsWith('unknown')) { $status = 'inconclusive' }
    elseif ($af.in_owned_job -and ($bState -ne 'alive' -or $bf.in_owned_job) -and $emptied) { $status = 'pass' }
    Result 'T4' $status ([ordered]@{child_exit=$code; detached=$af; detached_state=$aState; attached=$bf; attached_state=$bState;
      establishes='orphans of a node child (detached:true and default spawn) remain members after the parent exits'; output=(ChildOutput $c)})
  } finally { Finish-Case $ctx }
}

# Product-identical Chromium launch. In the job: every tree node must be shown in the owned job, either by an opened,
# identity-matched handle or, for a node that cannot be opened, by its pid in the job's list both before and after the
# snapshot. A node that is neither is 'unknown' and makes the case inconclusive; it is never silently left out.
function Chromium([string]$Case, [bool]$InJob, [string]$Sandbox) {
  $ctx = NewCtx $Case $InJob $false
  try {
    $c = SpawnNode $ctx @('chromium', $Sandbox, '8000') 'child' $null
    $ci = [ordered]@{pid=$c.Pid; created=[string]$c.CreatedFileTime}
    $data = [ordered]@{in_job=$InJob; sandbox=$Sandbox; nodes=@(); ambiguous=@()}
    $ready = WaitLine $c 'ready' 90000
    $data.ready = $ready
    $before = @(); if ($InJob) { $before = @([TabwiseW2a.JobProbe]::JobPids($ctx.job)) }
    $tree = Tree $ci
    $after = @(); if ($InJob) { $after = @([TabwiseW2a.JobProbe]::JobPids($ctx.job)) }
    $data.root_seen = $tree.root_seen; $data.ambiguous = $tree.ambiguous
    foreach ($n in $tree.nodes) {
      Track $Case $n ('tree:' + $n.name)
      if (-not $InJob) { $ctx.outside += (Ident $n) }
      $f = JobFacts $ctx.job $n
      $f.name = $n.name
      if ($f.open -and $f.identity_match -eq $false) { $f.class = 'replaced' }
      elseif (-not $InJob) { $f.class = 'outside-control' }
      elseif ($f.in_owned_job -eq $true) { $f.class = 'in-job' }
      elseif ($f.in_owned_job -eq $false) { $f.class = 'outside' }
      elseif (($before -contains [int]$n.pid) -and ($after -contains [int]$n.pid)) { $f.class = 'in-job-by-pidlist' }
      elseif ($f.open_error -eq [TabwiseW2a.JobProbe]::ERROR_INVALID_PARAMETER) { $f.class = 'vanished' }
      else { $f.class = 'unknown' }
      $data.nodes += $f
    }
    if ($InJob) { RecMembers $ctx (Members $ctx.job) }
    [void](WaitLine $c 'closed' 60000)
    $data.child_exit = WaitExit $c 30000
    $launched = $ready -and ([string]$ready.data_text -ceq 'w2a') -and $tree.root_seen -and $tree.nodes.Count -gt 0
    if ($InJob) {
      $outside = @($data.nodes | Where-Object { $_.class -eq 'outside' }).Count
      $unknown = @($data.nodes | Where-Object { $_.class -eq 'unknown' }).Count + @($data.ambiguous).Count + @($ctx.unknown_members).Count
      $emptied = EndJob $ctx 'case'
      $status = 'fail'
      if ($outside -eq 0 -and $unknown -gt 0) { $status = 'inconclusive' }
      elseif ($launched -and $outside -eq 0 -and $emptied) { $status = 'pass' }
    } else {
      $status = $(if ($launched) {'pass'} else {'fail'})
      if ($launched -and @($data.ambiguous).Count) { $status = 'inconclusive' }   # an unattributable control residue cannot be cleaned
    }
    $data.output = ChildOutput $c
    Result $Case $status $data
  } finally { Finish-Case $ctx }
}
# Each launch records its own result, so a failure in one cannot hide or skip the other.
function ChromiumCase([string]$Case, [bool]$InJob, [string]$Sandbox) {
  try { Chromium $Case $InJob $Sandbox } catch { Result $Case 'error' ([ordered]@{error=$_.Exception.Message; at=$_.InvocationInfo.PositionMessage}) }
}
function Case-T5C { ChromiumCase 'T5C-off' $false 'off'; ChromiumCase 'T5C-on' $false 'on' }
function Case-T5  { ChromiumCase 'T5-off'  $true  'off'; ChromiumCase 'T5-on'  $true  'on' }

function Case-T8 {
  $ctx = NewCtx 'T8' $true $false
  try {
    $c = SpawnNode $ctx @('exit') 'child' $null
    $ci = [ordered]@{pid=$c.Pid; created=[string]$c.CreatedFileTime}
    $ctx.members += $ci
    Rec ([ordered]@{kind='members'; case='T8'; members=@($ci); vanished=@(); unknown=@()})
    $code = WaitExit $c 30000
    Start-Sleep -Milliseconds 500
    $acc = [TabwiseW2a.JobProbe]::QueryAccounting($ctx.job); $pids = @([TabwiseW2a.JobProbe]::JobPids($ctx.job))
    $natural = ($null -ne $code) -and $acc.ActiveProcesses -eq 0 -and $pids.Count -eq 0
    $emptied = EndJob $ctx 'case'   # recorded for the observer even though nothing should be left to terminate
    Result 'T8' $(if ($natural -and $emptied) {'pass'} else {'fail'}) ([ordered]@{child_exit=$code; active_processes=[int]$acc.ActiveProcesses; total_processes=[int]$acc.TotalProcesses; pids=$pids})
  } finally { Finish-Case $ctx }
}

# T9 records out-of-job processes created while a job member ran a WMI query. That is temporal correlation only: it
# does not show the query caused them, and it does not show they are all of the out-of-job activity.
function Case-T9 {
  $ctx = NewCtx 'T9' $true $false
  try {
    $start = Now
    $c = SpawnNode $ctx @('wmi') 'child' $null
    $union = @{}
    $deadline = [DateTime]::UtcNow.AddMilliseconds((Budget 90000)); $code = $null
    while ([DateTime]::UtcNow -lt $deadline) {
      $m = Members $ctx.job
      foreach ($i in $m.identified) { $union[(Key $i)] = $i }
      foreach ($u in $m.unknown) { $ctx.unknown_members += $u }
      $code = WaitExit $c 200
      if ($null -ne $code) { break }
    }
    $members = @($union.Values)
    foreach ($i in $members) { $ctx.members += $i }
    Rec ([ordered]@{kind='members'; case='T9'; members=$members; vanished=@(); unknown=@($ctx.unknown_members)})
    $emptied = EndJob $ctx 'case'
    Result 'T9' 'recorded' ([ordered]@{window_start=$start; window_end=(Now); child_exit=$code; job_pid_union=$members; emptied=$emptied;
      establishes='temporal correlation only'; output=(ChildOutput $c)})
  } finally { Finish-Case $ctx }
}

# T10: an orphan Chromium inherits the child's stdout. Pass needs a real end of file (ReadLine returned null), before
# termination or within 5 s after it. A read error is not end of file and makes the case inconclusive.
function Case-T10 {
  $ctx = NewCtx 'T10' $true $false
  try {
    $c = SpawnNode $ctx @('orphan-chrome') 'child' $null
    $data = [ordered]@{}
    $ready = WaitLine $c 'ready' 120000
    $chrome = Identify ([int]$ready.chrome_pid); Track 'T10' $chrome 'orphan-chrome'
    $data.chrome_identity_state = $chrome.state
    $data.child_exit = WaitExit $c 60000
    $data.child_exited_at = Now
    Start-Sleep -Milliseconds 3000
    $data.eof_before_terminate = ($c.StdoutEofFileTime -ne 0)
    $m = Members $ctx.job; RecMembers $ctx $m
    $data.chrome = $null; if ($chrome.state -eq 'identified') { $data.chrome = JobFacts $ctx.job $chrome }
    $termAt = [int64](Now)
    $emptied = EndJob $ctx 'case'
    $deadline = [DateTime]::UtcNow.AddMilliseconds((Budget 5000))
    while ($c.StdoutEofFileTime -eq 0 -and $c.StdoutErrorFileTime -eq 0 -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 100 }
    $data.terminate_requested_at = [string]$termAt
    $data.stdout_eof_at = [string]$c.StdoutEofFileTime
    $data.stdout_error_at = [string]$c.StdoutErrorFileTime
    $data.stdout_error = $c.StdoutError
    $eofOk = $c.StdoutEofFileTime -ne 0 -and ($data.eof_before_terminate -or ($c.StdoutEofFileTime - $termAt) -le 50000000)
    $status = 'fail'
    if ($c.StdoutErrorFileTime -ne 0 -or $chrome.state -ne 'identified' -or $m.unknown.Count -gt 0) { $status = 'inconclusive' }
    elseif ($eofOk -and $emptied -and $null -ne $data.child_exit -and $data.chrome.in_owned_job -eq $true) { $status = 'pass' }
    Result 'T10' $status $data
  } finally { Finish-Case $ctx }
}

# T6/T7: arm a crash. The watchdog, not this process, terminates the host; host termination is recorded apart from the
# fate of the members. T7 leaks the job handle into the members on purpose (negative control).
function Crash([string]$Case, [bool]$Leak) {
  $ctx = NewCtx $Case $true $Leak
  $armed = $false
  try {
    $extra = $null; if ($Leak) { $extra = [IntPtr[]]@($ctx.job) }
    $o = SpawnNode $ctx @('orphan','300000') 'child' $extra
    $r = WaitLine $o 'ready' 60000
    Track $Case (Identify ([int]$r.detached_pid)) 'orphan-detached'; Track $Case (Identify ([int]$r.attached_pid)) 'orphan-attached'
    [void](WaitExit $o 30000)
    $b = SpawnNode $ctx @('chromium','off','300000') 'chromium-child' $extra
    [void](WaitLine $b 'ready' 90000)
    Start-Sleep -Milliseconds 1000
    $m = Members $ctx.job; RecMembers $ctx $m
    $ready = [ordered]@{case=$Case; host=$selfIdent; members=$m.identified; unknown=$m.unknown; leaked_handle=$Leak; armed_at=(Now)}
    $tmp = Join-Path $SignalDir "$Case.ready.tmp"
    [System.IO.File]::WriteAllText($tmp, (ConvertTo-Json -InputObject $ready -Compress -Depth 6), $Utf8)
    Move-Item -LiteralPath $tmp -Destination (Join-Path $SignalDir "$Case.ready")
    $armed = $true
    Rec ([ordered]@{kind='crash-armed'; case=$Case})
    Start-Sleep -Milliseconds (Budget 120000)
    # Reached only if the watchdog never killed this host: record it; Finish-Case ends the job.
    Rec ([ordered]@{kind='not-killed'; case=$Case})
  } finally {
    if (-not $armed) { Rec ([ordered]@{kind='crash-not-armed'; case=$Case}) }
    Finish-Case $ctx
  }
}

foreach ($case in ($Cases -split ',')) {
  Rec ([ordered]@{kind='case-start'; case=$case})
  if ((Budget 30000) -lt 30000) {
    Result $case 'skipped-deadline' ([ordered]@{deadline=$DeadlineFileTime})
  } else {
    try {
      switch -CaseSensitive ($case) {
        'T0'  { Case-T0 }
        'T1'  { Case-T1 }
        'T2'  { Case-T2 }
        'T3'  { Case-T3 }
        'T4'  { Case-T4 }
        'T5C' { Case-T5C }
        'T5'  { Case-T5 }
        'T8'  { Case-T8 }
        'T9'  { Case-T9 }
        'T10' { Case-T10 }
        'T6'  { Crash 'T6' $false }
        'T7'  { Crash 'T7' $true }
        default { throw "unknown case $case" }
      }
    } catch {
      Result $case 'error' ([ordered]@{error=$_.Exception.Message; at=$_.InvocationInfo.PositionMessage})
    }
  }
  Rec ([ordered]@{kind='case-end'; case=$case})
}
Rec ([ordered]@{kind='host-end'})
exit 0
