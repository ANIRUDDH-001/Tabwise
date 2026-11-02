# W2a independent observer (Windows PowerShell 5.1). Started by the workflow, never by the host, and outside every owned
# job. It loads no native code and starts no helper process: each snapshot is one in-process Get-CimInstance query with
# the same class and properties as the product snapshot (r2-proctree.mjs PROCESS_SNAPSHOT_PS). The WMI provider host
# that serves it is a system process outside this tree (residual, recorded by T9). Every FILETIME is a decimal string.
# Revision 2: it stops at the run's absolute deadline (-DeadlineFileTime), not after a fixed number of minutes.
param(
  [Parameter(Mandatory=$true)][string]$Out,
  [Parameter(Mandatory=$true)][string]$StopFile,
  [Parameter(Mandatory=$true)][string]$HeartbeatFile,
  [int]$IntervalMs = 1000,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9]{1,20}$')][string]$DeadlineFileTime,
  [long]$MaxBytes = 67108864
)
$ErrorActionPreference = 'Stop'
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$deadline = [DateTime]::FromFileTimeUtc([int64]$DeadlineFileTime)
$seq = 0; $bytes = [long]0
function Write-Line([string]$Line) {
  $script:bytes += $Utf8.GetByteCount($Line) + 1
  [System.IO.File]::AppendAllText($Out, $Line + "`n", $Utf8)
}
Write-Line (ConvertTo-Json -Compress -InputObject ([ordered]@{schema='w2a-observer/1'; kind='start'; pid=$PID; t=[string][DateTime]::UtcNow.ToFileTimeUtc()}))
$reason = 'deadline'
while ([DateTime]::UtcNow -lt $deadline) {
  $seq++
  $t = [string][DateTime]::UtcNow.ToFileTimeUtc()
  try {
    $rows = @(Get-CimInstance -ClassName Win32_Process -Property ProcessId,ParentProcessId,Name,CreationDate -OperationTimeoutSec 10 | ForEach-Object {
      $c = $null; if ($_.CreationDate) { $c = [string]$_.CreationDate.ToFileTimeUtc() }
      ,@([int64]$_.ProcessId, [int64]$_.ParentProcessId, [string]$_.Name, $c) })
    $line = ConvertTo-Json -Compress -Depth 4 -InputObject ([ordered]@{kind='snapshot'; seq=$seq; t=$t; t_end=[string][DateTime]::UtcNow.ToFileTimeUtc(); processes=$rows})
  } catch {
    $line = ConvertTo-Json -Compress -InputObject ([ordered]@{kind='snapshot-error'; seq=$seq; t=$t; error=$_.Exception.Message})
  }
  if ($bytes + $line.Length -gt $MaxBytes) { $reason = 'byte-cap'; break }
  Write-Line $line
  [System.IO.File]::WriteAllText($HeartbeatFile, [string]$seq, $Utf8)
  if (Test-Path -LiteralPath $StopFile) { $reason = 'stop-file'; break }
  Start-Sleep -Milliseconds $IntervalMs
}
Write-Line (ConvertTo-Json -Compress -InputObject ([ordered]@{kind='end'; reason=$reason; seq=$seq; t=[string][DateTime]::UtcNow.ToFileTimeUtc()}))
if ($reason -eq 'stop-file') { exit 0 } else { exit 3 }
