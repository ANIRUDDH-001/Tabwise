#Requires -Version 5.1
<#
D-73 owner-run procedure for ONE hosted observer qualification attempt. Run only after explicit owner authorization of
the exact published revision. Agents must not run it against GitHub.

Protocol: every check and the single owner confirmation happen before the approval variable exists. The variable is
then created (never overwritten), read back, and one workflow_dispatch is sent. The variable is deleted as soon as the
bound run's qualify job is observed started or terminal, or once ExposureSeconds have elapsed since the create attempt,
whichever is first. Deletion counts only when the authenticated, complete variable listing omits it. Every native
command has a timeout. Cleanup (revocation, then cancellation of every run this attempt may own) never depends on
evidence storage and runs on every exit path, including Ctrl+C.
Worst-case exposure: ExposureSeconds + PollSeconds + RevokeSeconds + 5 x CommandSeconds (defaults: 12 min 10 s).

Limitation: while the variable exists, another dispatch by the owner account at this SHA would also be admitted. That
is detected and cancelled (outcome UNRESOLVED) but cannot be prevented, and cancellation is asynchronous.

Exit: 0 PASS (admitted, run succeeded, verified artifact with candidate_pass, revoked, no other run) or PREFLIGHT-OK;
      1 FAILED (revoked and nothing left running, but not PASS; includes refusals before any change);
      3 UNRESOLVED (revocation or cancellation unconfirmed, ambiguous or additional runs). Limits can only be shortened.
#>
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$Revision,
 [ValidatePattern('^D-[0-9]+$')][string]$OwnerRef='D-73',
 [ValidatePattern('^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$')][string]$Repository='ANIRUDDH-001/Tabwise',
 [switch]$PreflightOnly,
 [string]$EvidenceDirectory,
 [ValidateRange(1,480)][int]$ExposureSeconds=480,
 [ValidateRange(1,1800)][int]$CompletionSeconds=1800,
 [ValidateRange(1,90)][int]$RevokeSeconds=90,
 [ValidateRange(1,30)][int]$CommandSeconds=30,
 [ValidateRange(1,10)][int]$PollSeconds=10
)
Set-StrictMode -Version 2.0
$ErrorActionPreference='Stop'
$Variable='TABWISE_OBSERVER_APPROVED_REVISION'
$Workflow='tabwise-observer.yml'
$Root=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Decider=Join-Path $Root 'scripts\tabwise\observer-dispatch.mjs'
$Utf8=New-Object System.Text.UTF8Encoding($false)
if(-not $EvidenceDirectory){$EvidenceDirectory=Join-Path $Root ('cache\d73\execution\'+(Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ'))}
$LogPath=Join-Path $EvidenceDirectory 'events.jsonl'
$script:Exit=3;$script:EvidenceOk=$true;$script:Seq=0;$script:Unresolved=New-Object System.Collections.ArrayList;$script:Failures=New-Object System.Collections.ArrayList
$script:VarState='never';$script:SetAt=$null;$script:RunId=$null;$script:Known=@();$script:RunTerminal=$false;$script:Admitted=$false
$script:Conclusion=$null;$script:EvidencePass=$false;$script:Watching=$false;$actor=$null

function Get-Utc { (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }
# Evidence writes never throw: a storage failure only marks evidence incomplete.
function Write-Event([string]$Phase,[hashtable]$Data=@{}) {
 $line=$null
 try{$Data['utc']=Get-Utc;$Data['phase']=$Phase;$line=(New-Object PSObject -Property $Data|ConvertTo-Json -Compress -Depth 6);Write-Host "[$($Data['utc'])] $Phase $(if($Data.ContainsKey('detail')){$Data['detail']})"}catch{}
 try{if($line){[System.IO.File]::AppendAllText($LogPath,$line+"`n",$Utf8)}}catch{$script:EvidenceOk=$false}
}
function Save-Observation([string]$Kind,$Value) {
 $script:Seq++
 try{[System.IO.File]::WriteAllText((Join-Path $EvidenceDirectory ('obs-{0:D4}-{1}.json' -f $script:Seq,$Kind)),($Value|ConvertTo-Json -Compress -Depth 8),$Utf8)}catch{$script:EvidenceOk=$false}
}
function Add-Unresolved([string]$Text){[void]$script:Unresolved.Add($Text);Write-Event 'unresolved' @{detail=$Text}}
function Add-Failure([string]$Text){[void]$script:Failures.Add($Text);Write-Event 'failure' @{detail=$Text}}

# Runs one native command with a hard timeout and returns {code,out,err}. Never throws; a timeout kills the tree.
function Invoke-Native([string]$Name,[string[]]$Arguments,[string]$StdIn='',[int]$Seconds=$CommandSeconds) {
 try{
  foreach($a in $Arguments){if($a -notmatch '^[A-Za-z0-9_./:=,@\[\]+\\ -]+$'){return [pscustomobject]@{code=-2;out='';err="unsafe argument: $a"}}}
  $quoted=($Arguments|ForEach-Object{if($_ -match ' '){'"'+$_+'"'}else{$_}}) -join ' '
  $exe=(Get-Command $Name -CommandType Application -ErrorAction Stop|Select-Object -First 1).Source
  $psi=New-Object System.Diagnostics.ProcessStartInfo
  if($exe -match '\.(cmd|bat)$'){$psi.FileName=$env:ComSpec;$psi.Arguments='/d /s /c ""'+$exe+'" '+$quoted+'"'}else{$psi.FileName=$exe;$psi.Arguments=$quoted}
  $psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.RedirectStandardInput=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
  $psi.StandardOutputEncoding=$Utf8;$psi.StandardErrorEncoding=$Utf8
  $p=[System.Diagnostics.Process]::Start($psi);$out=$p.StandardOutput.ReadToEndAsync();$err=$p.StandardError.ReadToEndAsync()
  try{if($StdIn){$p.StandardInput.Write($StdIn)};$p.StandardInput.Close()}catch{}
  if(-not $p.WaitForExit($Seconds*1000)){try{& "$env:SystemRoot\System32\taskkill.exe" /PID $p.Id /T /F *> $null}catch{};return [pscustomobject]@{code=-1;out='';err="timeout after $Seconds s"}}
  $p.WaitForExit();return [pscustomobject]@{code=$p.ExitCode;out=$out.Result;err=$err.Result}
 }catch{return [pscustomobject]@{code=-3;out='';err=$_.Exception.Message}}
}
function Invoke-Gh([string]$Kind,[string[]]$Arguments){$r=Invoke-Native 'gh' $Arguments;Save-Observation $Kind @{args=$Arguments;code=$r.code;out=$r.out;err=$r.err};$r}
function Get-Api([string]$Kind,[string]$Path,[string[]]$Extra=@()){Invoke-Gh $Kind (@('api','-X','GET',"repos/$Repository/$Path")+$Extra)}
function Get-Response($r){@{code=$r.code;body=$r.out}}
# Pure decisions run in Node over base64 UTF-8 JSON on stdin. Any failure returns $null, which callers treat as fail-closed.
function Get-Decision([string]$Kind,[hashtable]$Data) {
 try{
  $payload=[Convert]::ToBase64String($Utf8.GetBytes((@{kind=$Kind;input=$Data}|ConvertTo-Json -Compress -Depth 8)))
  $r=Invoke-Native 'node' @($Decider,'decide') $payload;Save-Observation "decision-$Kind" @{code=$r.code;out=$r.out}
  $d=$r.out|ConvertFrom-Json;if($r.code -ne 0 -or -not $d.ok){return $null};return $d.value
 }catch{return $null}
}
function Get-Variables{Get-Api 'variables' 'actions/variables' @('-f','per_page=100')}
function Get-Runs{Get-Api 'runs' "actions/workflows/$Workflow/runs" @('-f','per_page=100')}
function Test-Absent{(Get-Decision 'absent' (Get-Response (Get-Variables))) -eq $true}

# Bounded and storage-independent: retries delete + authenticated absence until confirmed or RevokeSeconds elapse.
function Invoke-Revocation([string]$Why) {
 if($script:VarState -eq 'never' -or $script:VarState -eq 'revoked'){return $true}
 $deadline=(Get-Date).AddSeconds($RevokeSeconds)
 do{
  [void](Invoke-Gh 'variable-delete' @('api','-X','DELETE',"repos/$Repository/actions/variables/$Variable"))
  if(Test-Absent){$script:VarState='revoked';Write-Event 'revoked' @{reason=$Why;exposure_seconds=[int]((Get-Date)-$script:SetAt).TotalSeconds};return $true}
  Start-Sleep -Seconds 1
 }while((Get-Date) -lt $deadline)
 if($script:VarState -ne 'unresolved'){$script:VarState='unresolved';Add-Unresolved "approval variable absence unconfirmed after $RevokeSeconds s ($Why)"}
 return $false
}
function Stop-Run([string]$Id,[string]$Why) {
 [void](Invoke-Gh 'run-cancel' @('api','-X','POST',"repos/$Repository/actions/runs/$Id/cancel"));Write-Event 'cancel-requested' @{run_id=$Id;reason=$Why}
 $deadline=(Get-Date).AddSeconds($RevokeSeconds)
 do{if((Get-Decision 'terminal' (Get-Response (Get-Api 'run' "actions/runs/$Id"))) -eq $true){Write-Event 'run-terminal' @{run_id=$Id};return $true};Start-Sleep -Seconds 1}while((Get-Date) -lt $deadline)
 Add-Unresolved "run $Id still not terminal after cancellation request";return $false
}

try{
 :main do{
  try{[void](New-Item -ItemType Directory -Force -Path $EvidenceDirectory)}catch{$script:EvidenceOk=$false}
  Write-Event 'start' @{revision=$Revision;owner_ref=$OwnerRef;repository=$Repository;preflight_only=[bool]$PreflightOnly;exposure_s=$ExposureSeconds;completion_s=$CompletionSeconds;revoke_s=$RevokeSeconds;command_s=$CommandSeconds;poll_s=$PollSeconds}
  foreach($tool in 'gh','git','node'){if(-not (Get-Command $tool -CommandType Application -ErrorAction SilentlyContinue)){Add-Failure "$tool not found";break main}}
  $local=Invoke-Native 'node' @($Decider,'preflight',$Revision,$OwnerRef) '' 120;Save-Observation 'local-preflight' $local
  $pre=$null;try{$pre=$local.out|ConvertFrom-Json}catch{}
  if($local.code -ne 0 -or -not $pre -or -not $pre.ok){Add-Failure 'local preflight refused';break main}
  $actor=[string]$pre.actor;$ls=Invoke-Native 'git' @('ls-remote','origin','refs/heads/main')
  $remote=Get-Decision 'remote' @{revision=$Revision;actor=$actor;lsRemote=@{code=$ls.code;out=$ls.out};commit=(Get-Response (Get-Api 'commit' 'commits/main'))
   user=(Get-Response (Invoke-Gh 'user' @('api','user')));variables=(Get-Response (Get-Variables));runs=(Get-Response (Get-Runs))}
  if(-not $remote -or -not $remote.ok){Add-Failure ('remote preflight refused: '+$(if($remote){@($remote.errors) -join '; '}else{'decision failure'}));break main}
  $script:Known=@($remote.known);Write-Event 'preflight-ok' @{actor=$actor;known_runs=$script:Known.Count}
  if($PreflightOnly){break main}

  $phrase="AUTHORIZE AND DISPATCH ONCE $OwnerRef $Revision"
  Write-Host "`nThis creates $Variable=$Revision and dispatches ONE observer run under $OwnerRef. There is no second attempt." -ForegroundColor Yellow
  if((Read-Host "Type exactly '$phrase' to continue (anything else aborts)") -cne $phrase){Add-Failure 'owner confirmation not given; no change made';break main}
  Write-Event 'owner-confirmed'

  $script:SetAt=Get-Date;$script:VarState='set-attempted';$exposureEnd=$script:SetAt.AddSeconds($ExposureSeconds)
  [void](Invoke-Gh 'variable-create' @('api','-X','POST',"repos/$Repository/actions/variables",'-f',"name=$Variable",'-f',"value=$Revision"))
  $rb=Get-Api 'variable' "actions/variables/$Variable"
  if((Get-Decision 'readback' @{code=$rb.code;body=$rb.out;value=$Revision}) -ne $true){Add-Failure 'variable create/read-back failed';break main}
  Write-Event 'variable-set'

  $script:Watching=$true
  $dispatch=Invoke-Gh 'dispatch' @('workflow','run',$Workflow,'--repo',$Repository,'--ref','main','-f','enable_qualification=true','-f',"owner_approval_ref=$OwnerRef")
  $dispatchedAt=Get-Date;Write-Event 'dispatch' @{code=$dispatch.code}
  if($dispatch.code -ne 0){Add-Failure "dispatch command failed: $($dispatch.err)";break main}
  $hint=Get-Decision 'dispatch' @{out=$dispatch.out}

  while($true){
   Start-Sleep -Seconds $PollSeconds
   $jobs=$null;if($script:RunId){$jobs=Get-Response (Get-Api 'jobs' "actions/runs/$($script:RunId)/jobs")}
   $o=Get-Decision 'observe' @{runs=(Get-Response (Get-Runs));jobs=$jobs;known=$script:Known;revision=$Revision;actor=$actor;runId=$script:RunId;dispatchRunId=$hint}
   $now=Get-Date
   if($o -and $o.ok){
    if($o.ambiguous){Add-Unresolved 'more than one new run matches this dispatch';break main}
    if(@($o.extras).Count){Add-Unresolved ('additional observer run(s) appeared: '+((@($o.extras)|ForEach-Object{$_.id}) -join ','));break main}
    if($o.run_id -and -not $script:RunId){$script:RunId=[string]$o.run_id;Write-Event 'run-found' @{run_id=$script:RunId}}
    if($o.admission -eq 'invalid'){Add-Unresolved "run $($script:RunId): $($o.reason)";break main}
    if($o.admission -eq 'admitted' -and -not $script:Admitted){
     $script:Admitted=$true;Write-Event 'admitted' @{run_id=$script:RunId}
     if(-not (Invoke-Revocation 'qualify job started')){break main}
    }
    if($o.admission -eq 'not-admitted'){$script:RunTerminal=[bool]$o.terminal;[void](Invoke-Revocation 'job not admitted');Add-Failure "run $($script:RunId): $($o.reason)";break main}
    if($o.terminal){$script:RunTerminal=$true;$script:Conclusion=[string]$o.conclusion;Write-Event 'run-completed' @{run_id=$script:RunId;conclusion=$script:Conclusion};break}
   }else{Write-Event 'observation-unavailable'}
   if(-not $script:Admitted -and $now -ge $exposureEnd){[void](Invoke-Revocation 'admission deadline');Add-Failure "qualify job not observed started within $ExposureSeconds s";break main}
   if($now -ge $dispatchedAt.AddSeconds($CompletionSeconds)){Add-Failure "run not completed within $CompletionSeconds s";break main}
  }

  if($script:Conclusion -ne 'success'){Add-Failure "run conclusion: $($script:Conclusion)";break main}
  $artifact=Join-Path $EvidenceDirectory 'artifact'
  $dl=Invoke-Native 'gh' @('run','download',$script:RunId,'--repo',$Repository,'--name',"tabwise-observer-$($script:RunId)-1",'--dir',$artifact) '' ($CommandSeconds*2)
  Save-Observation 'artifact-download' @{code=$dl.code;err=$dl.err}
  $ev=$null;if($dl.code -eq 0){$ev=Get-Decision 'evidence' @{dir=$artifact}}
  if(-not $ev -or -not $ev.ok){Add-Failure ('artifact missing or invalid: '+$(if($ev){@($ev.errors) -join '; '}else{"download exit $($dl.code)"}));break main}
  if(-not $ev.candidate_pass){Add-Failure 'qualification result candidate_pass is not true';break main}
  $script:EvidencePass=$true
 }while($false)
}catch{
 Add-Failure ('script error: '+$_.Exception.Message)
}finally{
 # Safety cleanup first, each step contained; evidence is finalized only afterwards.
 try{[void](Invoke-Revocation 'final cleanup')}catch{Add-Unresolved 'revocation cleanup raised an error'}
 if($script:Watching){
  try{
   $o=Get-Decision 'observe' @{runs=(Get-Response (Get-Runs));jobs=$null;known=$script:Known;revision=$Revision;actor=$actor;runId=$script:RunId;dispatchRunId=$null}
   if(-not $o -or -not $o.ok){Add-Unresolved 'final run listing unavailable; check for runs created by this attempt'}
   else{
    $mine=@();if($script:RunId -and -not $script:RunTerminal){$mine+=$script:RunId}elseif(-not $script:RunId -and $o.run_id){$mine+=[string]$o.run_id}
    foreach($x in @($o.extras)){if($x.terminal){continue};if($x.qualifying){$mine+=[string]$x.id}else{Add-Unresolved "non-qualifying observer run $($x.id) appeared; not cancelled"}}
    foreach($id in @($mine|Select-Object -Unique)){[void](Stop-Run $id 'attempt did not finish normally')}
   }
  }catch{Add-Unresolved ('run cleanup raised an error: '+$_.Exception.Message)}
 }
 if(-not $script:EvidenceOk){[void]$script:Failures.Add('local evidence storage failed')}
 $outcome=if($script:Unresolved.Count -or $script:VarState -eq 'unresolved'){'UNRESOLVED'}elseif($script:Failures.Count){'FAILED'}elseif($PreflightOnly){'PREFLIGHT-OK'}elseif($script:EvidencePass -and $script:VarState -eq 'revoked'){'PASS'}else{'FAILED'}
 Write-Event 'end' @{outcome=$outcome;run_id=$script:RunId;admitted=$script:Admitted;conclusion=$script:Conclusion;variable=$script:VarState;failures=@($script:Failures);unresolved=@($script:Unresolved)}
 try{
  $hashes=@(Get-ChildItem -LiteralPath $EvidenceDirectory -Recurse -File|Where-Object{$_.Name -ne 'hashes.json'}|Sort-Object FullName|ForEach-Object{[ordered]@{path=$_.FullName.Substring($EvidenceDirectory.Length+1);sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()}})
  $hashPath=Join-Path $EvidenceDirectory 'hashes.json';[System.IO.File]::WriteAllText($hashPath,(ConvertTo-Json -InputObject $hashes -Depth 4),$Utf8)
  Write-Host "hashes.json sha256 $((Get-FileHash -Algorithm SHA256 -LiteralPath $hashPath).Hash.ToLowerInvariant())"
 }catch{Write-Host 'evidence hashing failed' -ForegroundColor Red}
 if($script:VarState -eq 'unresolved'){Write-Host "MANUAL ACTION: delete repository variable $Variable now and confirm it is absent." -ForegroundColor Red}
 Write-Host "OUTCOME $outcome  evidence: $EvidenceDirectory"
 $script:Exit=switch($outcome){'PASS'{0}'PREFLIGHT-OK'{0}'UNRESOLVED'{3}default{1}}
}
exit $script:Exit
