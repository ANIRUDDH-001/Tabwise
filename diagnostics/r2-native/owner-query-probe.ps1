# Prepared read-only probe; never invoked by the worker or a workflow.
# Run only on a separately authorized isolated Windows runner, in a fresh PowerShell.
# No NVDA start/stop, input, file write, environment dump or production mutation.
$ErrorActionPreference = 'Stop'
$clock = [Diagnostics.Stopwatch]::StartNew()
$result = [ordered]@{schema='tabwise-owner-query-probe/1'; pid=$PID; entry_ms=0; query_call_ms=$null; query_return_ms=$null; selection_return_ms=$null; done_ms=$null; owner_count=$null; owner_pid=$null; outcome='query-error'; error_content='omitted'}
[Console]::Out.WriteLine('{"phase":"powershell-entry"}')
try {
    $result.query_call_ms = $clock.Elapsed.TotalMilliseconds
    [Console]::Out.WriteLine(('{"phase":"query-call","at_ms":' + $result.query_call_ms.ToString('R',[Globalization.CultureInfo]::InvariantCulture) + '}'))
    $rows = @(Get-NetTCPConnection -State Listen -LocalPort 6837)
    $result.query_return_ms = $clock.Elapsed.TotalMilliseconds
    [Console]::Out.WriteLine(('{"phase":"query-return","at_ms":' + $result.query_return_ms.ToString('R',[Globalization.CultureInfo]::InvariantCulture) + '}'))
    $owners = @($rows | Select-Object -ExpandProperty OwningProcess -Unique)
    $result.selection_return_ms = $clock.Elapsed.TotalMilliseconds
    $result.owner_count = $owners.Count
    if ($owners.Count -eq 1) { $result.owner_pid = [int64]$owners[0]; $result.outcome = 'one-owner' }
    else { $result.outcome = 'ambiguous-owner' }
} catch {
    # Deliberately omit exception text: it can contain environment or provider data.
    $result.outcome = 'query-error'
}
$result.done_ms = $clock.Elapsed.TotalMilliseconds
[Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
if ($result.outcome -ne 'one-owner') { exit 1 }
