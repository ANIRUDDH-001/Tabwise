// W2a verdict, Revision 2: a pure function of the evidence directory. It trusts no single source: host claims are
// cross-checked against the independent observer and watchdog, and every expected record must appear exactly once.
// A missing, duplicated or malformed record, an unexpected launch exit, a forced helper stop, unexplained residue or a
// status that contradicts its own measurements can never produce FEASIBLE. Precedence is INCONCLUSIVE > REJECT >
// FEASIBLE; when the run is inconclusive any rejects are kept and marked provisional. A REJECT selects no alternative
// architecture (W2a owner correction 5): VM-per-fixture or any other fallback needs its own architecture review.
// Usage: node w2a-verdict.mjs <evidenceDir>   exit 0 FEASIBLE, 1 REJECT, 2 INCONCLUSIVE, 3 usage or read failure.
import {readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const S = 10_000_000n;                                     // FILETIME ticks per second
const MAX_OBSERVER_GAP = 5n * S;
const AFTER_TERMINATION = 3n * S;
const CORROBORATION = 5n * S;
const CRASH_WATCH = 10n * S;
const EOF_AFTER_TERMINATE = 5n * S;
const FOREVER = 2n ** 64n;
const MAIN_CASES = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5C', 'T5', 'T8', 'T9', 'T10'];
const RESULTS = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5C-off', 'T5C-on', 'T5-off', 'T5-on', 'T8', 'T9', 'T10'];
const GATING = ['T1', 'T2', 'T3', 'T4', 'T5-off', 'T8', 'T10'];
const CHROMIUM = ['T5C-off', 'T5C-on', 'T5-off', 'T5-on'];
const CLEANED = RESULTS.filter(c => c !== 'T1');           // T1 opens a job only; every other case writes case-cleanup
const JOBBED = ['T2', 'T3', 'T4', 'T5-off', 'T5-on', 'T8', 'T9', 'T10'];
const CRASH = ['T6', 'T7'];
const HOSTS = ['main', ...CRASH];
// Cases whose members live long enough for a 1 s observer to see them; T8 and T9 members may exit within one interval.
const CORROBORATED = new Set(['T2', 'T3', 'T4', 'T5-off', 'T5-on', 'T6', 'T7', 'T10']);
const FINAL = new Set(['terminated', 'gone', 'mismatch']);
const NODE_MEASUREMENTS = new Set(['grandchild-in-no-job', 'innermost-pids-unreadable', 'innermost-pidset-equals-owned', 'innermost-pidset-differs']);
const HEX64 = /^[0-9a-f]{64}$/;

// A FILETIME is a non-zero decimal string; '0' means "never happened" and is not a time.
const ftOf = v => (typeof v === 'string' && /^\d{1,20}$/.test(v) && !/^0+$/.test(v) ? BigInt(v) : null);
const isId = m => m != null && Number.isSafeInteger(m.pid) && m.pid > 0 && ftOf(m.created) !== null;
const key = m => `${m.pid}@${ftOf(m.created) / 10n}`;     // identity grain: pid plus creation time to the microsecond
const empty = v => Array.isArray(v) && v.length === 0;
const list = v => (Array.isArray(v) ? v : []);
const sameSet = (a, b) => { const kb = new Set(b.map(key)); return new Set(a.map(key)).size === kb.size && a.every(m => kb.has(key(m))); };

export function evaluate(input) {
  const inconclusive = [], reject = [];
  const observations = {};
  const hold = message => inconclusive.push(message);
  try { check(input ?? {}, hold, message => reject.push(message), observations); }
  catch (error) { hold(`evidence malformed: ${error.message}`); }
  const verdict = inconclusive.length ? 'INCONCLUSIVE' : reject.length ? 'REJECT' : 'FEASIBLE';
  return {schema: 'w2a-verdict/2', verdict, inconclusive, reject, rejects_are_provisional: verdict === 'INCONCLUSIVE' && reject.length > 0, observations};
}

function check(input, hold, fail, observations) {
  // Exactly one record matching pred, or a hold naming what is missing or duplicated.
  const one = (records, pred, label) => {
    const found = records.filter(pred);
    if (found.length > 1) hold(`${label}: duplicate records (${found.length})`);
    else if (!found.length) hold(`${label}: missing`);
    return found.length === 1 ? found[0] : null;
  };
  const identities = (c, value, what) => {
    if (!Array.isArray(value)) { hold(`${c}: ${what} list missing`); return []; }
    for (const m of value) if (!isId(m)) hold(`${c}: ${what} ${m?.pid} has no valid pid and creation time`);
    return value.filter(isId);
  };

  for (const error of list(input.parseErrors)) hold(`unparseable evidence: ${error}`);
  const expected = input.meta?.expected_source_sha256;
  if (!HEX64.test(expected ?? '')) hold('meta.json missing or has no pinned JobProbe.cs SHA-256');

  // ---- Host files: each compiled the pinned source, and each case started (and on main, ended) exactly once.
  const hosts = input.hosts ?? {};
  for (const name of Object.keys(hosts)) if (!HOSTS.includes(name)) hold(`unexpected host file host-${name}.jsonl`);
  for (const name of HOSTS) {
    if (!Array.isArray(hosts[name])) { hold(`host-${name}.jsonl missing`); continue; }
    const records = hosts[name];
    const load = one(records, r => r.kind === 'probe-load', `host-${name} probe-load`);
    if (load && load.ok !== true) hold(`host-${name}: probe-load failed`);
    else if (load && load.source_sha256 !== expected) hold(`host-${name}: compiled source ${load.source_sha256} is not the pinned ${expected}`);
    one(records, r => r.kind === 'host-start', `host-${name} host-start`);
    const cases = name === 'main' ? MAIN_CASES : [name];
    for (const c of cases) one(records, r => r.kind === 'case-start' && r.case === c, `${c} case-start`);
    for (const r of records) if (r.kind === 'case-start' && !cases.includes(r.case)) hold(`host-${name}: unexpected case-start ${r.case}`);
    for (const r of records) if (r.kind === 'not-killed') hold(`host-${name}: ${r.case} was never killed by the watchdog`);
    for (const r of records) if (r.kind === 'crash-not-armed') hold(`host-${name}: ${r.case} never armed its crash`);
    if (name === 'main') {
      for (const c of MAIN_CASES) one(records, r => r.kind === 'case-end' && r.case === c, `${c} case-end`);
      one(records, r => r.kind === 'host-end', 'host-main host-end');
    } else {
      one(records, r => r.kind === 'crash-armed' && r.case === name, `${name} crash-armed`);
      for (const r of records) if (r.kind === 'result') hold(`host-${name}: crash host reported ${r.case} ${r.status}`);
    }
  }
  const main = list(hosts.main);

  // ---- Results: one per case; statuses outside the allowed set cannot discriminate.
  const results = new Map();
  for (const c of RESULTS) { const r = one(main, x => x.kind === 'result' && x.case === c, `${c} result`); if (r) results.set(c, r); }
  for (const r of main) if (r.kind === 'result' && !RESULTS.includes(r.case)) hold(`unexpected result for ${r.case}`);
  const status = c => results.get(c)?.status;
  const data = c => results.get(c)?.data ?? {};
  const contradiction = (c, what) => hold(`${c}: ${status(c)} contradicts ${what}`);
  for (const c of RESULTS) {
    const s = status(c);
    if (s === undefined) continue;
    const allowed = c === 'T9' ? ['recorded'] : c === 'T0' || c === 'T5C-off' ? ['pass'] : ['pass', 'fail'];
    if (!allowed.includes(s)) hold(c === 'T5C-off' ? `T5C-off: ${s}; the out-of-job Chromium control did not launch, so T5 cannot discriminate` : `${c}: ${s}`);
    else if (s === 'fail' && GATING.includes(c)) fail(`${c}: fail`);
  }

  // ---- Membership: one members record per job case and crash case; every member a full identity; none unknown.
  const membersOf = new Map();
  const memberRecord = (records, c) => {
    const r = one(records, x => x.kind === 'members' && x.case === c, `${c} members`);
    if (!r) return;
    membersOf.set(c, {r, ids: identities(c, r.members, 'member')});
    if (!empty(r.unknown)) hold(`${c}: job members of unknown identity: ${JSON.stringify(r.unknown ?? null)}`);
  };
  for (const c of JOBBED) memberRecord(main, c);
  for (const c of CRASH) memberRecord(list(hosts[c]), c);
  for (const r of Object.values(hosts).filter(Array.isArray).flat()) if (r.kind === 'members-at-end') {
    identities(r.case, r.members, 'member at job end');
    if (!empty(r.unknown)) hold(`${r.case}: job members of unknown identity at job end`);
  }

  // ---- Job emptiness: complete, self-consistent, and covering every recorded member.
  const emptiedOf = new Map();
  for (const c of JOBBED) {
    const e = one(main, x => x.kind === 'emptied' && x.case === c, `${c} emptied`);
    if (!e) continue;
    const ids = identities(c, e.members, 'emptied member');
    emptiedOf.set(c, {e, ids});
    if (!ids.length) hold(`${c}: emptied record lists no members`);
    if (!empty(e.errors)) hold(`${c}: emptied errors: ${JSON.stringify(e.errors ?? null)}`);
    if (!empty(e.unknown_members)) hold(`${c}: job members of unknown identity at termination`);
    if (!empty(e.unknown_after)) hold(`${c}: member state unknown after termination`);
    if (ftOf(e.terminated_at) === null) hold(`${c}: emptied record has no termination time`);
    const computed = empty(e.errors) && e.active_processes === 0 && empty(e.pids_after) && empty(e.survivors) && empty(e.unknown_after) &&
      empty(e.unknown_members) && ids.length > 0 && ids.length === list(e.members).length;
    if (e.ok !== computed) hold(`${c}: emptied ok=${e.ok} contradicts its own fields`);
    const recorded = membersOf.get(c)?.ids ?? [];
    const covered = new Set(ids.map(key));
    for (const m of recorded) if (!covered.has(key(m))) hold(`${c}: member ${m.pid} contradicts the emptied record, which omits it`);
    const survivors = list(e.survivors);
    if (survivors.length) {
      if (GATING.includes(c)) fail(`${c}: ${survivors.length} member(s) alive after TerminateJob`);
      else (observations.emptied_survivors ??= []).push({case: c, survivors});
    }
    if (GATING.includes(c) && status(c) === 'pass' && e.ok !== true) contradiction(c, 'an emptied record that is not ok');
  }

  // ---- Per-case cleanup owner: always ran, ended every target, left no pipe open.
  for (const c of CLEANED) {
    const k = one(main, x => x.kind === 'case-cleanup' && x.case === c, `${c} case-cleanup`);
    if (!k) continue;
    if (k.all_final !== true) hold(`${c}: case cleanup left a target alive, unknown or in error`);
    if (!empty(k.pumps_open)) hold(`${c}: output pipes still open at case cleanup`);
    if (k.end_error) hold(`${c}: case cleanup could not end the job: ${k.end_error}`);
    for (const o of list(k.outside)) if (!FINAL.has(o?.result)) hold(`${c}: outside process ${o?.pid} ended ${o?.result}`);
  }

  // ---- Case-specific evidence and contradictions between a status and its own measurements.
  if (status('T0') === 'pass') {
    const d = data('T0');
    if (!HEX64.test(d.node_sha256 ?? '')) hold('T0: no Node SHA-256');
    if (!HEX64.test(d.chromium?.sha256 ?? '')) hold('T0: no Chromium SHA-256');
    if (!Array.isArray(d.ancestry) || !d.ancestry.length) hold('T0: no host ancestry');
  }
  if (['pass', 'fail'].includes(status('T1'))) {
    const d = data('T1');
    if (d.ui_known !== true) hold(`T1: UI-limit query failed (error ${d.ui_query_error})`);
    else {
      const correct = d.kill_on_close === true && d.breakaway_ok === false && d.silent_breakaway_ok === false && d.handle_inheritable === false && d.ui === '0';
      if (correct !== (status('T1') === 'pass')) contradiction('T1', correct ? 'every measured limit being correct' : `its measured limits ${JSON.stringify(d)}`);
    }
  }
  if (['pass', 'fail'].includes(status('T2'))) {
    const d = data('T2');
    if (!NODE_MEASUREMENTS.has(d.node_job_measurement)) hold(`T2: node job measurement missing or unrecognised: ${d.node_job_measurement}`);
    if (status('T2') === 'pass') {
      if (d.child?.in_owned_job !== true) contradiction('T2', 'the child not shown in the owned job');
      if (d.grandchild?.in_owned_job !== true) contradiction('T2', 'the grandchild not shown in the owned job');
    }
  }
  if (status('T3') === 'pass') {
    const d = data('T3');
    if (d.breakaway?.refused !== true || d.breakaway?.error !== 5) contradiction('T3', `breakaway ${JSON.stringify(d.breakaway ?? null)} (needs refusal with ERROR_ACCESS_DENIED)`);
    if (d.control?.in_owned_job !== true) contradiction('T3', 'the control not shown in the owned job');
  }
  if (status('T4') === 'pass') {
    const d = data('T4');
    if (d.detached_state !== 'alive' || d.detached?.in_owned_job !== true) contradiction('T4', `the detached orphan ${d.detached_state}, not alive in the owned job`);
    if (d.attached_state === 'alive' && d.attached?.in_owned_job !== true) contradiction('T4', 'the attached orphan alive outside the owned job');
  }
  for (const c of CHROMIUM) {
    if (!['pass', 'fail'].includes(status(c))) continue;
    const d = data(c), nodes = list(d.nodes);
    if (nodes.some(n => n?.class === 'unknown')) hold(`${c}: tree node of unknown job membership`);
    if (!empty(d.ambiguous)) hold(`${c}: tree nodes of ambiguous ancestry: ${JSON.stringify(d.ambiguous ?? null)}`);
    if (status(c) !== 'pass') continue;
    if (d.ready?.data_text !== 'w2a') contradiction(c, `no launched page (data_text ${d.ready?.data_text})`);
    if (d.root_seen === false) contradiction(c, 'a root the snapshot never saw');
    const inJob = c.startsWith('T5-');
    const fits = inJob ? ['in-job', 'in-job-by-pidlist'] : ['outside-control'];
    if (!nodes.some(n => fits.includes(n?.class))) contradiction(c, `a tree with no ${fits.join(' or ')} node`);
    if (inJob && nodes.some(n => n?.class === 'outside')) contradiction(c, 'a tree node outside the owned job');
  }
  if (status('T8') === 'pass') {
    const d = data('T8');
    if (d.active_processes !== 0 || !empty(d.pids) || d.child_exit == null) contradiction('T8', `active_processes ${d.active_processes}, pids ${JSON.stringify(d.pids ?? null)}, child_exit ${d.child_exit}`);
  }
  if (status('T9') === 'recorded') {
    const d = data('T9');
    const lo = ftOf(d.window_start), hi = ftOf(d.window_end);
    if (lo === null || hi === null || hi <= lo) hold(`T9: window ${d.window_start}..${d.window_end} is missing or inverted`);
    identities('T9', d.job_pid_union, 'job pid union entry');
    if (d.establishes !== 'temporal correlation only') hold('T9: claim is not limited to temporal correlation');
  }
  if (['pass', 'fail'].includes(status('T10'))) {
    const d = data('T10');
    if (ftOf(d.stdout_error_at) !== null || d.stdout_error) hold(`T10: stdout read error (${d.stdout_error}) is not end of file`);
    if (status('T10') === 'pass') {
      if (d.chrome_identity_state !== 'identified' || d.chrome?.in_owned_job !== true) contradiction('T10', 'an orphan Chromium not shown in the owned job');
      const eof = ftOf(d.stdout_eof_at), term = ftOf(d.terminate_requested_at);
      if (eof === null) contradiction('T10', 'no stdout end of file');
      else if (d.eof_before_terminate !== true && (term === null || eof < term || eof - term > EOF_AFTER_TERMINATE)) {
        contradiction('T10', `end of file ${term === null ? 'with no terminate time' : `${(eof - term) / 10_000n} ms after terminate`}`);
      }
    }
  }

  // ---- Crash cases, judged only by the watchdog, cross-checked against the crash host's own members record.
  const watchdog = list(input.watchdog);
  const crash = new Map();
  for (const c of CRASH) {
    const x = one(watchdog, r => r.kind === 'crash-result' && r.case === c, `${c} crash-result`);
    if (!x) continue;
    crash.set(c, x);
    if (x.error) hold(`${c}: watchdog error: ${x.error}`);
    if (x.host_exit_confirmed !== true) hold(`${c}: host kill or exit not confirmed`);
    const hostStart = list(hosts[c]).find(r => r.kind === 'host-start');
    if (hostStart && !(isId(x.host) && isId(hostStart.host) && key(x.host) === key(hostStart.host))) hold(`${c}: watchdog host identity contradicts the host's own record`);
    if (x.leaked_handle !== (c === 'T7')) hold(`${c}: leaked_handle is ${x.leaked_handle}, expected ${c === 'T7'}`);
    if (!empty(x.unknown_at_10s)) hold(`${c}: member state unknown 10 s after the host kill`);
    const at10 = identities(c, x.members_at_10s, 'member at 10 s');
    for (const m of at10) if (!['alive', 'gone', 'mismatch'].includes(m.state)) hold(`${c}: member ${m.pid} state ${m.state} 10 s after the host kill`);
    const hostIds = membersOf.get(c)?.ids;
    if (hostIds && !sameSet(hostIds, at10)) hold(`${c}: watchdog members contradict the host members record`);
    const survivors = identities(c, x.survivors_at_10s, 'survivor');
    if (!sameSet(survivors, at10.filter(m => m.state === 'alive'))) hold(`${c}: survivors contradict the members alive at 10 s`);
    const cleanup = x.cleanup ?? {};
    if (cleanup.confirmed !== true) hold(`${c}: watchdog cleanup not confirmed`);
    for (const k of ['remaining', 'ambiguous', 'unresolved', 'snapshot_errors']) if (!empty(cleanup[k])) hold(`${c}: watchdog cleanup ${k} not empty`);
    if (!Array.isArray(cleanup.terminations)) hold(`${c}: watchdog cleanup terminations missing`);
    const terminations = list(cleanup.terminations);
    for (const t of terminations) if (!FINAL.has(t?.result)) hold(`${c}: cleanup termination of ${t?.pid} ended ${t?.result}`);
    if (c === 'T6' && survivors.length) fail(`T6: ${survivors.length} member(s) alive 10 s after the host was killed`);
    if (c === 'T7') {
      if (!survivors.length) hold('T7: the leaked-handle control left no survivors, so T6 is not shown to discriminate');
      for (const s of survivors) if (!terminations.some(t => isId(t) && key(t) === key(s) && t.result === 'terminated')) hold(`T7: survivor ${s.pid} was not terminated by the watchdog cleanup`);
    }
  }
  const watchdogEnd = one(watchdog, r => r.kind === 'watchdog-end', 'watchdog-end');
  if (watchdogEnd && watchdogEnd.reason !== 'stop-file') hold(`watchdog ended by ${watchdogEnd.reason}, not by the stop file`);

  // ---- Final sweep: confirmed, and nothing left for it to do. Anything it had to terminate is unexplained residue.
  const sweep = one(list(input.sweep), r => r.kind === 'sweep', 'final sweep');
  if (sweep) {
    if (sweep.confirmed !== true) hold('final sweep not confirmed');
    if (!empty(sweep.terminations)) hold(`final sweep terminated ${list(sweep.terminations).length} process(es): unexplained residue`);
    for (const k of ['ambiguous', 'unresolved', 'input_errors', 'snapshot_errors', 'remaining']) if (!empty(sweep[k])) hold(`final sweep: ${k} not empty`);
  }

  // ---- Helpers and launches: confirmed, unforced exits; hosts exited as their case requires.
  for (const helper of ['observer', 'watchdog']) {
    const h = input.helpers?.[helper];
    if (h?.exit_confirmed !== true) hold(`${helper}: exit not confirmed`);
    if (h?.forced !== false) hold(`${helper}: force-terminated, or its stop was not recorded`);
  }
  for (const name of HOSTS) {
    const l = input.launches?.[name];
    if (!l) { hold(`launch-${name}.json missing`); continue; }
    if (l.schema !== 'w2a-launch/2') hold(`launch-${name}: schema ${l.schema}`);
    if (l.spawn_error) hold(`launch-${name}: ${l.spawn_error}`);
    if (l.timed_out) hold(`launch-${name}: timed out`);
    if (l.kill_unconfirmed) hold(`launch-${name}: kill not confirmed`);
    if (l.ended == null) hold(`launch-${name}: did not end`);
    if (l.host_exit_confirmed !== true) hold(`launch-${name}: host exit not confirmed`);
    if (l.stdio_closed !== true) hold(`launch-${name}: host stdio did not close`);
    const expectedExit = name === 'main' ? l.code === 0 : Number.isInteger(l.code) && l.code !== 0;
    if (!expectedExit) hold(`launch-${name}: unexpected host exit code ${l.code}`);
  }

  // ---- Independent observer: its own end, coverage, then corroboration and post-termination survival.
  const observer = list(input.observer);
  const observerEnd = one(observer, r => r.kind === 'end', 'observer end');
  if (observerEnd && observerEnd.reason !== 'stop-file') hold(`observer ended by ${observerEnd.reason}, not by the stop file`);
  for (const r of observer) if (r.kind === 'snapshot-error') hold(`observer snapshot ${r.seq} failed: ${r.error}`);
  const snaps = [];
  for (const r of observer) if (r.kind === 'snapshot') {
    const t = ftOf(r.t);
    if (t === null || !Array.isArray(r.processes)) { hold(`observer snapshot ${r.seq} malformed`); continue; }
    const ids = new Map();
    for (const p of r.processes) if (Array.isArray(p) && isId({pid: p[0], created: p[3]})) ids.set(key({pid: p[0], created: p[3]}), p);
    snaps.push({t, ids});
  }
  snaps.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  const seenBetween = (k, lo, hi) => snaps.some(s => s.t >= lo && s.t <= hi && s.ids.has(k));
  const hostRecords = Object.values(hosts).filter(Array.isArray).flat();
  const times = records => records.map(r => ftOf(r.t)).filter(t => t !== null);
  const starts = times(hostRecords.filter(r => r.kind === 'case-start'));
  const ends = times([...hostRecords, ...crash.values()]);
  if (!starts.length || !ends.length || !snaps.length) hold('observer or case window missing');
  else {
    const from = starts.reduce((a, b) => (b < a ? b : a)), to = ends.reduce((a, b) => (b > a ? b : a));
    if (snaps[0].t > from) hold('observer did not cover the start of the cases');
    if (snaps.at(-1).t < to) hold('observer did not cover the end of the cases');
    for (let i = 1; i < snaps.length; i++) {
      if (snaps[i].t < from || snaps[i - 1].t > to) continue;
      const gap = snaps[i].t - snaps[i - 1].t;
      if (gap > MAX_OBSERVER_GAP) hold(`observer gap of ${gap / 10_000n} ms before snapshot at ${snaps[i].t}`);
    }
  }
  for (const [c, {r, ids}] of membersOf) {
    if (!CORROBORATED.has(c)) continue;
    const at = ftOf(r.t);
    if (at === null) { hold(`${c}: members record has no time`); continue; }
    for (const m of ids) if (!seenBetween(key(m), at - CORROBORATION, at + CORROBORATION)) hold(`${c}: member ${m.pid} not seen by the observer within 5 s`);
  }
  for (const [c, {e, ids}] of emptiedOf) {
    const terminated = ftOf(e.terminated_at);
    if (terminated === null) continue;
    for (const m of ids) {
      if (!seenBetween(key(m), terminated + AFTER_TERMINATION, FOREVER)) continue;
      if (GATING.includes(c)) fail(`${c}: observer saw member ${m.pid} alive 3 s or more after termination`);
      else (observations.post_termination_survivors ??= []).push({case: c, pid: m.pid});
    }
  }
  const t6 = crash.get('T6');
  if (t6) {
    const killed = ftOf(t6.killed_at);
    if (killed === null) hold('T6: no host kill time');
    else for (const m of membersOf.get('T6')?.ids ?? []) if (seenBetween(key(m), killed + CRASH_WATCH, FOREVER)) fail(`T6: observer saw member ${m.pid} alive 10 s after the host kill`);
  }

  // ---- Non-gating measurements, reported as observed.
  observations.node_job_measurement = data('T2').node_job_measurement ?? null;
  const rids = c => [...new Set(list(data(c).nodes).map(n => n?.integrity_rid).filter(v => v != null))].sort((a, b) => a - b);
  observations.sandbox = {control_on: status('T5C-on') ?? null, in_job_on: status('T5-on') ?? null,
    control_on_integrity_rids: rids('T5C-on'), in_job_on_integrity_rids: rids('T5-on')};
  const t9 = data('T9');
  const lo = ftOf(t9.window_start), hi = ftOf(t9.window_end);
  if (lo !== null && hi !== null) {
    const inJob = new Set(list(t9.job_pid_union).filter(isId).map(key));
    const outside = new Map();
    for (const s of snaps) for (const [k, p] of s.ids) {
      const created = ftOf(p[3]);
      if (created >= lo && created <= hi && !inJob.has(k)) outside.set(k, {pid: p[0], name: p[2], created: p[3]});
    }
    observations.t9_out_of_job = [...outside.values()];
  }
}

// ---- CLI ----------------------------------------------------------------------------------------------------------------
function readJsonl(file, parseErrors) {
  const out = [];
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    try { out.push(JSON.parse(line)); } catch (error) { parseErrors.push(`${file}:${i + 1}: ${error.message}`); }
  });
  return out;
}
function readJson(file, parseErrors) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (error) { parseErrors.push(`${file}: ${error.message}`); return null; }
}
export function load(dir) {
  const parseErrors = [];
  const names = readdirSync(dir);
  const jsonl = name => (names.includes(name) ? readJsonl(join(dir, name), parseErrors) : []);
  const hosts = {}, launches = {};
  for (const name of names) {
    const h = /^host-([A-Za-z0-9-]+)\.jsonl$/.exec(name);
    if (h) hosts[h[1]] = readJsonl(join(dir, name), parseErrors);
    const l = /^launch-([A-Za-z0-9-]+)\.json$/.exec(name);
    if (l) launches[l[1]] = readJson(join(dir, name), parseErrors);
  }
  return {meta: names.includes('meta.json') ? readJson(join(dir, 'meta.json'), parseErrors) : null, hosts, launches,
    watchdog: jsonl('watchdog.jsonl'), sweep: jsonl('sweep.jsonl'), observer: jsonl('observer.jsonl'),
    helpers: names.includes('helpers.json') ? readJson(join(dir, 'helpers.json'), parseErrors) : null, parseErrors};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: node w2a-verdict.mjs <evidenceDir>'); process.exit(3); }
  let v;
  try { v = evaluate(load(dir)); } catch (error) { console.error(`cannot read evidence: ${error.message}`); process.exit(3); }
  writeFileSync(join(dir, 'verdict.json'), `${JSON.stringify(v, null, 2)}\n`);
  console.log(JSON.stringify(v, null, 2));
  console.log(`W2A VERDICT: ${v.verdict}`);
  process.exit({FEASIBLE: 0, REJECT: 1, INCONCLUSIVE: 2}[v.verdict]);
}
