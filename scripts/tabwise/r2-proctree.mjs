// R2-L2 R-1/R-2: coordinator-held Windows process custody for R2 page children (handoff §12 R-1, R-2). Capability-free:
// the entry injects spawn and the environment; nothing here imports child_process, a socket or a runtime.
//
// Identity: a process is (pid, creation time in microseconds since 1601), read from the OS, never from a child's report.
// A process belongs to a page's tree only through a ppid link to a known identity created no later than it, and not when
// the pid's current holder is a newer process that could be its real parent (pid reuse). Known identities accumulate
// across samples, so an orphan whose parent died after being sampled stays attributed.
//
// Termination: only tree members, parents first, each by a handle-pinned creation-time check (PROCESS_TERMINATE_PS);
// never by name, never a whole-tree OS call, never the coordinator or its parent. A termination report is advisory:
// only a later independent snapshot showing no tree member alive confirms it. Quiescence also requires no NVDA image
// anywhere and no NVDA relay listener (port 6837); a foreign NVDA is reported and refused, never killed.
export const SNAPSHOT_SCHEMA = 'tabwise-r2-process-snapshot/1';
export const CUSTODY_SCHEMA = 'tabwise-r2-process-custody/1';
export const NVDA_IMAGE = /^nvda(_[a-z0-9]+)?\.exe$/i;
export const HELPER_TIMEOUT_MS = 15_000;
export const TERMINATE_WAIT_MS = 2_000;
export const REAP_ROUNDS = 4;
// Allowed lag between the coordinator's wall clock before spawn and the OS creation time of its child.
export const SPAWN_CLOCK_TOLERANCE_US = 1_000_000n;
const MAX_HELPER_OUTPUT = 8 * 1_048_576, MAX_PROCESSES = 50_000, MAX_TARGETS = 4096, LIST_CAP = 64;
const FILETIME_EPOCH_MS = 11_644_473_600_000n;

// Constant scripts: no value is interpolated. The termination targets arrive as JSON on standard input.
export const PROCESS_SNAPSHOT_PS = [
  '$ErrorActionPreference="Stop"',
  '[Console]::OutputEncoding=[Text.Encoding]::UTF8',
  '$now=[string][DateTime]::UtcNow.ToFileTimeUtc()',
  '$rows=@(Get-CimInstance -ClassName Win32_Process -Property ProcessId,ParentProcessId,Name,CreationDate | ForEach-Object { $c=$null; if($_.CreationDate){$c=[string]$_.CreationDate.ToFileTimeUtc()}; [pscustomobject]@{pid=[int64]$_.ProcessId;ppid=[int64]$_.ParentProcessId;name=[string]$_.Name;created=$c} })',
  // Listing every listener never hits the cmdlet's not-found error, so any other failure still stops the script.
  '$listen=@(Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -eq 6837} | ForEach-Object {[int64]$_.OwningProcess} | Sort-Object -Unique)',
  `[Console]::Out.Write((ConvertTo-Json -InputObject ([ordered]@{schema="${SNAPSHOT_SCHEMA}";now=$now;processes=$rows;nvda_listeners=$listen}) -Compress -Depth 4))`,
].join('; ');
export const PROCESS_TERMINATE_PS = [
  '$ErrorActionPreference="Stop"',
  '[Console]::OutputEncoding=[Text.Encoding]::UTF8',
  // -InputObject, not the pipeline: Windows PowerShell 5.1 would emit a parsed array as one item.
  '$targets=ConvertFrom-Json -InputObject ([Console]::In.ReadToEnd())',
  '$out=@(foreach($t in $targets){ $id=[int]$t.pid; $us=[int64]::Parse([string]$t.created_us); $r="error"; try { $p=$null; try { $p=[System.Diagnostics.Process]::GetProcessById($id) } catch [System.ArgumentException] { $r="gone" }; if($p){ $null=$p.Handle; $d=$p.StartTime.ToFileTimeUtc()-($us*10); if($d -lt 0 -or $d -ge 10){ $r="mismatch" } else { $p.Kill(); if($p.WaitForExit(' + TERMINATE_WAIT_MS + ')){ $r="terminated" } else { $r="pending" } } } } catch { $r="error" }; [pscustomobject]@{pid=$id;created_us=[string]$us;result=$r} })',
  '[Console]::Out.Write((ConvertTo-Json -InputObject $out -Compress -Depth 3))',
].join('; ');
const RESULTS = ['terminated', 'pending', 'gone', 'mismatch', 'error'];

const message = error => error?.message ?? String(error);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sameKeys = (value, keys) => JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const pidOk = v => Number.isSafeInteger(v) && v >= 0 && v <= 0xffffffff;
const DIGITS = /^(0|[1-9][0-9]{0,19})$/;
const digits = v => typeof v === 'string' && DIGITS.test(v);
const keyOf = (pid, created) => `${pid}@${created}`;
const cap = list => list.slice(0, LIST_CAP);

/** Coordinator wall clock as microseconds since 1601 (the unit snapshot creation times use). */
export const wallMicros = (now = Date.now) => ((BigInt(Math.floor(now())) + FILETIME_EPOCH_MS) * 1000n).toString();

/** Strict tabwise-r2-process-snapshot/1 parser. Creation FILETIMEs (100 ns) are truncated to the CIM microsecond grain. */
export function parseProcessSnapshot(text) {
  if (typeof text !== 'string' || !text.length || text.length > MAX_HELPER_OUTPUT) throw Error('process snapshot: empty or oversized');
  let raw;
  try { raw = JSON.parse(text); } catch (error) { throw Error(`process snapshot: not JSON: ${message(error)}`); }
  if (!object(raw) || !sameKeys(raw, ['schema', 'now', 'processes', 'nvda_listeners']) || raw.schema !== SNAPSHOT_SCHEMA) throw Error('process snapshot: schema or fields');
  if (!digits(raw.now)) throw Error('process snapshot: now');
  if (!Array.isArray(raw.processes) || !raw.processes.length || raw.processes.length > MAX_PROCESSES) throw Error('process snapshot: processes');
  if (!Array.isArray(raw.nvda_listeners) || raw.nvda_listeners.length > LIST_CAP || !raw.nvda_listeners.every(pidOk)) throw Error('process snapshot: nvda_listeners');
  const seen = new Set();
  const processes = raw.processes.map(p => {
    if (!object(p) || !sameKeys(p, ['pid', 'ppid', 'name', 'created']) || !pidOk(p.pid) || !pidOk(p.ppid) || typeof p.name !== 'string' || p.name.length > 260
      || !(p.created === null || digits(p.created))) throw Error('process snapshot: process row');
    if (seen.has(p.pid)) throw Error(`process snapshot: duplicate pid ${p.pid}`);
    seen.add(p.pid);
    return Object.freeze({pid: p.pid, ppid: p.ppid, name: p.name, created: p.created === null ? null : (BigInt(p.created) / 10n).toString()});
  });
  return Object.freeze({now: (BigInt(raw.now) / 10n).toString(), processes: Object.freeze(processes), nvda_listeners: Object.freeze([...raw.nvda_listeners])});
}

/** System-wide physical-quiescence facts from one snapshot: any NVDA image or relay listener refuses. */
export function quiescenceOf(snapshot) {
  const nvda = snapshot.processes.filter(p => NVDA_IMAGE.test(p.name)).map(p => ({pid: p.pid, name: p.name, created: p.created}));
  const errors = [...nvda.map(p => `NVDA process running: ${p.name} pid ${p.pid}`), ...snapshot.nvda_listeners.map(pid => `NVDA relay listener on 6837 owned by pid ${pid}`)];
  return {quiescent: errors.length === 0, nvda_processes: cap(nvda), nvda_listeners: [...snapshot.nvda_listeners], errors: cap(errors)};
}

/**
 * Snapshot and terminate adapters over powershell.exe from %SystemRoot% (no PATH lookup, no shell). spawn and env are
 * injected by the entry. Each helper is bounded, killed on timeout and refused on a non-zero exit or oversized output.
 */
export function windowsProcessTools({spawn, env, timeoutMs = HELPER_TIMEOUT_MS}) {
  if (typeof spawn !== 'function') throw Error('process tools: spawn missing');
  const systemRoot = Object.entries(env ?? {}).find(([name]) => name.toUpperCase() === 'SYSTEMROOT')?.[1];
  if (typeof systemRoot !== 'string' || !/^[A-Za-z]:\\[^"<>|?*\0]*$/.test(systemRoot)) throw Error('process tools: absolute SystemRoot required');
  const file = `${systemRoot.replace(/\\+$/, '')}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
  const run = (script, input) => new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(file, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
        {shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
    } catch (error) { reject(Error(`process helper spawn: ${message(error)}`)); return; }
    const chunks = [];
    let bytes = 0, done = false;
    const finish = (error, value) => {
      if (done) return;
      done = true; clearTimeout(timer);
      if (error) { try { child.kill(); } catch { /* the helper is a direct child with no descendants */ } reject(error); } else resolve(value);
    };
    const timer = setTimeout(() => finish(Error(`process helper timed out after ${timeoutMs} ms`)), timeoutMs);
    child.stdout?.on('data', data => { bytes += data.length; if (bytes > MAX_HELPER_OUTPUT) finish(Error('process helper output over cap')); else chunks.push(Buffer.from(data)); });
    child.stderr?.on('data', () => {});
    child.on('error', error => finish(Error(`process helper: ${message(error)}`)));
    child.on('close', (code, signal) => code === 0 && !signal ? finish(null, Buffer.concat(chunks).toString('utf8')) : finish(Error(`process helper exit ${code} signal ${signal}`)));
    child.stdin?.on?.('error', () => {});
    child.stdin?.end(input ?? '');
  });
  return Object.freeze({
    snapshot: async () => parseProcessSnapshot(await run(PROCESS_SNAPSHOT_PS, '')),
    terminate: async targets => {
      if (!Array.isArray(targets) || !targets.length || targets.length > MAX_TARGETS || !targets.every(t => pidOk(t?.pid) && t.pid > 4 && t.pid <= 0x7fffffff && digits(t?.created)))
        throw Error('process terminate: invalid targets');
      const text = await run(PROCESS_TERMINATE_PS, JSON.stringify(targets.map(t => ({pid: t.pid, created_us: t.created}))));
      let rows;
      try { rows = JSON.parse(text); } catch (error) { throw Error(`process terminate: not JSON: ${message(error)}`); }
      rows = Array.isArray(rows) ? rows : [rows];
      if (rows.length !== targets.length || !rows.every((r, i) => object(r) && r.pid === targets[i].pid && r.created_us === targets[i].created && RESULTS.includes(r.result)))
        throw Error('process terminate: result rows do not match targets');
      return rows.map(r => ({pid: r.pid, created: r.created_us, result: r.result}));
    },
  });
}

function checkTools(tools) {
  if (!tools || typeof tools.snapshot !== 'function' || typeof tools.terminate !== 'function') throw Error('R2 run: process tools need snapshot and terminate');
}

/** Before a page starts: the OS must show no NVDA image and no relay listener. A failed snapshot refuses. */
export async function processBaseline(tools) {
  checkTools(tools);
  try {
    const q = quiescenceOf(await tools.snapshot());
    return {schema: CUSTODY_SCHEMA, phase: 'baseline', quiescent: q.quiescent, nvda_processes: q.nvda_processes, nvda_listeners: q.nvda_listeners, errors: q.errors};
  } catch (error) {
    return {schema: CUSTODY_SCHEMA, phase: 'baseline', quiescent: false, nvda_processes: [], nvda_listeners: [], errors: [`baseline snapshot: ${message(error)}`]};
  }
}

/**
 * Custody of one page child's process tree. pid: the child's pid (null when the spawn produced none). spawnedAfter:
 * wallMicros() read before the spawn; it bounds the root's creation time until a snapshot observes the root exactly.
 * protect: pids never targeted (the coordinator and its parent). sample() records the current tree (never overlapping, coalesced);
 * exited() is called when the coordinator observes the child's exit; reap() runs once (memoized) and returns frozen
 * evidence; it never throws.
 *
 * Root adoption: Windows frees a pid only after every handle to the process closes, and the coordinator holds one until
 * Node processes the child's exit. A snapshot absorbed before exited() therefore cannot show a reused root pid; after it,
 * the root is never adopted, and an unobserved root's children must also be created no later than the observed exit.
 */
export function createPageCustody({tools, pid, spawnedAfter, protect = [], rounds = REAP_ROUNDS, wallClock = Date.now}) {
  checkTools(tools);
  if (pid !== null && !(pidOk(pid) && pid > 4)) throw Error('R2 custody: invalid child pid');
  if (!digits(spawnedAfter)) throw Error('R2 custody: spawnedAfter must be wallMicros()');
  if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 16) throw Error('R2 custody: invalid rounds');
  const guarded = new Set([0, 4, ...protect.filter(pidOk)]);
  const known = new Map(), observed = [], errors = [];
  const lower = BigInt(spawnedAfter) - SPAWN_CLOCK_TOLERANCE_US;
  let root = pid === null ? null : {pid, created: null, depth: 0};
  let samples = 0, sampleFailures = 0, chain = Promise.resolve(), reaping = null, exitedAt = null;
  const record = text => { if (errors.length < LIST_CAP) errors.push(text); };
  const remember = (p, depth) => {
    known.set(keyOf(p.pid, p.created), {pid: p.pid, created: p.created, name: p.name, depth});
    if (observed.length < LIST_CAP) observed.push({pid: p.pid, ppid: p.ppid, name: p.name, created: p.created, depth});
  };
  // Adds every attributable descendant in this snapshot to the known set; returns the live tree members (root included).
  const absorb = snapshot => {
    const byPid = new Map(snapshot.processes.map(p => [p.pid, p]));
    if (root && root.created === null && exitedAt === null) {
      const holder = byPid.get(root.pid);
      if (holder?.created !== null && holder !== undefined && BigInt(holder.created) >= lower) { root.created = holder.created; remember(holder, 0); }
    }
    const parentOf = p => {
      if (p.created === null || guarded.has(p.pid) || p.pid === p.ppid) return null;
      const born = BigInt(p.created), holder = byPid.get(p.ppid);
      // A newer live holder of the parent pid, created no later than p, could be p's real parent: never attribute through it.
      const newer = k => holder && holder.created !== null && holder.created !== k.created && BigInt(holder.created) > BigInt(k.created) && BigInt(holder.created) <= born;
      for (const k of known.values()) if (k.pid === p.ppid && BigInt(k.created) <= born && !newer(k)) return k;
      if (root && root.created === null && p.ppid === root.pid && born >= lower && (exitedAt === null || born <= exitedAt) && !(holder && holder.created !== null)) return {depth: 0};
      return null;
    };
    for (let grew = true; grew;) {
      grew = false;
      for (const p of snapshot.processes) {
        if (p.created === null || known.has(keyOf(p.pid, p.created))) continue;
        const parent = parentOf(p);
        if (parent) { remember(p, parent.depth + 1); grew = true; }
      }
    }
    return snapshot.processes.filter(p => p.created !== null && !guarded.has(p.pid) && known.has(keyOf(p.pid, p.created)))
      .map(p => known.get(keyOf(p.pid, p.created))).sort((a, b) => a.depth - b.depth || a.pid - b.pid);
  };
  // Coalesced: at most one snapshot in flight and one queued. Every caller of the queued one is answered by a snapshot that
  // starts after its call, so a helper slower than the sample interval never builds a backlog ahead of the census or reap.
  let queued = null;
  const sample = () => {
    if (reaping) return reaping.then(() => undefined);
    if (queued) return queued;
    queued = chain = chain.then(async () => {
      queued = null;
      try { absorb(await tools.snapshot()); samples++; } catch (error) { sampleFailures++; record(`sample: ${message(error)}`); }
    });
    return chain;
  };
  const reap = () => reaping ??= chain.then(async () => {
    const terminations = [];
    let residue = null, final = null, confirmed = false;
    for (let round = 1; round <= rounds; round++) {
      let snapshot;
      try { snapshot = await tools.snapshot(); } catch (error) { record(`reap snapshot ${round}: ${message(error)}`); continue; }
      const alive = absorb(snapshot);
      residue ??= alive.map(({pid: p, created, name, depth}) => ({pid: p, created, name, depth}));
      if (!alive.length) { final = snapshot; confirmed = true; break; }
      try {
        for (const r of await tools.terminate(alive.map(({pid: p, created}) => ({pid: p, created})))) if (terminations.length < LIST_CAP) terminations.push({round, ...r});
      } catch (error) { record(`terminate ${round}: ${message(error)}`); }
    }
    if (!confirmed) record(`tree termination not confirmed by an OS snapshot after ${rounds} rounds`);
    const q = final ? quiescenceOf(final) : {quiescent: false, nvda_processes: [], nvda_listeners: [], errors: ['no confirming snapshot']};
    return Object.freeze({schema: CUSTODY_SCHEMA, phase: 'reap', confirmed, quiescent: confirmed && q.quiescent,
      root: root ? {pid: root.pid, created: root.created, exact: root.created !== null} : null,
      residue: cap(residue ?? []), terminations, observed: [...observed], known: known.size, samples, sample_failures: sampleFailures,
      nvda_processes: q.nvda_processes, nvda_listeners: q.nvda_listeners, errors: cap([...errors, ...(confirmed ? q.errors : [])])});
  }).catch(error => Object.freeze({schema: CUSTODY_SCHEMA, phase: 'reap', confirmed: false, quiescent: false, root: null, residue: [], terminations: [], observed: [],
    known: 0, samples, sample_failures: sampleFailures, nvda_processes: [], nvda_listeners: [], errors: [`reap: ${message(error)}`]}));
  const exited = () => { exitedAt ??= BigInt(wallMicros(wallClock)); };
  return Object.freeze({sample, reap, exited});
}
