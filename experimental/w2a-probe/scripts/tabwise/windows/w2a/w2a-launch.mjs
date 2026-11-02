// W2a launcher: Node stands in for the R2 coordinator, so the host is reached through the same Node -> process hop.
// Usage: node w2a-launch.mjs <evidenceDir> <name> <timeoutMs> <deadlineEpochMs> -- <absolute exe> [args...]
// Writes <evidenceDir>/launch-<name>.json. The host gets min(timeoutMs, deadline - now). On timeout it kills only the
// host it started (never a tree) and records whether that exit was confirmed; host exit says nothing about descendants,
// which the watchdog sweep confirms. A descendant holding the stdio pipes cannot hang this script: after the host
// exits, stdio gets 5 s to close, then the streams are destroyed and stdio_closed is recorded false.
// Windows PowerShell's own module path is set explicitly (D-97: an inherited PowerShell 7 PSModulePath broke autoload).
import {spawn} from 'node:child_process';
import {createWriteStream, writeFileSync} from 'node:fs';
import {isAbsolute, join} from 'node:path';

const [dir, name, timeoutText, deadlineText, sep, exe, ...args] = process.argv.slice(2);
if (!dir || !/^[A-Za-z0-9-]{1,32}$/.test(name ?? '') || sep !== '--' || !isAbsolute(exe ?? '')) {
  console.error('usage: w2a-launch.mjs <evidenceDir> <name> <timeoutMs> <deadlineEpochMs> -- <absolute exe> [args...]');
  process.exit(2);
}
const cap = Number(timeoutText), deadline = Number(deadlineText);
if (!Number.isSafeInteger(cap) || cap < 1000 || cap > 1_800_000 || !Number.isSafeInteger(deadline)) { console.error('bad timeout or deadline'); process.exit(2); }
const timeoutMs = Math.min(cap, deadline - Date.now());
const STDIO_GRACE_MS = 5000, KILL_CONFIRM_MS = 10_000;
const root = process.env.SystemRoot;
const env = {...process.env, PSModulePath: `${process.env.ProgramFiles}\\WindowsPowerShell\\Modules;${root}\\System32\\WindowsPowerShell\\v1.0\\Modules`};
const CAP = 1_048_576;
const record = {schema: 'w2a-launch/2', name, launcher_pid: process.pid, exe, args, started: Date.now(), timeout_ms: timeoutMs, deadline_epoch_ms: deadline,
  child_pid: null, exited: null, ended: null, code: null, signal: null, timed_out: false, kill_sent: false, host_exit_confirmed: false,
  stdio_closed: null, spawn_error: null};
const save = () => writeFileSync(join(dir, `launch-${name}.json`), `${JSON.stringify(record)}\n`);
const finish = code => { record.ended = Date.now(); save(); process.exit(code); };
if (timeoutMs < 1000) { record.spawn_error = 'deadline already passed'; finish(2); }

const child = spawn(exe, args, {env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
record.child_pid = child.pid ?? null;
save();
const sinks = [];
const capped = (stream, file) => {
  const out = createWriteStream(file); sinks.push(out); let n = 0;
  stream.on('data', d => { if (n < CAP) out.write(d.subarray(0, CAP - n)); n += d.length; });
};
capped(child.stdout, join(dir, `launch-${name}.stdout.txt`));
capped(child.stderr, join(dir, `launch-${name}.stderr.txt`));

let killConfirm = null;
const timer = setTimeout(() => {
  record.timed_out = true;
  try { record.kill_sent = child.kill('SIGKILL'); } catch (error) { record.kill_error = error.message; }
  save();
  killConfirm = setTimeout(() => { record.kill_unconfirmed = true; finish(3); }, KILL_CONFIRM_MS);
}, timeoutMs);
child.on('error', error => { record.spawn_error = error.message; clearTimeout(timer); finish(2); });
child.on('exit', (code, signal) => {
  clearTimeout(timer); clearTimeout(killConfirm);
  Object.assign(record, {exited: Date.now(), code, signal, host_exit_confirmed: true});
  save();
  const grace = setTimeout(() => {
    record.stdio_closed = false;
    child.stdout.destroy(); child.stderr.destroy();
    finish(0);
  }, STDIO_GRACE_MS);
  child.on('close', () => { clearTimeout(grace); record.stdio_closed = true; finish(0); });
});
