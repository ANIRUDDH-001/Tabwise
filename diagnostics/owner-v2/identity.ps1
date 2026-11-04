# Read-only fixed process query. No CIM/WMI provider, credentials, input or termination.
param([Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$ProcessId,[switch]$Measure)
$ErrorActionPreference='Stop'
$clock=[Diagnostics.Stopwatch]::StartNew()
function Mark([string]$stage){if($Measure){[Console]::Error.WriteLine(('IDENTITY_TIMING {0} {1}' -f $stage,$clock.Elapsed.TotalMilliseconds.ToString('F3',[Globalization.CultureInfo]::InvariantCulture)))}}
Mark 'script-entry'
$p=$null
$failure=22
try {
 try { $p=[Diagnostics.Process]::GetProcessById($ProcessId) } catch [ArgumentException] { exit 21 }
 Mark 'process-object'
 $null=$p.Handle
 Mark 'process-handle'
 $created=[string]$p.StartTime.ToUniversalTime().ToFileTimeUtc()
 Mark 'creation-time'
 $failure=23
 $path=$p.MainModule.FileName.ToLowerInvariant()
 Mark 'executable-path'
 if([string]::IsNullOrWhiteSpace($path)){exit 23}
 $failure=24
 $hash=[Security.Cryptography.SHA256]::Create()
 try { $digest=[BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($path))).Replace('-','').ToLowerInvariant() } finally { $hash.Dispose() }
 Mark 'path-hash'
 if($p.HasExited){exit 21}
 Mark 'process-live'
 Mark 'serialization-start'
 [Console]::Out.WriteLine((@{pid=$ProcessId;created=$created;path_sha256=$digest}|ConvertTo-Json -Compress))
 Mark 'output'
} catch { exit $failure } finally { if($p){$p.Dispose()} }
