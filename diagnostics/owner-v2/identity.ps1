# Read-only fixed process query. No CIM/WMI provider, credentials, input or termination.
param([Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$ProcessId,[switch]$Measure,[switch]$RuntimeMetadata)
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
 $metadata=''
 if($RuntimeMetadata){
  $failure=25
  $version=$p.MainModule.FileVersionInfo.ProductVersion
  # A bounded numeric version needs no JSON escaping; never substitute an asset manifest.
  if($version -notmatch '^\d{1,4}(\.\d{1,5}){1,3}$'){exit 25}
  $stream=[IO.File]::OpenRead($path)
  $binaryHash=[Security.Cryptography.SHA256]::Create()
  try { $binaryDigest=[BitConverter]::ToString($binaryHash.ComputeHash($stream)).Replace('-','').ToLowerInvariant() } finally { $stream.Dispose();$binaryHash.Dispose() }
  $metadata=',"product_version":"'+$version+'","executable_sha256":"'+$binaryDigest+'"'
 }
 if($p.HasExited){exit 21}
 Mark 'process-live'
 Mark 'serialization-start'
 # All values are typed decimal integers or computed lowercase hex, so no string escaping
 # or cmdlet/module autoload is needed. Keep the exact three-field identity contract.
 [Console]::Out.WriteLine(('{"pid":'+$ProcessId+',"created":"'+$created+'","path_sha256":"'+$digest+'"'+$metadata+'}'))
 Mark 'output'
} catch { exit $failure } finally { if($p){$p.Dispose()} }
