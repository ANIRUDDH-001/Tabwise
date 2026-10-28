// A4 (D-36): read-only foreground-window check before every key action. It never moves, raises or
// focuses a window. One persistent PowerShell helper answers each stdin line with {pid, title} of the
// foreground window, via user32 GetForegroundWindow / GetWindowThreadProcessId / GetWindowText.
import { spawn as nodeSpawn } from 'node:child_process';

export const PROBE_PS = `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class R1Fg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
"@
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $request = $line | ConvertFrom-Json -ErrorAction Stop
  if ($request.id -notmatch '^[1-9][0-9]*$') { throw 'invalid probe request' }
  $h = [R1Fg]::GetForegroundWindow()
  $p = [uint32]0
  [void][R1Fg]::GetWindowThreadProcessId($h, [ref]$p)
  $sb = New-Object System.Text.StringBuilder 512
  [void][R1Fg]::GetWindowText($h, $sb, 512)
  [Console]::Out.WriteLine((@{ request_id = [long]$request.id; pid = [int]$p; title = $sb.ToString() } | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}
`;

// [] when the foreground window is our Chromium process and its title has this attempt's nonce.
export function foregroundMismatch(actual, { pid, nonce }) {
  if (!actual || typeof actual.pid !== 'number') return [`no foreground reading${actual?.error ? `: ${actual.error}` : ''}`];
  const out = [];
  if (typeof pid !== 'number' || actual.pid !== pid) out.push(`foreground pid ${actual.pid} is not Chromium ${pid}`);
  if (!nonce || !String(actual.title ?? '').toLowerCase().includes(String(nonce).toLowerCase())) out.push('foreground title lacks the nonce');
  return out;
}

// check() -> {pid, title}, or {pid: null, error} on bad output, silence or a dead helper. Never rejects.
// After a timeout or exit every later check fails too (fail closed).
export function foregroundProbe({ spawn = nodeSpawn, timeoutMs = 5000, now = () => performance.now() } = {}) {
  const encoded = Buffer.from(PROBE_PS, 'utf16le').toString('base64');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let dead = null;
  let buf = '';
  let pending = null;
  let sequence = 0;
  const settle = (v) => {
    if (!pending) return;
    const p = pending;
    pending = null;
    clearTimeout(p.timer);
    p.done(v);
  };
  const onDead = (why) => { dead ??= why; settle({ pid: null, error: dead }); };
  child.stdout.on('data', (d) => {
    buf += String(d);
    if (buf.length > 65536) { onDead('probe reply too large'); return; }
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        const v = JSON.parse(line);
        if (dead) continue;
        if (!pending || v?.request_id !== pending.id) { onDead('uncorrelated probe reply'); continue; }
        if (!Number.isInteger(v.pid) || v.pid <= 0 || typeof v.title !== 'string') { onDead('bad reply'); continue; }
        settle({ pid: v.pid, title: v.title, request_id: pending.id, request_started_ms: pending.started, received_ms: now() });
      } catch { onDead('bad reply'); }
    }
  });
  child.on('exit', (code) => onDead(`helper exited (${code})`));
  child.on('error', (e) => onDead(`helper error: ${e.message}`));
  return {
    check() {
      if (dead) return Promise.resolve({ pid: null, error: dead });
      if (pending) { onDead('overlapping probe request'); return Promise.resolve({ pid: null, error: dead }); }
      return new Promise((ok) => {
        pending = { id: ++sequence, started: now(), done: ok, timer: setTimeout(() => onDead('probe timed out'), timeoutMs) };
        try { child.stdin.write(`${JSON.stringify({ id: pending.id })}\n`); } catch (e) { onDead(`helper stdin: ${e.message}`); }
      });
    },
    close() { onDead('helper closed'); try { child.stdin.end(); } catch { /* already closed */ } child.kill(); },
  };
}
