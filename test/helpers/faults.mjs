// Opt-in scheduling and filesystem faults for the offline suite (D-50). Never imported by a test file;
// load it with NODE_OPTIONS="--import ./test/helpers/faults.mjs" so it runs in every test process
// before the sandbox and the vendored code capture fs.promises. Every fault is bounded and repeatable:
// - R1T_FS_DELAY_MS=n   each fs.promises call waits n ms before it runs (slow disk, antivirus scan);
// - R1T_STALL_MS=n      the event loop is blocked for n ms ...
// - R1T_STALL_EVERY_MS=m  ... every m ms (CPU contention on a shared runner; default 25).
// - R1T_COMPLETION_DELAY_MS=n delays setImmediate fake OS completions (targeted tests).
// With none set, this module changes nothing.
import fs from 'node:fs';

const num = (k) => { const v = Number(process.env[k] ?? 0); return Number.isFinite(v) && v > 0 ? v : 0; };
const fsDelay = num('R1T_FS_DELAY_MS');
const stall = num('R1T_STALL_MS');
const every = num('R1T_STALL_EVERY_MS') || 25;
// Delay fake asynchronous OS completions separately from event-loop stalls. This exposes a
// positive fixture whose write/exit deadline is shorter than the completion it is waiting for.
const completion = num('R1T_COMPLETION_DELAY_MS');
if (completion) globalThis.setImmediate = (fn, ...args) => setTimeout(fn, completion, ...args);

if (fsDelay) {
  for (const [name, real] of Object.entries(fs.promises)) {
    if (typeof real !== 'function' || name === 'constants') continue;
    fs.promises[name] = async function delayed(...args) {
      await new Promise((r) => setTimeout(r, fsDelay));
      return real.apply(this, args);
    };
  }
}
if (stall) {
  setInterval(() => { const until = performance.now() + stall; while (performance.now() < until) { /* stall */ } }, every).unref();
}
