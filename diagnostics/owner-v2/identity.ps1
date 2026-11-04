# Read-only fixed process query. No CIM/WMI provider, credentials, input or termination.
param([Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$ProcessId)
$ErrorActionPreference='Stop'
$p=$null
$failure=22
try {
 try { $p=[Diagnostics.Process]::GetProcessById($ProcessId) } catch [ArgumentException] { exit 21 }
 $null=$p.Handle
 $created=[string]$p.StartTime.ToUniversalTime().ToFileTimeUtc()
 $failure=23
 $path=$p.MainModule.FileName.ToLowerInvariant()
 if([string]::IsNullOrWhiteSpace($path)){exit 23}
 $failure=24
 $hash=[Security.Cryptography.SHA256]::Create()
 try { $digest=[BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($path))).Replace('-','').ToLowerInvariant() } finally { $hash.Dispose() }
 if($p.HasExited){exit 21}
 [Console]::Out.WriteLine((@{pid=$ProcessId;created=$created;path_sha256=$digest}|ConvertTo-Json -Compress))
} catch { exit $failure } finally { if($p){$p.Dispose()} }
