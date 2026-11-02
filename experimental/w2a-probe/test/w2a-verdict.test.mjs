// W2a verdict contract, Revision 2, written before w2a-verdict.mjs was changed. Synthetic evidence only; no process,
// job or browser is touched. Every missing-measurement and contradiction path in the Codex HOLD has a negative case.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evaluate} from '../scripts/tabwise/windows/w2a/w2a-verdict.mjs';

const SHA = 'a'.repeat(64);
const BASE = 134_000_000_000_000_000n;
const ft = sec => String(BASE + BigInt(Math.round(sec * 10)) * 1_000_000n);
const id = (pid, sec) => ({pid, created: ft(sec)});

// A complete run in which every gate holds. Each identity lives over [from, to) seconds, and the observer sees exactly that.
function passing() {
  const life = [];
  const live = (ident, from, to) => { life.push({ident, from, to}); return ident; };
  const main = [{kind: 'probe-load', ok: true, source_sha256: SHA, t: ft(0)}, {kind: 'host-start', host: id(100, 0), t: ft(0)}];
  const begin = (c, sec) => main.push({kind: 'case-start', case: c, t: ft(sec)});
  const end = (c, sec) => main.push({kind: 'case-end', case: c, t: ft(sec)});
  const result = (c, sec, status, data) => main.push({kind: 'result', case: c, status, data, t: ft(sec)});
  const cleanup = (c, sec) => main.push({kind: 'case-cleanup', case: c, job_end_ok: true, outside: [], pumps_open: [], all_final: true, t: ft(sec)});
  const contained = (c, sec, idents, endSec) => {
    main.push({kind: 'members', case: c, members: idents, vanished: [], unknown: [], t: ft(sec)});
    main.push({kind: 'emptied', case: c, reason: 'case', errors: [], members: idents, unknown_members: [], terminate_called_at: ft(endSec),
      active_processes: 0, pids_after: [], survivors: [], unknown_after: [], terminated_at: ft(endSec), ok: true, t: ft(endSec)});
  };
  const inJob = {open: true, identity_match: true, in_owned_job: true};

  begin('T0', 1);
  result('T0', 1.5, 'pass', {session_id: 1, user_interactive: true, node_sha256: 'b'.repeat(64), chromium: {path: 'C:\\c\\chrome.exe', sha256: 'c'.repeat(64)},
    ancestry: [{pid: 100, name: 'powershell.exe', in_any_job: false}]});
  cleanup('T0', 1.6); end('T0', 1.7);

  begin('T1', 2);
  result('T1', 2.5, 'pass', {flags: '8192', kill_on_close: true, breakaway_ok: false, silent_breakaway_ok: false, ui: '0', ui_known: true, ui_query_error: 0, handle_inheritable: false});
  end('T1', 2.7);

  begin('T2', 10);
  contained('T2', 12, [live(id(201, 10), 10, 13), live(id(202, 11), 11, 13)], 13);
  result('T2', 13.5, 'pass', {child: {...inJob, pid: 201}, grandchild: {...inJob, pid: 202}, node_job_measurement: 'innermost-pidset-equals-owned'});
  cleanup('T2', 13.6); end('T2', 13.7);

  begin('T3', 20);
  contained('T3', 22, [live(id(301, 20), 20, 23), live(id(302, 21), 21, 23)], 23);
  result('T3', 23.5, 'pass', {breakaway: {refused: true, error: 5}, control: {...inJob, pid: 302}});
  cleanup('T3', 23.6); end('T3', 23.7);

  begin('T4', 30);
  contained('T4', 32, [live(id(401, 30), 30, 33), live(id(402, 30), 30, 33)], 33);
  result('T4', 33.5, 'pass', {child_exit: 0, detached_state: 'alive', detached: {...inJob, pid: 401}, attached_state: 'alive', attached: {...inJob, pid: 402}});
  cleanup('T4', 33.6); end('T4', 33.7);

  begin('T5C', 35);
  result('T5C-off', 36, 'pass', {ready: {data_text: 'w2a'}, nodes: [{class: 'outside-control', integrity_rid: 8192}], ambiguous: []});
  cleanup('T5C-off', 36.1);
  result('T5C-on', 38, 'pass', {ready: {data_text: 'w2a'}, nodes: [{class: 'outside-control', integrity_rid: 8192}, {class: 'outside-control', integrity_rid: 0}], ambiguous: []});
  cleanup('T5C-on', 38.1); end('T5C', 38.2);

  begin('T5', 39);
  contained('T5-off', 42, [live(id(501, 40), 40, 45), live(id(502, 41), 41, 45)], 45);
  result('T5-off', 45.5, 'pass', {ready: {data_text: 'w2a'}, nodes: [{class: 'in-job', integrity_rid: 8192}, {class: 'in-job-by-pidlist'}], ambiguous: []});
  cleanup('T5-off', 45.6);
  contained('T5-on', 52, [live(id(511, 50), 50, 55)], 55);
  result('T5-on', 55.5, 'pass', {ready: {data_text: 'w2a'}, nodes: [{class: 'in-job', integrity_rid: 8192}, {class: 'in-job', integrity_rid: 0}], ambiguous: []});
  cleanup('T5-on', 55.6); end('T5', 55.7);

  begin('T8', 59);
  contained('T8', 60, [id(801, 60)], 61);
  result('T8', 61.5, 'pass', {child_exit: 0, active_processes: 0, total_processes: 1, pids: []});
  cleanup('T8', 61.6); end('T8', 61.7);

  begin('T9', 69);
  live(id(990, 71), 71, 72);
  contained('T9', 74, [live(id(901, 70), 70, 75)], 75);
  result('T9', 75.5, 'recorded', {window_start: ft(70), window_end: ft(75), job_pid_union: [id(901, 70)], establishes: 'temporal correlation only'});
  cleanup('T9', 75.6); end('T9', 75.7);

  begin('T10', 79);
  contained('T10', 82, [live(id(1001, 80), 80, 84)], 84);
  result('T10', 84.5, 'pass', {child_exit: 0, chrome_identity_state: 'identified', chrome: {...inJob, pid: 1001}, eof_before_terminate: false,
    terminate_requested_at: ft(83.9), stdout_eof_at: ft(84.2), stdout_error_at: '0', stdout_error: null});
  cleanup('T10', 84.6); end('T10', 84.7);
  main.push({kind: 'host-end', t: ft(90)});

  const crashHost = (c, hostIdent, member, sec) => [
    {kind: 'probe-load', ok: true, source_sha256: SHA, t: ft(sec)},
    {kind: 'host-start', host: live(hostIdent, sec, sec + 3), t: ft(sec)},
    {kind: 'case-start', case: c, t: ft(sec)},
    {kind: 'members', case: c, members: [member], vanished: [], unknown: [], t: ft(sec + 2)},
    {kind: 'crash-armed', case: c, t: ft(sec + 2)},
  ];
  const t6 = crashHost('T6', id(600, 100), live(id(601, 101), 101, 104), 100);
  const t7 = crashHost('T7', id(700, 120), live(id(701, 121), 121, 134), 120);
  const crashCleanup = terminations => ({confirmed: true, terminations, remaining: [], ambiguous: [], unresolved: [], snapshot_errors: []});
  const watchdog = [
    {kind: 'watchdog-start', t: ft(-1)},
    {kind: 'crash-result', case: 'T6', leaked_handle: false, host: id(600, 100), unknown_at_arm: [], host_state_before_kill: 'alive', host_exit_confirmed: true,
      killed_at: ft(103), all_gone_at: ft(104), members_at_10s: [{...id(601, 101), state: 'gone'}], survivors_at_10s: [], unknown_at_10s: [],
      cleanup: crashCleanup([]), t: ft(114)},
    {kind: 'crash-result', case: 'T7', leaked_handle: true, host: id(700, 120), unknown_at_arm: [], host_state_before_kill: 'alive', host_exit_confirmed: true,
      killed_at: ft(123), all_gone_at: null, members_at_10s: [{...id(701, 121), state: 'alive'}], survivors_at_10s: [{...id(701, 121), state: 'alive'}],
      unknown_at_10s: [], cleanup: crashCleanup([{round: 1, pid: 701, created: ft(121), result: 'terminated'}]), t: ft(134)},
    {kind: 'watchdog-end', handled: ['T6', 'T7'], reason: 'stop-file', t: ft(141)},
  ];
  const observer = [{kind: 'start', t: ft(-3)}];
  for (let s = -2, seq = 1; s <= 140; s++, seq++) {
    const rows = life.filter(l => l.from <= s && s < l.to).map(l => [l.ident.pid, 1, 'x.exe', l.ident.created]);
    observer.push({kind: 'snapshot', seq, t: ft(s), t_end: ft(s + 0.2), processes: rows});
  }
  observer.push({kind: 'end', reason: 'stop-file', t: ft(141)});
  const launch = (name, code) => ({schema: 'w2a-launch/2', name, spawn_error: null, timed_out: false, exited: 1, ended: 2, code, host_exit_confirmed: true, stdio_closed: true});
  return {
    meta: {expected_source_sha256: SHA},
    hosts: {main, T6: t6, T7: t7},
    watchdog,
    sweep: [{kind: 'sweep', roots: 20, confirmed: true, input_errors: [], terminations: [], remaining: [], ambiguous: [], unresolved: [], snapshot_errors: []}],
    observer,
    launches: {main: launch('main', 0), T6: launch('T6', 1), T7: launch('T7', 1)},
    helpers: {observer: {exit_confirmed: true, forced: false}, watchdog: {exit_confirmed: true, forced: false}},
    parseErrors: [],
  };
}
const main = input => input.hosts.main;
const result = (input, c) => main(input).find(r => r.kind === 'result' && r.case === c);
const emptied = (input, c) => main(input).find(r => r.kind === 'emptied' && r.case === c);
const members = (input, c) => main(input).find(r => r.kind === 'members' && r.case === c);
const crash = (input, c) => input.watchdog.find(r => r.kind === 'crash-result' && r.case === c);
const drop = (input, pred) => { input.hosts.main = main(input).filter(r => !pred(r)); };
const reasons = v => [...v.inconclusive, ...v.reject].join('\n');

test('a complete passing run is FEASIBLE and reports the measured observations', () => {
  const v = evaluate(passing());
  assert.equal(v.verdict, 'FEASIBLE', reasons(v));
  assert.deepEqual(v.reject, []);
  assert.deepEqual(v.inconclusive, []);
  assert.equal(v.observations.node_job_measurement, 'innermost-pidset-equals-owned');
  assert.equal(v.observations.sandbox.in_job_on, 'pass');
  assert.deepEqual(v.observations.t9_out_of_job, [{pid: 990, name: 'x.exe', created: ft(71)}]);
});

test('the Node job measurement is reported, never gated on', () => {
  const input = passing();
  result(input, 'T2').data.node_job_measurement = 'innermost-pidset-differs';
  const v = evaluate(input);
  assert.equal(v.verdict, 'FEASIBLE', reasons(v));
  assert.equal(v.observations.node_job_measurement, 'innermost-pidset-differs');
});

test('a sandbox-enabled failure alone is an observation, not a gate', () => {
  const input = passing();
  result(input, 'T5-on').status = 'fail';
  const v = evaluate(input);
  assert.equal(v.verdict, 'FEASIBLE', reasons(v));
  assert.equal(v.observations.sandbox.in_job_on, 'fail');
});

test('a reused pid with a different creation time is not a survivor', () => {
  const input = passing();
  for (const snap of input.observer.filter(r => r.kind === 'snapshot' && BigInt(r.t) >= BigInt(ft(50)) && BigInt(r.t) < BigInt(ft(60)))) {
    snap.processes.push([502, 1, 'x.exe', ft(49)]);
  }
  assert.equal(evaluate(input).verdict, 'FEASIBLE');
});

test('inconclusive outranks reject, and the rejects are kept as provisional', () => {
  const input = passing();
  result(input, 'T2').status = 'fail';
  input.helpers.observer.exit_confirmed = false;
  const v = evaluate(input);
  assert.equal(v.verdict, 'INCONCLUSIVE');
  assert.match(v.reject.join('\n'), /T2/);
  assert.equal(v.rejects_are_provisional, true);
});

// [name, mutation, expected verdict, pattern the reasons must match]
const CASES = [
  // Gating failures.
  ['a failed gating case rejects', i => { result(i, 'T2').status = 'fail'; }, 'REJECT', /T2/],
  ['T5-off failing while the out-of-job control passes rejects', i => { result(i, 'T5-off').status = 'fail'; }, 'REJECT', /T5-off/],
  ['T6 members alive 10 s after the host kill reject', i => { const r = crash(i, 'T6'); r.members_at_10s[0].state = 'alive'; r.survivors_at_10s = [{...id(601, 101), state: 'alive'}]; }, 'REJECT', /T6/],
  ['an emptied member the observer still sees 3 s after termination rejects', i => {
    for (const s of i.observer.filter(r => r.kind === 'snapshot' && BigInt(r.t) >= BigInt(ft(45)) && BigInt(r.t) < BigInt(ft(60)))) s.processes.push([502, 1, 'x.exe', ft(41)]);
  }, 'REJECT', /502/],
  ['a survivor in a gating emptied record rejects', i => { const e = emptied(i, 'T4'); e.survivors = [{...id(401, 30), pin: 'terminated'}]; e.ok = false; result(i, 'T4').status = 'fail'; }, 'REJECT', /T4/],

  // Controls and case outcomes that cannot discriminate.
  ['a failed out-of-job control is inconclusive', i => { result(i, 'T5C-off').status = 'fail'; }, 'INCONCLUSIVE', /T5C-off/],
  ['a gating case that errored is inconclusive', i => { result(i, 'T3').status = 'error'; }, 'INCONCLUSIVE', /T3/],
  ['a gating case reported inconclusive is inconclusive', i => { result(i, 'T4').status = 'inconclusive'; }, 'INCONCLUSIVE', /T4/],
  ['a case skipped at the deadline is inconclusive', i => { result(i, 'T10').status = 'skipped-deadline'; }, 'INCONCLUSIVE', /T10/],
  ['a T7 leaked-handle control with no survivors is inconclusive', i => { const r = crash(i, 'T7'); r.survivors_at_10s = []; r.members_at_10s[0].state = 'gone'; }, 'INCONCLUSIVE', /T7/],
  ['a T7 that did not leak the handle is inconclusive', i => { crash(i, 'T7').leaked_handle = false; }, 'INCONCLUSIVE', /T7/],
  ['a T6 that leaked the handle is inconclusive', i => { crash(i, 'T6').leaked_handle = true; }, 'INCONCLUSIVE', /T6/],

  // Missing records.
  ['a missing T0 is inconclusive', i => drop(i, r => r.case === 'T0'), 'INCONCLUSIVE', /T0/],
  ['a missing result is inconclusive', i => drop(i, r => r.kind === 'result' && r.case === 'T8'), 'INCONCLUSIVE', /T8/],
  ['a missing emptied record is inconclusive', i => drop(i, r => r.kind === 'emptied' && r.case === 'T2'), 'INCONCLUSIVE', /T2/],
  ['a missing members record is inconclusive', i => drop(i, r => r.kind === 'members' && r.case === 'T3'), 'INCONCLUSIVE', /T3/],
  ['a missing case-cleanup record is inconclusive', i => drop(i, r => r.kind === 'case-cleanup' && r.case === 'T4'), 'INCONCLUSIVE', /T4/],
  ['a missing case-end is inconclusive', i => drop(i, r => r.kind === 'case-end' && r.case === 'T9'), 'INCONCLUSIVE', /T9/],
  ['a missing host-end is inconclusive', i => drop(i, r => r.kind === 'host-end'), 'INCONCLUSIVE', /host-end/],
  ['a host file without a successful probe-load is inconclusive', i => { i.hosts.T6 = i.hosts.T6.filter(r => r.kind !== 'probe-load'); }, 'INCONCLUSIVE', /probe-load/],
  ['a missing meta.json is inconclusive', i => { i.meta = null; }, 'INCONCLUSIVE', /meta/],
  ['a source hash mismatch is inconclusive', i => { i.meta.expected_source_sha256 = 'b'.repeat(64); }, 'INCONCLUSIVE', /pinned/],
  ['a missing crash-result is inconclusive', i => { i.watchdog = i.watchdog.filter(r => r.case !== 'T6'); }, 'INCONCLUSIVE', /T6/],
  ['a missing watchdog-end is inconclusive', i => { i.watchdog = i.watchdog.filter(r => r.kind !== 'watchdog-end'); }, 'INCONCLUSIVE', /watchdog/],
  ['a watchdog that ended at its deadline is inconclusive', i => { i.watchdog.at(-1).reason = 'deadline'; }, 'INCONCLUSIVE', /watchdog/],
  ['a missing observer end is inconclusive', i => { i.observer = i.observer.filter(r => r.kind !== 'end'); }, 'INCONCLUSIVE', /observer/],
  ['an observer that stopped on its byte cap is inconclusive', i => { i.observer.at(-1).reason = 'byte-cap'; }, 'INCONCLUSIVE', /observer/],
  ['a missing final sweep is inconclusive', i => { i.sweep = []; }, 'INCONCLUSIVE', /sweep/],
  ['a missing launch is inconclusive', i => { delete i.launches.T7; }, 'INCONCLUSIVE', /T7/],
  ['missing helpers.json is inconclusive', i => { i.helpers = null; }, 'INCONCLUSIVE', /observer/],

  // Duplicates and malformed data.
  ['a duplicate result is inconclusive', i => { main(i).push({...result(i, 'T1')}); }, 'INCONCLUSIVE', /duplicate/],
  ['a duplicate case-start is inconclusive', i => { main(i).push({kind: 'case-start', case: 'T2', t: ft(89)}); }, 'INCONCLUSIVE', /duplicate/],
  ['a duplicate emptied record is inconclusive', i => { main(i).push({...emptied(i, 'T8')}); }, 'INCONCLUSIVE', /duplicate/],
  ['a duplicate crash-result is inconclusive', i => { i.watchdog.splice(1, 0, {...crash(i, 'T6')}); }, 'INCONCLUSIVE', /duplicate/],
  ['unparseable evidence is inconclusive', i => { i.parseErrors.push('observer.jsonl:7: Unexpected token'); }, 'INCONCLUSIVE', /unparseable/],
  ['a member without a creation time is inconclusive', i => { members(i, 'T3').members[0] = {pid: 301, created: 301}; }, 'INCONCLUSIVE', /T3/],
  ['an unknown job member is inconclusive', i => { members(i, 'T3').unknown = [{pid: 333, created: null, state: 'unknown:5'}]; }, 'INCONCLUSIVE', /T3/],
  ['an emptied record with no members is inconclusive', i => { emptied(i, 'T10').members = []; }, 'INCONCLUSIVE', /T10/],
  ['an emptied member whose state is unknown after termination is inconclusive', i => { emptied(i, 'T2').unknown_after = [{...id(201, 10), state: 'unknown:5'}]; }, 'INCONCLUSIVE', /T2/],
  ['an emptied record with a query error is inconclusive', i => { emptied(i, 'T3').errors = ['accounting: failed']; }, 'INCONCLUSIVE', /T3/],
  ['T0 without a Node hash is inconclusive', i => { delete result(i, 'T0').data.node_sha256; }, 'INCONCLUSIVE', /T0/],
  ['T0 without ancestry is inconclusive', i => { result(i, 'T0').data.ancestry = []; }, 'INCONCLUSIVE', /T0/],
  ['T1 whose UI-limit query failed is inconclusive', i => { const d = result(i, 'T1').data; d.ui_known = false; d.ui_query_error = 5; }, 'INCONCLUSIVE', /T1/],
  ['T9 with an inverted window is inconclusive', i => { result(i, 'T9').data.window_end = ft(60); }, 'INCONCLUSIVE', /T9/],

  // Contradictions between a reported status and its own measurements.
  ['T1 pass with kill-on-close clear is a contradiction', i => { result(i, 'T1').data.kill_on_close = false; }, 'INCONCLUSIVE', /T1.*contradict/],
  ['T1 fail with every limit correct is a contradiction', i => { result(i, 'T1').status = 'fail'; }, 'INCONCLUSIVE', /T1.*contradict/],
  ['T2 pass with the grandchild outside the job is a contradiction', i => { result(i, 'T2').data.grandchild.in_owned_job = false; }, 'INCONCLUSIVE', /T2.*contradict/],
  ['T2 pass whose emptied record is not ok is a contradiction', i => { emptied(i, 'T2').ok = false; }, 'INCONCLUSIVE', /T2.*contradict/],
  ['T3 pass with a non-refusal error code is a contradiction', i => { result(i, 'T3').data.breakaway.error = 6; }, 'INCONCLUSIVE', /T3.*contradict/],
  ['T4 pass with the detached orphan gone is a contradiction', i => { result(i, 'T4').data.detached_state = 'gone'; }, 'INCONCLUSIVE', /T4.*contradict/],
  ['T5-off pass with an unknown tree node is a contradiction', i => { result(i, 'T5-off').data.nodes.push({class: 'unknown'}); }, 'INCONCLUSIVE', /T5-off/],
  ['T5-off pass with ambiguous ancestry is a contradiction', i => { result(i, 'T5-off').data.ambiguous = [{pid: 9, reason: 'parent-not-in-snapshot'}]; }, 'INCONCLUSIVE', /T5-off/],
  ['T5-off pass with no launched page is a contradiction', i => { result(i, 'T5-off').data.ready.data_text = null; }, 'INCONCLUSIVE', /T5-off.*contradict/],
  ['T8 pass with an active process is a contradiction', i => { result(i, 'T8').data.active_processes = 1; }, 'INCONCLUSIVE', /T8.*contradict/],
  ['T10 pass after a read error is a contradiction', i => { const d = result(i, 'T10').data; d.stdout_error_at = ft(84.1); d.stdout_error = 'IOException: pipe broken'; }, 'INCONCLUSIVE', /T10/],
  ['T10 pass with end of file 6 s after terminate is a contradiction', i => { result(i, 'T10').data.stdout_eof_at = ft(89.9); }, 'INCONCLUSIVE', /T10.*contradict/],
  ['T10 pass without any end of file is a contradiction', i => { result(i, 'T10').data.stdout_eof_at = '0'; }, 'INCONCLUSIVE', /T10.*contradict/],

  // Cleanup, helpers and launches.
  ['an unfinished case cleanup is inconclusive', i => { const c = main(i).find(r => r.kind === 'case-cleanup' && r.case === 'T5C-on'); c.all_final = false; c.outside = [{pid: 5, created: ft(37), result: 'unknown:5'}]; }, 'INCONCLUSIVE', /T5C-on/],
  ['a crash host that was never killed is inconclusive', i => { i.hosts.T6.push({kind: 'not-killed', case: 'T6', t: ft(222)}); }, 'INCONCLUSIVE', /T6/],
  ['T6 host exit not confirmed is inconclusive', i => { crash(i, 'T6').host_exit_confirmed = false; }, 'INCONCLUSIVE', /T6/],
  ['a crash-result error is inconclusive', i => { crash(i, 'T6').error = 'boom'; }, 'INCONCLUSIVE', /T6/],
  ['T6 members of unknown state at 10 s are inconclusive', i => { const r = crash(i, 'T6'); r.members_at_10s[0].state = 'unknown:5'; r.unknown_at_10s = [r.members_at_10s[0]]; }, 'INCONCLUSIVE', /T6/],
  ['crash members that differ from the host record are a contradiction', i => { crash(i, 'T6').members_at_10s = [{...id(699, 101), state: 'gone'}]; }, 'INCONCLUSIVE', /T6.*contradict/],
  ['a T7 survivor that is not a T7 member is a contradiction', i => { const r = crash(i, 'T7'); r.survivors_at_10s = [{...id(777, 121), state: 'alive'}]; }, 'INCONCLUSIVE', /T7.*contradict/],
  ['a T7 survivor the cleanup never terminated is inconclusive', i => { crash(i, 'T7').cleanup.terminations = []; }, 'INCONCLUSIVE', /T7/],
  ['unconfirmed T7 cleanup is inconclusive', i => { crash(i, 'T7').cleanup.confirmed = false; }, 'INCONCLUSIVE', /T7/],
  ['a non-final cleanup termination is inconclusive', i => { crash(i, 'T7').cleanup.terminations[0].result = 'pending'; }, 'INCONCLUSIVE', /T7/],
  ['an unconfirmed final sweep is inconclusive', i => { i.sweep[0].confirmed = false; }, 'INCONCLUSIVE', /sweep/],
  ['a sweep that had to terminate something is unexplained residue', i => { i.sweep[0].terminations = [{round: 1, pid: 5, created: ft(80), result: 'terminated'}]; }, 'INCONCLUSIVE', /residue/],
  ['a sweep with ambiguous ancestry is inconclusive', i => { i.sweep[0].ambiguous = [{pid: 7, reason: 'parent-not-in-snapshot'}]; }, 'INCONCLUSIVE', /sweep/],
  ['an unconfirmed helper exit is inconclusive', i => { i.helpers.watchdog.exit_confirmed = false; }, 'INCONCLUSIVE', /watchdog/],
  ['a forced helper termination is inconclusive', i => { i.helpers.observer.forced = true; }, 'INCONCLUSIVE', /observer/],
  ['a timed-out launch is inconclusive', i => { i.launches.main.timed_out = true; }, 'INCONCLUSIVE', /main/],
  ['a main launch with a non-zero exit is inconclusive', i => { i.launches.main.code = 1; }, 'INCONCLUSIVE', /main/],
  ['a crash launch whose host exited 0 is unexpected', i => { i.launches.T6.code = 0; }, 'INCONCLUSIVE', /T6/],
  ['a launch whose host exit was not confirmed is inconclusive', i => { i.launches.T7.host_exit_confirmed = false; }, 'INCONCLUSIVE', /T7/],
  ['a launch whose stdio stayed open is inconclusive', i => { i.launches.main.stdio_closed = false; }, 'INCONCLUSIVE', /main/],

  // Observer independence.
  ['an observer gap over 5 s during the cases is inconclusive', i => {
    i.observer = i.observer.filter(r => r.kind !== 'snapshot' || BigInt(r.t) < BigInt(ft(50)) || BigInt(r.t) > BigInt(ft(57)));
  }, 'INCONCLUSIVE', /gap/],
  ['an observer snapshot error is inconclusive', i => { i.observer.splice(5, 0, {kind: 'snapshot-error', seq: 99, t: ft(2), error: 'timeout'}); }, 'INCONCLUSIVE', /snapshot/],
  ['a member the observer never saw is uncorroborated', i => {
    for (const s of i.observer.filter(r => r.kind === 'snapshot')) s.processes = s.processes.filter(p => p[0] !== 301);
  }, 'INCONCLUSIVE', /301/],
];

for (const [name, mutate, verdict, pattern] of CASES) {
  test(name, () => {
    const input = passing();
    mutate(input);
    const v = evaluate(input);
    assert.equal(v.verdict, verdict, reasons(v));
    assert.match(reasons(v), pattern);
  });
}
