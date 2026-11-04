# Read-only fixed process query. No CIM/WMI provider, credentials, input or termination.
param([Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$ProcessId)
$ErrorActionPreference='Stop'
$p=$null
try {
 $p=[Diagnostics.Process]::GetProcessById($ProcessId)
 $null=$p.Handle
 $created=[string]$p.StartTime.ToUniversalTime().ToFileTimeUtc()
 $path=$p.MainModule.FileName.ToLowerInvariant()
 $hash=[Security.Cryptography.SHA256]::Create()
 try { $digest=[BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($path))).Replace('-','').ToLowerInvariant() } finally { $hash.Dispose() }
 if($p.HasExited){throw 'exited'}
 [Console]::Out.WriteLine((@{pid=$ProcessId;created=$created;path_sha256=$digest}|ConvertTo-Json -Compress))
} catch { exit 1 } finally { if($p){$p.Dispose()} }
