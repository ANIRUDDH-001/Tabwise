// R2-L2 S3: page evidence writer and independent verifier (design §8.1, §8.2, §8.4, §8.5, §11 S3).
// Default-disabled: no production caller (S5a/S5b wire it). The frozen qualification writer
// (qualification-evidence.mjs) and its five-lane scope are unchanged; this file reuses its mechanics
// (exclusive create, lane and total caps, seal once, verify from disk) for the R2 per-page layout.
//
// The verifier trusts nothing the runner reported about itself. From the persisted bytes alone it re-applies
// the served-title transformation to the supplied fixture bytes, recomputes the step map from the approved task
// list, rebuilds every page read from the page-reads deltas (prefix and state hashes, continuity, coalesced runs,
// page-reported deltas), replays the rebuilt reads through the merged R2-L1 adapter (createPageJournal) and
// requires the persisted page lane to equal the replay, matches capture.json page samples to accepted reads, and
// recomputes the evidence class. A sealed manifest is integrity over files, NOT proof of physical execution:
// there is no authenticity mechanism here, so a directory carrying a provenance claim is never promoted (§8.4).
import {mkdirSync, writeFileSync, appendFileSync, readFileSync, readdirSync, lstatSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {createHash} from 'node:crypto';
import {textOf, pageHash} from '../../src/r2/contract.mjs';
import {createPageJournal} from '../../src/r2/page-journal.mjs';
import {SUPPORTED_PRESS} from './input-policy.mjs';
import {judgeKeys, VK} from '../../src/speech/sendguard.mjs';

export const PAGE_SCHEMA = 'tabwise-r2-page-evidence/1';
export const RUN_SCHEMA = 'tabwise-r2-run-evidence/1';
export const STEP_MAP_VERSION = 'tabwise-r2-step-map/1';
export const TRANSFORM = 'title-nonce-suffix/1';
// Lowest first. 'qualified' is listed only so a claim of it can be recognised and refused: nothing here assigns it.
export const CLASSES = Object.freeze(['incomplete', 'synthetic', 'genuine-unqualified', 'qualified']);
export const TOTAL_CAP = 12_000_000;
export const REJECTED_CAP = 340_000;
export const EVIDENCE_SCOPE = 'R2 causal-smoke page evidence; one page per process; observation-window association; silence is subscription-live; unchanged page reads summarized; physical quiescence unverified; no full-worker clearance.';
// Authentic runtime and hosted-run attestations are verified by S5b/S6, which do not exist yet. Until they do,
// any provenance claim fails closed to 'incomplete'; an absent claim is 'synthetic'.
export const ATTESTATION_UNAVAILABLE = 'authentic runtime and hosted-run attestation verification not implemented (S5b/S6)';

// R2 constants (capture.mjs:10,12, not exported) and the §8.2 cap formula inputs.
const ACK_MS = 1000, RECEIPT_SETTLE_MS = 1000;
const EVENT_BYTES = 262144, RECORD_OVERHEAD = 512, STATE_BYTES = 4096, STATE_CHANGES = 16;
// Lanes without a §8.2 formula get fixed S3 caps (reviewable choice, not from the design).
const FIXED = Object.freeze({events: 262144, intents: 262144, focus: 262144, acks: 262144, receipts: 262144, speech: 262144, axe: 524288});
const VISUAL_CAP = 500_000, MANIFEST_CAP = 1_000_000, DIGEST_FILE_CAP = 128, CLAIM_CAP = 65536;
export const LANES = Object.freeze(['events', 'intents', 'focus', 'page-reads', 'page', 'acks', 'receipts', 'speech', 'axe']);
export const ONE_TIME = Object.freeze(['page-rejected.json', 'capture.json', 'visual/pre.png', 'visual/post.png']);
const JSON_FILES = new Set(['page-rejected.json', 'capture.json']);
const laneFile = lane => `${lane}.jsonl`;
const ALLOWED = new Set([...LANES.map(laneFile), ...ONE_TIME]);
const DELTA_KEYS = ['kind', 'read', 'requested_at', 'returned_at', 'session', 'page_t', 'events_from', 'events_to', 'new_events',
  'active', 'title_ok', 'url_ok', 'state_same', 'state', 'state_sha256', 'header', 'prefix_sha256', 'page_reported_from',
  'page_reported_new', 'shift_prefix', 'decision', 'reason'].sort();
const UNCHANGED_KEYS = ['kind', 'reads', 'read_first', 'read_last', 'first_requested_at', 'last_returned_at', 'page_t_first', 'page_t_last'].sort();
const TASK_ID = /^[a-z][a-z0-9-]{0,63}$/;
// Page key, shift flag and intent VKs for each supported press (capture.mjs expectedKey; sendguard VK).
const PRESS = Object.freeze({Tab: {key: 'Tab', shift: false, vks: [VK.Tab]}, 'Shift+Tab': {key: 'Tab', shift: true, vks: [VK.Shift, VK.Tab]},
  Enter: {key: 'Enter', shift: false, vks: [VK.Enter]}, Space: {key: ' ', shift: false, vks: [VK.Space]}});
if (JSON.stringify(Object.keys(PRESS).sort()) !== JSON.stringify([...SUPPORTED_PRESS].sort())) throw Error('r2 evidence: press table differs from SUPPORTED_PRESS');
// captureJourney record statuses: its problem() statuses plus the two success statuses.
const SUCCESS = new Set(['speech', 'observed-silence']);
const CAPTURE_STATUS = new Set([...SUCCESS, 'incomplete', 'failed', 'ambiguous', 'missing', 'disconnected']);

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0;
// Same canonical form as page-journal.mjs and page-source.mjs, so recomputed hashes compare like for like.
const canonical = value => JSON.stringify(value, (k, v) => object(v) ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw Error(message); };
const int = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const time = v => Number.isFinite(v) && v >= 0;
const sameKeys = (value, keys) => JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys);

// JSON serialization that refuses what JSON.stringify would silently drop or coerce (undefined, functions,
// symbols, non-finite numbers, class instances, cycles) and stops before building more than `limit` bytes.
// For accepted input the output equals JSON.stringify(value).
export function encodeBounded(value, limit) {
  if (!int(limit, 0, Number.MAX_SAFE_INTEGER)) fail('invalid encode limit');
  const parts = [], stack = new Set();
  let size = 0;
  const push = s => { size += Buffer.byteLength(s); if (size > limit) fail(`record exceeds ${limit} bytes`); parts.push(s); };
  const walk = (v, depth) => {
    if (depth > 64) fail('record nesting cap');
    if (v === null) return push('null');
    if (typeof v === 'string') { if (v.length + 2 > limit - size) fail(`record exceeds ${limit} bytes`); return push(JSON.stringify(v)); }
    if (typeof v === 'boolean') return push(v ? 'true' : 'false');
    if (typeof v === 'number') { if (!Number.isFinite(v)) fail('record has a non-finite number'); return push(JSON.stringify(v)); }
    if (typeof v !== 'object') fail(`record has a non-JSON ${typeof v}`);
    if (stack.has(v)) fail('record is cyclic');
    const array = Array.isArray(v);
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(v))) fail('record has a non-plain object');
    if (Object.getOwnPropertySymbols(v).length) fail('record has symbol keys');
    stack.add(v);
    if (array) {
      push('[');
      for (let i = 0; i < v.length; i++) { if (i) push(','); if (v[i] === undefined) fail('record has an undefined array entry'); walk(v[i], depth + 1); }
      push(']');
    } else {
      push('{');
      let first = true;
      for (const key of Object.keys(v)) {
        if (v[key] === undefined) fail(`record field ${JSON.stringify(key)} is undefined`);
        if (!first) push(','); first = false;
        push(JSON.stringify(key)); push(':'); walk(v[key], depth + 1);
      }
      push('}');
    }
    stack.delete(v);
  };
  walk(value, 0);
  return parts.join('');
}

/** §8.2 caps from the run spec. Refuses, before any input, a plan whose worst-case evidence exceeds TOTAL_CAP. */
export function planR2EvidenceCaps(spec) {
  if (!object(spec) || !sameKeys(spec, ['ackMs', 'actions', 'observationMs', 'pollMs', 'timeoutMs'])) fail('evidence spec must be exactly {actions, ackMs, timeoutMs, observationMs, pollMs}');
  const {actions, ackMs, timeoutMs, observationMs, pollMs} = spec;
  if (!int(actions, 1, 1000)) fail('evidence spec: actions must be 1..1000');
  if (ackMs !== ACK_MS) fail(`evidence spec: ackMs must be the frozen ${ACK_MS}`);
  for (const [name, v] of Object.entries({timeoutMs, observationMs})) if (!int(v, 1, 600000)) fail(`evidence spec: ${name} must be 1..600000`);
  if (!int(pollMs, 1, 60000)) fail('evidence spec: pollMs must be 1..60000');
  const max_reads = actions * (Math.ceil(ackMs / 10) + 2 + Math.ceil((timeoutMs + RECEIPT_SETTLE_MS + observationMs) / pollMs) + 4) + 8;
  const files = {
    ...Object.fromEntries(Object.entries(FIXED).map(([lane, cap]) => [laneFile(lane), cap])),
    'page-reads.jsonl': EVENT_BYTES + max_reads * RECORD_OVERHEAD + STATE_CHANGES * STATE_BYTES,
    'page.jsonl': max_reads * 256,
    'capture.json': max_reads * 4608,
    'page-rejected.json': REJECTED_CAP,
    'visual/pre.png': VISUAL_CAP, 'visual/post.png': VISUAL_CAP,
  };
  const worst_case = Object.values(files).reduce((a, b) => a + b, 0);
  if (worst_case > TOTAL_CAP) fail(`evidence budget ${worst_case} bytes exceeds the ${TOTAL_CAP}-byte page cap`);
  return {max_reads, state_changes: STATE_CHANGES, files: Object.fromEntries(Object.keys(files).sort().map(k => [k, files[k]])), total: TOTAL_CAP, worst_case};
}

/** tabwise-r2-step-map/1 (§2.4): action[i] = 'a'+(i+1) for the approved task list in manifest order. */
export function buildR2StepMap(task) {
  if (!Array.isArray(task) || !task.length || task.length > 1000) fail('step map: task list must have 1..1000 entries');
  const actions = task.map((t, i) => {
    if (!object(t) || !TASK_ID.test(t.step ?? '') || !SUPPORTED_PRESS.includes(t.press)) fail(`step map: invalid task at index ${i}`);
    return {action: `a${i + 1}`, task: t.step, press: t.press};
  });
  if (new Set(actions.map(a => a.task)).size !== actions.length) fail('step map: duplicate task id');
  return {version: STEP_MAP_VERSION, actions};
}

/** title-nonce-suffix/1 (§2.2): exactly one non-empty <title>, rewritten as "<title> <nonce>" in the served copy. */
export function applyTitleNonce(fixture, nonce) {
  if (!(fixture instanceof Uint8Array) || fixture.length > 100000) fail('transform: fixture must be bytes within the 100000-byte document cap');
  if (typeof nonce !== 'string' || !/^[0-9a-f]{8}$/.test(nonce)) fail('transform: nonce must be 8 lowercase hex characters');
  const normalized = textOf(Buffer.from(fixture)), matches = [...normalized.matchAll(/<title>([^<]+)<\/title>/gi)];
  if (matches.length !== 1) fail(`transform: expected exactly one <title>, found ${matches.length}`);
  const [match] = matches, original_title = match[1];
  if (!original_title.trim()) fail('transform: empty title');
  const served = normalized.slice(0, match.index) + `<title>${original_title} ${nonce}</title>` + normalized.slice(match.index + match[0].length);
  return {served, record: {transform: TRANSFORM, fixture_sha256: pageHash(Buffer.from(fixture)), served_sha256: sha256(Buffer.from(served, 'utf8')),
    original_title, nonce, match_offset: match.index}};
}

function pageIdentity(page) {
  if (!object(page) || !sameKeys(page, ['fixture_id', 'port', 'session'])) fail('page identity must be exactly {fixture_id, session, port}');
  if (!TASK_ID.test(page.fixture_id ?? '')) fail('page identity: invalid fixture_id');
  if (!text(page.session) || page.session.length > 128) fail('page identity: invalid session');
  if (!int(page.port, 1024, 65535)) fail('page identity: invalid port');
  return {fixture_id: page.fixture_id, session: page.session, url: `http://127.0.0.1:${page.port}/index.html`};
}

function prepare({page, fixture, approved, nonce, spec}) {
  if (!object(approved) || !/^[0-9a-f]{64}$/.test(approved.fixture_sha256 ?? '')) fail('approved fixture hash missing');
  const step_map = buildR2StepMap(approved.task);
  const caps = planR2EvidenceCaps(spec);
  if (spec.actions !== step_map.actions.length) fail('evidence spec: actions differs from the step map');
  const identity = pageIdentity(page), {served, record: transform} = applyTitleNonce(fixture, nonce);
  if (transform.fixture_sha256 !== approved.fixture_sha256) fail('fixture hash differs from the approved manifest');
  return {identity, step_map, transform, caps, spec: {...spec}, served};
}
const beginRecord = ({identity, step_map, transform, caps, spec}) => ({phase: 'evidence-begin', schema: PAGE_SCHEMA, page: identity, step_map, transform, spec, caps});

/**
 * createR2EvidenceWriter({enabled:true, dir, page:{fixture_id, session, port}, fixture, approved:{fixture_sha256, task},
 *   nonce, spec}) -> frozen {append(lane, record), put(name, data), seal(options), failure(), identity}.
 * Every check (caps, step map, fixture hash, transform) runs before any filesystem effect. The directory is
 * created exclusively and the evidence-begin record is the first events entry. append/put are synchronous and
 * compatible with page-source.mjs (append, put) and page-journal.mjs (append 'page'). Any failure latches.
 */
export function createR2EvidenceWriter(options = {}) {
  if (options?.enabled !== true) fail('r2 evidence writer is disabled');
  const {dir} = options;
  if (!text(dir)) fail('evidence directory missing');
  const ctx = prepare(options);
  const fixture = Buffer.from(options.fixture), approved = structuredClone({fixture_sha256: options.approved.fixture_sha256, task: options.approved.task});
  const caps = ctx.caps.files, written = new Map();
  let total = 0, failure = null, sealed = false, stateChanges = 0, visualDir = false;
  mkdirSync(dirname(dir), {recursive: true});
  mkdirSync(dir);
  for (const lane of LANES) { writeFileSync(join(dir, laneFile(lane)), '', {flag: 'wx'}); written.set(laneFile(lane), {bytes: 0, hash: createHash('sha256')}); }
  const guard = fn => (...args) => {
    if (failure) throw failure;
    if (sealed) throw Error('r2 evidence: sealed');
    try { return fn(...args); } catch (error) { throw (failure = Error(/^r2 evidence:/.test(error.message) ? error.message : `r2 evidence: ${error.message}`)); }
  };
  const account = (name, bytes) => {
    const entry = written.get(name);
    if (entry.bytes + bytes > caps[name]) fail(`${name} cap ${caps[name]} bytes`);
    if (total + bytes > TOTAL_CAP) fail(`page total cap ${TOTAL_CAP} bytes`);
    return entry;
  };
  const appendLane = (lane, record) => {
    if (!LANES.includes(lane)) fail(`unknown lane ${JSON.stringify(lane)}`);
    const name = laneFile(lane), remaining = Math.min(caps[name] - written.get(name).bytes, TOTAL_CAP - total) - 1;
    if (!object(record)) fail(`${lane} record must be an object`);
    const line = encodeBounded(record, Math.max(0, remaining)) + '\n';
    if (lane === 'page-reads' && record.kind === 'read' && record.state !== null && record.state !== undefined && ++stateChanges > STATE_CHANGES) fail(`state change cap ${STATE_CHANGES}`);
    const bytes = Buffer.byteLength(line), entry = account(name, bytes);
    appendFileSync(join(dir, name), line);
    entry.bytes += bytes; entry.hash.update(line); total += bytes;
  };
  appendLane('events', beginRecord(ctx));
  const writer = {
    append: guard(appendLane),
    put: guard((name, data) => {
      if (!ONE_TIME.includes(name)) fail(`unknown evidence file ${JSON.stringify(name)}`);
      if (written.has(name)) fail(`${name} already written`);
      if (typeof data === 'string') { if (data.length > caps[name]) fail(`${name} cap ${caps[name]} bytes`); data = Buffer.from(data, 'utf8'); }
      else if (data instanceof Uint8Array) data = Buffer.from(data);
      else fail(`${name} data must be a string or bytes`);
      if (data.length > caps[name]) fail(`${name} cap ${caps[name]} bytes`);
      if (total + data.length > TOTAL_CAP) fail(`page total cap ${TOTAL_CAP} bytes`);
      if (JSON_FILES.has(name)) { try { JSON.parse(data.toString('utf8')); } catch { fail(`${name} is not JSON`); } }
      if (name.startsWith('visual/') && !visualDir) { mkdirSync(join(dir, 'visual')); visualDir = true; }
      written.set(name, {bytes: 0, hash: createHash('sha256')});
      writeFileSync(join(dir, name), data, {flag: 'wx'});
      const entry = written.get(name);
      entry.bytes = data.length; entry.hash.update(data); total += data.length;
    }),
    seal: async (sealOptions = {}) => {
      if (failure) throw failure;
      if (sealed) throw Error('r2 evidence: already sealed');
      try {
        if (!object(sealOptions)) fail('seal options must be an object');
        if ('class' in sealOptions) fail('the evidence class is recomputed, never supplied');
        if (!Object.keys(sealOptions).every(k => ['incomplete', 'provenance', 'source', 'runner'].includes(k))) fail('unknown seal option');
        const incomplete = sealOptions.incomplete ?? [];
        if (!Array.isArray(incomplete) || incomplete.length > 64 || incomplete.some(r => !text(r) || r.length > 512)) fail('incomplete reasons must be up to 64 non-empty strings');
        const claim = name => { const v = sealOptions[name] ?? null; if (v !== null && !object(v)) fail(`${name} must be an object or null`); return v === null ? null : JSON.parse(encodeBounded(v, CLAIM_CAP)); };
        const provenance = claim('provenance'), source = claim('source'), runner = claim('runner');
        // Files on disk must still be exactly what this writer wrote.
        const files = [...written.keys()].sort().map(path => {
          const entry = written.get(path), data = readCapped(dir, path, caps[path]);
          if (data.length !== entry.bytes || sha256(data) !== entry.hash.copy().digest('hex')) fail(`${path} changed on disk before seal`);
          return {path, bytes: data.length, sha256: sha256(data)};
        });
        const found = examineEvidence(loadFiles(dir, files.map(f => f.path), caps), ctx);
        const exam = await found;
        if (exam.errors.length) fail(`refusing to seal: ${exam.errors.join('; ')}`);
        const assessed = classify({errors: [], reasons: [...exam.reasons, ...incomplete], provenance});
        const manifest = {schema: PAGE_SCHEMA, class: assessed.class, page: ctx.identity, step_map: ctx.step_map, transform: ctx.transform,
          spec: ctx.spec, caps: ctx.caps, files, incomplete, provenance, authenticity: assessed.authenticity, source, runner, evidence_scope: EVIDENCE_SCOPE};
        const bytes = Buffer.from(JSON.stringify(JSON.parse(canonical(manifest)), null, 2) + '\n'), hash = sha256(bytes);
        if (bytes.length > MANIFEST_CAP) fail('manifest cap');
        sealed = true;
        writeFileSync(join(dir, 'manifest.json'), bytes, {flag: 'wx'});
        writeFileSync(join(dir, 'manifest.sha256'), `${hash}  manifest.json\n`, {flag: 'wx'});
        const verification = await verifyR2PageEvidence(dir, {fixture, approved});
        if (!verification.ok || verification.class !== manifest.class) fail(`sealed evidence does not verify: ${verification.errors.join('; ')}`);
        return {manifest: JSON.parse(bytes), manifest_sha256: hash, class: manifest.class, verification};
      } catch (error) { throw (failure = Error(/^r2 evidence:/.test(error.message) ? error.message : `r2 evidence: ${error.message}`)); }
    },
    failure: () => failure,
    identity: Object.freeze({...ctx.identity, title: `${ctx.transform.original_title} ${ctx.transform.nonce}`, served: ctx.served,
      step_map: structuredClone(ctx.step_map), transform: {...ctx.transform}, caps: structuredClone(ctx.caps)}),
  };
  return Object.freeze(writer);
}

function readCapped(dir, path, cap) {
  const stat = lstatSync(join(dir, path));
  if (!stat.isFile()) fail(`${path} is not a regular file`);
  if (stat.size > cap) fail(`${path} is ${stat.size} bytes, over its ${cap}-byte cap`);
  return readFileSync(join(dir, path));
}
function loadFiles(dir, paths, caps) {
  const data = {};
  for (const path of paths) data[path] = readCapped(dir, path, caps[path]);
  return data;
}
// Regular files only; the one permitted subdirectory is visual/. Symlinks and anything else are refused.
function listing(dir) {
  const out = [];
  const walk = (rel, depth) => {
    for (const entry of readdirSync(join(dir, rel), {withFileTypes: true})) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory() && depth === 0 && entry.name === 'visual') walk(path, 1);
      else if (entry.isFile()) out.push(path);
      else fail(`unexpected ${entry.isSymbolicLink() ? 'symlink' : 'directory or special file'} ${path}`);
    }
  };
  walk('', 0);
  return out.sort();
}
function parseJsonl(buffer, name) {
  const body = buffer.toString('utf8');
  if (!body) return [];
  if (!body.endsWith('\n')) fail(`${name} does not end with a newline (truncated record)`);
  return body.slice(0, -1).split('\n').map((line, i) => {
    let value;
    try { value = JSON.parse(line); } catch { fail(`${name} line ${i + 1} is not JSON`); }
    if (!object(value)) fail(`${name} line ${i + 1} is not an object`);
    return value;
  });
}
function parseJson(buffer, name) {
  try { return JSON.parse(buffer.toString('utf8')); } catch { fail(`${name} is not JSON`); }
}

function classify({errors, reasons, provenance}) {
  const authenticity = provenance === null ? {status: 'absent', reason: 'no authentic runtime claim: synthetic'} : {status: 'unverifiable', reason: ATTESTATION_UNAVAILABLE};
  if (errors.length || reasons.length) return {class: 'incomplete', authenticity};
  return {class: provenance === null ? 'synthetic' : 'incomplete', authenticity};
}

// ---- reconstruction (§8.2) ----
function checkAcceptedRaw(raw, fresh, ctx, n) {
  const where = `read ${n}`;
  if (raw.session !== ctx.identity.session) fail(`${where}: passed with a wrong session`);
  if (raw.title !== ctx.title || raw.url !== ctx.identity.url) fail(`${where}: passed with a served identity mismatch`);
  if (raw.network_restrictions !== true || raw.state_overflow !== false || raw.page_reported_overflow !== false) fail(`${where}: passed despite a restriction or overflow flag`);
  if (raw.complete !== true || raw.overflow !== false || raw.dropped !== 0 || raw.event_count !== raw.events.length || raw.clock !== 'page-monotonic-ms') fail(`${where}: passed an incomplete journal`);
  for (const e of fresh) {
    if (['keydown', 'focusin', 'focusout'].includes(e.type) && e.isTrusted !== true) fail(`${where}: passed an untrusted ${e.type} at seq ${e.seq}`);
    if (e.type === 'keydown' && (e.key === 'Control' || e.key === 'Insert')) fail(`${where}: passed a ${e.key} keydown at seq ${e.seq}`);
    if (e.type === 'app' && e.source !== 'page-authored') fail(`${where}: app event at seq ${e.seq} not labelled page-authored`);
  }
}

function reconstruct(records, ctx, rejected, errors) {
  const reads = [];
  let events = [], stateCanon = null, header = null, reported = null, lastNode = -Infinity, lastT = -Infinity;
  let refusedAt = null, rejectedUsed = false, stateChanges = 0, resets = 0, coalesced = 0, prefixes = [];
  for (const r of records) {
    if (refusedAt !== null) fail(`page-reads record after refused read ${refusedAt}`);
    if (r.kind === 'unchanged') {
      if (!reads.at(-1)?.raw || reads.at(-1).refused) fail('unchanged run without a preceding accepted read');
      if (!sameKeys(r, UNCHANGED_KEYS)) fail('unchanged record fields');
      if (!int(r.reads, 1, 1e6) || r.read_first !== reads.length + 1 || r.read_last !== r.read_first + r.reads - 1) fail(`unchanged run read numbers (expected first ${reads.length + 1})`);
      if (!time(r.first_requested_at) || !time(r.last_returned_at) || r.first_requested_at < lastNode || r.last_returned_at < r.first_requested_at) fail('unchanged run Node times');
      if (!time(r.page_t_first) || !time(r.page_t_last) || r.page_t_first < lastT || r.page_t_last < r.page_t_first) fail('unchanged run page times');
      const base = reads.at(-1).raw;
      for (let k = 0; k < r.reads; k++) reads.push({n: r.read_first + k, raw: {...structuredClone(base), t: k === r.reads - 1 ? r.page_t_last : r.page_t_first}, coalesced: true, tRange: [r.page_t_first, r.page_t_last]});
      coalesced += r.reads; lastNode = r.last_returned_at; lastT = r.page_t_last;
      continue;
    }
    if (r.kind !== 'read') fail('page-reads record kind');
    const n = r.read;
    if (n !== reads.length + 1) fail(`page-reads read ${n} out of sequence (expected ${reads.length + 1})`);
    if (!time(r.requested_at) || !time(r.returned_at) || r.requested_at < lastNode || r.returned_at < r.requested_at) fail(`read ${n}: Node times`);
    lastNode = r.returned_at;
    if (!['passed', 'refused'].includes(r.decision)) fail(`read ${n}: decision`);
    if (!('events_from' in r)) {
      if (r.decision !== 'refused' || !text(r.reason)) fail(`read ${n}: a read without a delta must be a refusal`);
      if ('rejected_file' in r) {
        if (!sameKeys(r, ['decision', 'kind', 'read', 'reason', 'rejected_file', 'rejected_sha256', 'requested_at', 'returned_at'])) fail(`read ${n}: refused record fields`);
        const raw = takeRejected(r, rejected, n);
        rejectedUsed = true;
        // A non-prefix rejection is only consistent if the stored raw really does not extend the accepted history.
        if (object(raw) && Array.isArray(raw.events) && raw.events.length >= events.length && events.every((e, i) => canonical(e) === canonical(raw.events[i]))) fail(`read ${n}: rejected read extends the history but its delta was not recorded`);
      } else {
        if (!sameKeys(r, ['decision', 'kind', 'read', 'reason', 'requested_at', 'returned_at']) || !/^evaluate failed: /.test(r.reason)) fail(`read ${n}: refused record without a delta or rejected payload`);
      }
      reads.push({n, refused: true, reason: r.reason});
      refusedAt = n;
      continue;
    }
    const refusal = r.decision === 'refused';
    if (!sameKeys(r, refusal ? [...DELTA_KEYS, 'rejected_file', 'rejected_sha256'].sort() : DELTA_KEYS)) fail(`read ${n}: delta record fields`);
    if (r.session !== ctx.identity.session && !refusal) fail(`read ${n}: session`);
    if (r.events_from !== events.length) fail(`read ${n}: events_from ${r.events_from} does not continue from ${events.length}`);
    if (!Array.isArray(r.new_events) || r.events_to !== r.events_from + r.new_events.length) fail(`read ${n}: events_to does not equal events_from + new events`);
    r.new_events.forEach((e, j) => { if (!object(e) || e.seq !== events.length + j + 1) fail(`read ${n}: event seq ${e?.seq} duplicated, missing or out of order (expected ${events.length + j + 1})`); });
    const nextEvents = [...events, ...r.new_events];
    if (r.prefix_sha256 !== sha256(canonical(nextEvents))) fail(`read ${n}: prefix hash does not recompute`);
    let state;
    if (r.state_same === true) {
      if (r.state !== null || stateCanon === null) fail(`read ${n}: state_same without a stored state`);
      state = JSON.parse(stateCanon);
    } else if (r.state_same === false) {
      if (canonical(r.state) === stateCanon) fail(`read ${n}: state_same false for an unchanged state`);
      state = r.state;
    } else fail(`read ${n}: state_same`);
    if (r.state_sha256 !== sha256(canonical(state))) fail(`read ${n}: state hash does not recompute`);
    const head = r.header === null ? header : r.header;
    if (!object(head) || (r.header !== null && canonical(r.header) === canonical(header))) fail(`read ${n}: header`);
    let value;
    if (r.page_reported_from === null) value = r.page_reported_new;
    else {
      if (!Array.isArray(r.page_reported_new) || !int(r.page_reported_from, 0, 1e6)) fail(`read ${n}: page-reported delta`);
      const before = Array.isArray(reported) ? reported : [];
      if (r.page_reported_from !== 0 && r.page_reported_from !== before.length) fail(`read ${n}: page_reported_from ${r.page_reported_from} is neither a continuation nor a reset`);
      if (r.page_reported_from === 0 && before.length && !refusal) resets++;
      value = [...before.slice(0, r.page_reported_from), ...r.page_reported_new];
    }
    const raw = {...head, session: r.session, t: r.page_t, active: r.active, state, events: nextEvents, page_reported: value};
    if (r.title_ok !== (raw.title === ctx.title) || r.url_ok !== (raw.url === ctx.identity.url)) fail(`read ${n}: title_ok/url_ok do not recompute`);
    if (!Array.isArray(r.shift_prefix)) fail(`read ${n}: shift_prefix`);
    if (refusal) {
      if (!text(r.reason) || r.shift_prefix.length) fail(`read ${n}: refused delta record`);
      const stored = takeRejected(r, rejected, n);
      rejectedUsed = true;
      if (canonical(stored) !== canonical(raw)) fail(`read ${n}: rejected payload differs from its delta record`);
      reads.push({n, refused: true, reason: r.reason, raw});
      refusedAt = n;
      continue;
    }
    if (r.reason !== null) fail(`read ${n}: passed with a reason`);
    if (!time(r.page_t)) fail(`read ${n}: page time`);
    checkAcceptedRaw(raw, r.new_events, ctx, n);
    // A DOM-derived state change needs runner-observed mutation evidence; a page-authored app event never suffices.
    if (r.state_same === false && stateCanon !== null && !r.new_events.some(e => e.type === 'mutation')) fail(`read ${n}: state changed without a runner-observed mutation event`);
    if (r.state_same === false) stateChanges++;
    prefixes.push(...r.shift_prefix);
    events = nextEvents; stateCanon = canonical(state); header = head; reported = value; lastT = Math.max(lastT, r.page_t);
    reads.push({n, raw, tRange: [r.page_t, r.page_t]});
  }
  if (rejected !== undefined && !rejectedUsed) fail('page-rejected.json is not referenced by a refused read');
  if (stateChanges > STATE_CHANGES) fail(`state changes ${stateChanges} over the ${STATE_CHANGES} cap`);
  return {reads, events, prefixes, stats: {reads: reads.length, coalesced_reads: coalesced, state_changes: stateChanges, page_reported_resets: resets, refused_read: refusedAt}};
}
function takeRejected(r, rejected, n) {
  if (r.rejected_file !== 'page-rejected.json') fail(`read ${n}: rejected_file`);
  if (rejected === undefined) fail(`read ${n}: rejected-read payload missing`);
  if (sha256(rejected) !== r.rejected_sha256) fail(`read ${n}: rejected-read payload digest`);
  return parseJson(rejected, 'page-rejected.json');
}

// Key accounting over the accepted history only (§4.3), independent of the page source's own verdicts. Shift
// invariants the page source enforces are errors here; a wrong or missing key is a physical outcome and only
// makes the evidence incomplete. Returns the per-action keydowns that matched the journey in order.
function checkKeys(events, prefixes, map, reasons) {
  const keydowns = events.filter(e => e.type === 'keydown'), main = [], expected = [];
  let diverged = false;
  keydowns.forEach((e, i) => {
    const action = map.actions[main.length];
    if (e.key === 'Shift') {
      const next = keydowns[i + 1];
      if (!diverged && action?.press !== 'Shift+Tab') fail(`accepted Shift keydown at seq ${e.seq} outside a Shift+Tab action`);
      if (next === undefined) reasons.push(`unresolved Shift at seq ${e.seq} at the end of the accepted history`);
      else if (!(next.key === 'Tab' && next.shift === true)) fail(`accepted Shift at seq ${e.seq} not followed by its shifted Tab`);
      return;
    }
    if (diverged) return;
    const want = action && PRESS[action.press];
    if (!want || e.key !== want.key || e.shift !== want.shift) {
      diverged = true;
      reasons.push(action ? `accepted keydown ${JSON.stringify(e.key)} (shift ${e.shift}) at seq ${e.seq} is not ${action.action} ${action.press}`
        : `accepted keydown ${JSON.stringify(e.key)} at seq ${e.seq} beyond the journey's ${map.actions.length} actions`);
      return;
    }
    if (action.press === 'Shift+Tab') expected.push({action: action.action, seq: e.seq, prefix: keydowns[i - 1]?.key === 'Shift' ? 'observed' : 'not-observed'});
    main.push(e);
  });
  // Action-specific Shift+Tab prefixes must recompute exactly (as far as the history follows the journey).
  if (canonical(diverged ? prefixes.slice(0, expected.length) : prefixes) !== canonical(expected)) fail('shift_prefix records do not recompute from the accepted history');
  if (!diverged && main.length < map.actions.length) reasons.push(`accepted history has keys for ${main.length} of ${map.actions.length} actions`);
  return main;
}

// The runner records one intent per action, in step-map order, with that press's exact VK sequence.
function checkIntents(intents, map, reasons) {
  intents.forEach((e, i) => {
    const action = map.actions[i];
    if (!action || !sameKeys(e, ['action', 'keys']) || e.action !== action.action) fail(`intent ${i + 1} does not follow the step map`);
    if (canonical(e.keys) !== canonical(PRESS[action.press].vks)) fail(`intent ${i + 1} keys ${JSON.stringify(e.keys)} are not the ${action.press} VKs`);
  });
  if (intents.length < map.actions.length) reasons.push(`intents cover ${intents.length} of ${map.actions.length} actions`);
}

// Replays the rebuilt reads through the merged adapter in the persisted view order and requires the persisted
// page lane to equal the replay exactly. Accepted snapshots are returned for the capture cross-check.
// A failed adapter call is sticky and reads nothing more, so entries after a failure consume no page read.
async function replayAdapter(reads, entries, reasons) {
  const out = [], snapshots = [];
  let k = 0;
  const journal = createPageJournal({
    source: {read: async () => {
      if (k >= reads.length) throw Error('no persisted page read for this adapter call');
      const r = reads[k++];
      if (r.refused) throw Error(`page source: ${r.reason}`);
      return structuredClone(r.raw);
    }},
    writer: {append: (lane, entry) => { out.push(structuredClone(entry)); }},
  });
  let accepted = 0;
  for (const [i, e] of entries.entries()) {
    if (!object(e) || e.phase !== 'r2-journal' || !['snapshot', 'keys'].includes(e.view)) fail(`page lane entry ${i + 1} shape`);
    try {
      const value = e.view === 'snapshot' ? await journal.snapshot() : await journal.keys(e.cursor);
      accepted++;
      if (e.view === 'snapshot') snapshots.push({cursor: value.events.length, session: value.session, active: value.active, state: canonical(value.state), tRange: reads[k - 1].tRange});
    } catch {}
  }
  if (k !== reads.length) fail(`adapter replay consumed ${k} of ${reads.length} page reads`);
  if (canonical(out) !== canonical(entries)) fail('page lane does not equal the adapter replay of the reconstructed reads');
  const refused = entries.filter(e => e.complete !== true);
  for (const e of refused) reasons.push(`adapter refusal: ${e.errors?.[0] ?? 'unknown'}`);
  return {snapshots, accepted};
}

// capture.json is the captureJourney result (src/r2/capture.mjs). A completed capture must be internally
// consistent with that contract and with the reconstructed page history; an incomplete one keeps its
// diagnostics and makes the evidence incomplete, but its structure is still checked.
function checkCapture(capture, ctx, snapshots, history, reasons) {
  if (!object(capture) || capture.schema !== 'r2-capture/1' || !Array.isArray(capture.records) || !Array.isArray(capture.raw) ||
    !Array.isArray(capture.unattributed) || !Array.isArray(capture.unattributed_page) || !Array.isArray(capture.reasons) ||
    typeof capture.completed !== 'boolean' || !['COMPLETE', 'INSUFFICIENT_EVIDENCE'].includes(capture.outcome)) fail('capture.json is not an r2-capture/1 result');
  if (capture.fixture_id !== ctx.identity.fixture_id) fail('capture fixture_id differs from the page identity');
  const actions = ctx.step_map.actions, records = capture.records, used = new Set();
  if (records.length > actions.length) fail('capture has more records than the step map');
  const match = (s, where) => {
    const k = snapshots.findIndex((a, j) => !used.has(j) && object(s) && (Number.isSafeInteger(s.cursor) ? s.cursor : s.events?.length) === a.cursor &&
      s.session === a.session && s.active === a.active && canonical(s.state) === a.state && s.t >= a.tRange[0] && s.t <= a.tRange[1]);
    if (k < 0) fail(`${where}: page sample at cursor ${s?.cursor} has no matching accepted page read`);
    used.add(k);
  };
  let lastSeq = null, samples = 0;
  records.forEach((r, i) => {
    const where = `capture record ${i + 1}`;
    if (!object(r) || r.seq !== i + 1 || r.step !== actions[i].action || r.press !== actions[i].press) fail(`${where} differs from step map action ${actions[i].action}`);
    if (!CAPTURE_STATUS.has(r.capture_status)) fail(`${where}: invalid capture_status ${JSON.stringify(r.capture_status)}`);
    if (!object(r.page) || !Array.isArray(r.page.samples) || !Array.isArray(r.page.events) || !Array.isArray(r.reasons) || !Array.isArray(r.raw_seq) ||
      !object(r.execution) || !object(r.node_window)) fail(`${where}: not a captureJourney record`);
    const success = SUCCESS.has(r.capture_status);
    if (!success && i !== records.length - 1) fail(`${where}: ${r.capture_status} record followed by a later action`);
    r.page.samples.forEach(s => { match(s, where); samples++; });
    if (success && r.page.samples.length < 2) fail(`${where}: missing page samples for a ${r.capture_status} record`);
    const first = r.page.samples[0], last = r.page.samples.at(-1);
    if (canonical(r.page.before) !== canonical(first ?? null) || canonical(r.page.after) !== canonical(last ?? null)) fail(`${where}: page before/after are not its first/last samples`);
    // Page events the capture attributed must be the reconstructed history, contiguous, inside the record's own reads.
    for (const e of r.page.events) {
      if (canonical(e) !== canonical(history[e?.seq - 1])) fail(`${where} page event seq ${e?.seq} differs from the reconstructed history`);
      if ((lastSeq !== null && e.seq !== lastSeq + 1) || !first || e.seq <= first.cursor || e.seq > last.cursor) fail(`${where}: page event seq ${e.seq} is not associated with this action's page reads`);
      lastSeq = e.seq;
    }
    const keydowns = r.page.events.filter(e => e.type === 'keydown');
    if (r.ack_seq !== null && !keydowns.some(e => e.seq === r.ack_seq)) fail(`${where}: ack_seq ${r.ack_seq} is not one of its keydowns`);
    if (!r.raw_seq.every(seq => capture.raw.some(p => p?.seq === seq))) fail(`${where}: raw_seq names speech not in capture.raw`);
    if (!success) return;
    const want = PRESS[r.press], keyErrors = judgeKeys(keydowns, {key: want.key, shift: want.shift});
    if (r.reasons.length || 'invalidated' in r || r.association !== 'observation-window-only') fail(`${where}: ${r.capture_status} record with reasons, invalidation or another association`);
    if (r.execution.started !== true || r.execution.settled !== true || r.execution.cancellation_requested !== false) fail(`${where}: execution not started and settled`);
    if (keyErrors.length) fail(`${where}: page keys do not acknowledge ${r.press}: ${keyErrors.join('; ')}`);
    if (!Number.isSafeInteger(r.ack_seq) || r.ack_seq !== keydowns.find(e => e.key === want.key).seq) fail(`${where}: ack_seq ${r.ack_seq} is not the acknowledging keydown`);
    if (r.capture_status === 'speech' ? !r.raw_seq.length || 'silence' in r : r.raw_seq.length || r.silence?.transport_live !== true) fail(`${where}: ${r.capture_status} does not match its speech and silence fields`);
    if (r.text !== capture.raw.filter(p => r.raw_seq.includes(p.seq)).map(p => p.text).join('\n')) fail(`${where}: text is not its raw_seq speech`);
  });
  for (const u of capture.unattributed_page) { match(u?.snapshot, 'unattributed page'); samples++; }
  if (capture.completed) {
    if (capture.outcome !== 'COMPLETE' || records.length !== actions.length || records.some(r => !SUCCESS.has(r.capture_status)) || capture.reasons.length ||
      'gate_stop' in capture || capture.unattributed.length || capture.unattributed_page.length) fail('capture claims completed but is not a complete captureJourney result');
    // Every accepted snapshot read is a record sample except the final boundary read, which carries no delta.
    if (used.size !== snapshots.length - 1) fail(`completed capture holds ${used.size} page samples for ${snapshots.length} accepted reads (expected one unrecorded boundary read)`);
  } else {
    if (capture.outcome !== 'INSUFFICIENT_EVIDENCE') fail('incomplete capture with a COMPLETE outcome');
    reasons.push(`capture not completed: ${capture.reasons[0] ?? 'no reason recorded'}`);
  }
  if (records.length < actions.length) reasons.push(`capture covers ${records.length} of ${actions.length} actions`);
  return {records: records.length, samples, completed: capture.completed};
}

async function examineEvidence(files, ctxIn) {
  const errors = [], reasons = [];
  const ctx = {...ctxIn, title: `${ctxIn.transform.original_title} ${ctxIn.transform.nonce}`};
  let report = null;
  try {
    const lanes = Object.fromEntries(LANES.map(lane => {
      if (!(laneFile(lane) in files)) fail(`lane ${lane} missing`);
      return [lane, parseJsonl(files[laneFile(lane)], laneFile(lane))];
    }));
    const begins = lanes.events.filter(e => e.phase === 'evidence-begin');
    if (begins.length !== 1 || canonical(lanes.events[0]) !== canonical(beginRecord(ctx))) fail('events lane does not open with the recorded evidence-begin identity');
    for (const e of lanes.events) if (e.phase === 'refusal') reasons.push(`session refusal: ${e.reason ?? 'unspecified'}`);
    checkIntents(lanes.intents, ctx.step_map, reasons);
    const built = reconstruct(lanes['page-reads'], ctx, files['page-rejected.json'], errors);
    if (built.stats.refused_read !== null) reasons.push(`page source refused read ${built.stats.refused_read}: ${built.reads.at(-1).reason}`);
    checkKeys(built.events, built.prefixes, ctx.step_map, reasons);
    const replay = await replayAdapter(built.reads, lanes.page, reasons);
    // The synthetic class requires complete evidence: page observations and a capture of every action.
    if (!replay.snapshots.length) reasons.push('no accepted page observations');
    let capture = null;
    if ('capture.json' in files) capture = checkCapture(parseJson(files['capture.json'], 'capture.json'), ctx, replay.snapshots, built.events, reasons);
    else reasons.push('capture.json missing: no action observations');
    const runner_observed = built.events.filter(e => e.type !== 'app').length;
    report = {...built.stats, events: built.events.length, runner_observed, page_authored: built.events.length - runner_observed,
      adapter_accepted: replay.accepted, capture, shift_prefix: built.prefixes};
  } catch (error) { errors.push(error.message); }
  return {errors, reasons, report};
}

/**
 * verifyR2PageEvidence(dir, {fixture, approved:{fixture_sha256, task}}) -> {ok, class, manifest_class, errors, reasons,
 * reconstruction}. Reads only from disk plus the supplied original fixture bytes and approved task list. Any
 * integrity or reconstruction error gives class 'incomplete' and ok:false; ok also requires the manifest class
 * to equal the recomputed one. An unsealed directory is 'incomplete' and is never repaired.
 */
export async function verifyR2PageEvidence(dir, {fixture, approved} = {}) {
  const errors = [];
  let manifest = null, exam = {errors: [], reasons: [], report: null};
  try {
    const present = listing(dir);
    if (!present.includes('manifest.json') || !present.includes('manifest.sha256')) fail('unsealed evidence directory (manifest.json or manifest.sha256 missing)');
    const bytes = readCapped(dir, 'manifest.json', MANIFEST_CAP);
    if (readCapped(dir, 'manifest.sha256', DIGEST_FILE_CAP).toString('utf8') !== `${sha256(bytes)}  manifest.json\n`) fail('manifest digest');
    manifest = parseJson(bytes, 'manifest.json');
    if (!object(manifest) || manifest.schema !== PAGE_SCHEMA || !sameKeys(manifest, ['authenticity', 'caps', 'class', 'evidence_scope', 'files', 'incomplete',
      'page', 'provenance', 'runner', 'schema', 'source', 'spec', 'step_map', 'transform'])) fail('manifest schema or fields');
    if (manifest.class === 'qualified') fail('qualified is never assigned by the runner');
    if (!CLASSES.includes(manifest.class)) fail('manifest class unknown');
    if (manifest.evidence_scope !== EVIDENCE_SCOPE) fail('evidence scope');
    if (!object(manifest.page) || !object(manifest.spec) || !object(manifest.transform)) fail('manifest identity fields');
    const port = Number(/^http:\/\/127\.0\.0\.1:(\d+)\/index\.html$/.exec(manifest.page.url)?.[1]);
    const ctx = prepare({page: {fixture_id: manifest.page.fixture_id, session: manifest.page.session, port}, fixture, approved, nonce: manifest.transform.nonce, spec: manifest.spec});
    if (canonical(ctx.identity) !== canonical(manifest.page)) fail('page identity does not recompute');
    if (canonical(ctx.step_map) !== canonical(manifest.step_map)) fail('step map differs from the approved task list');
    if (canonical(ctx.transform) !== canonical(manifest.transform)) fail('served-title transformation does not reproduce from the fixture bytes');
    if (canonical(ctx.caps) !== canonical(manifest.caps)) fail('caps do not recompute from the spec');
    if (!Array.isArray(manifest.incomplete) || manifest.incomplete.some(r => !text(r))) fail('manifest incomplete reasons');
    if (manifest.provenance !== null && !object(manifest.provenance)) fail('manifest provenance');
    if (!Array.isArray(manifest.files)) fail('manifest files');
    const paths = manifest.files.map(f => f?.path);
    if (paths.some(p => !ALLOWED.has(p))) fail(`manifest names a file outside the allowlist: ${paths.find(p => !ALLOWED.has(p))}`);
    if (new Set(paths).size !== paths.length) fail('manifest lists a file twice');
    if (JSON.stringify(paths) !== JSON.stringify([...paths].sort())) fail('manifest files not sorted');
    for (const lane of LANES) if (!paths.includes(laneFile(lane))) fail(`manifest omits lane ${lane}`);
    const expected = [...paths, 'manifest.json', 'manifest.sha256'].sort();
    const extra = present.filter(p => !expected.includes(p)), missing = expected.filter(p => !present.includes(p));
    if (extra.length) fail(`unexpected evidence file ${extra.join(', ')}`);
    if (missing.length) fail(`missing evidence file ${missing.join(', ')}`);
    let total = 0;
    const files = {};
    for (const f of manifest.files) {
      if (!sameKeys(f, ['bytes', 'path', 'sha256'])) fail(`manifest file entry ${f.path}`);
      const data = readCapped(dir, f.path, ctx.caps.files[f.path]);
      if (data.length !== f.bytes || sha256(data) !== f.sha256) fail(`file integrity: ${f.path}`);
      total += data.length; files[f.path] = data;
    }
    if (total > TOTAL_CAP) fail(`page total ${total} bytes over the ${TOTAL_CAP}-byte cap`);
    exam = await examineEvidence(files, ctx);
    errors.push(...exam.errors);
    const assessed = classify({errors, reasons: [...exam.reasons, ...manifest.incomplete], provenance: manifest.provenance});
    if (canonical(assessed.authenticity) !== canonical(manifest.authenticity)) errors.push('authenticity record does not recompute');
    if (!errors.length && manifest.class !== assessed.class) errors.push(`manifest class ${manifest.class} differs from the recomputed class ${assessed.class}`);
  } catch (error) { errors.push(error.message); }
  const assessed = classify({errors, reasons: [...exam.reasons, ...(manifest?.incomplete ?? [])], provenance: manifest?.provenance ?? null});
  return {ok: errors.length === 0, class: assessed.class, manifest_class: manifest?.class ?? null, errors, reasons: exam.reasons, reconstruction: exam.report};
}

// ---- run level (§8.5) ----
const minClass = classes => classes.reduce((a, c) => CLASSES.indexOf(c) < CLASSES.indexOf(a) ? c : a, 'genuine-unqualified');
function runPlan(plan) {
  if (!object(plan) || !Array.isArray(plan.pages) || !plan.pages.length || plan.pages.length > 64) fail('run plan must list 1..64 pages');
  const order = plan.pages.map(p => p?.id);
  if (order.some(id => !TASK_ID.test(id ?? '')) || new Set(order).size !== order.length) fail('run plan page ids invalid or duplicated');
  return {order, plan_sha256: sha256(encodeBounded(JSON.parse(canonical(plan)), CLAIM_CAP))};
}
async function assessRun(runDir, {plan, pages, inputs}) {
  const {order, plan_sha256} = runPlan(plan);
  if (!Array.isArray(pages) || !pages.length || pages.length > order.length) fail('run pages must be a non-empty prefix of the plan order');
  const entries = [];
  for (const [i, p] of pages.entries()) {
    if (!object(p) || p.id !== order[i] || !Number.isSafeInteger(p.exit_code)) fail(`run page ${i + 1} does not follow the plan order`);
    if (p.exit_code !== 0 && i !== pages.length - 1) fail(`page ${p.id} exited ${p.exit_code} but a later page started`);
    const verdict = await verifyR2PageEvidence(join(runDir, p.id), inputs?.[p.id] ?? {});
    let digest = null;
    try { digest = readCapped(join(runDir, p.id), 'manifest.sha256', DIGEST_FILE_CAP).toString('utf8').slice(0, 64); } catch {}
    entries.push({id: p.id, dir: p.id, manifest_sha256: verdict.ok ? digest : null, exit_code: p.exit_code,
      class: p.exit_code === 0 && verdict.ok ? verdict.class : 'incomplete'});
  }
  const short = pages.length < order.length;
  return {schema: RUN_SCHEMA, plan_sha256, order, pages: entries, run_class: short ? 'incomplete' : minClass(entries.map(e => e.class)),
    ...(short ? {stopped_after: pages.at(-1).id} : {})};
}

/** sealR2Run(runDir, {enabled:true, plan:{pages:[{id}...]}, pages:[{id, exit_code}], inputs:{[id]:{fixture, approved}}}). */
export async function sealR2Run(runDir, {enabled, plan, pages, inputs} = {}) {
  if (enabled !== true) fail('r2 run evidence is disabled');
  const extra = readdirSync(runDir).filter(name => !(pages ?? []).some(p => p?.id === name));
  if (extra.length) fail(`unexpected run entry ${extra.join(', ')}`);
  const manifest = await assessRun(runDir, {plan, pages, inputs});
  const bytes = Buffer.from(JSON.stringify(JSON.parse(canonical(manifest)), null, 2) + '\n'), hash = sha256(bytes);
  writeFileSync(join(runDir, 'run-manifest.json'), bytes, {flag: 'wx'});
  writeFileSync(join(runDir, 'run-manifest.sha256'), `${hash}  run-manifest.json\n`, {flag: 'wx'});
  return {manifest, manifest_sha256: hash};
}

/** verifyR2Run(runDir, {plan, inputs}) recomputes every page verdict and the run manifest. Exit codes are as recorded.
 *  Returns {ok, run_class, errors, manifest, manifest_sha256}. */
export async function verifyR2Run(runDir, {plan, inputs} = {}) {
  const errors = [];
  let manifest = null, recomputed = null, bytes = null;
  try {
    bytes = readCapped(runDir, 'run-manifest.json', MANIFEST_CAP);
    if (readCapped(runDir, 'run-manifest.sha256', DIGEST_FILE_CAP).toString('utf8') !== `${sha256(bytes)}  run-manifest.json\n`) fail('run manifest digest');
    manifest = parseJson(bytes, 'run-manifest.json');
    if (!object(manifest) || manifest.schema !== RUN_SCHEMA || !Array.isArray(manifest.pages)) fail('run manifest schema');
    const names = readdirSync(runDir).sort(), expected = [...manifest.pages.map(p => p?.dir), 'run-manifest.json', 'run-manifest.sha256'].sort();
    if (JSON.stringify(names) !== JSON.stringify(expected)) fail('run directory coverage');
    recomputed = await assessRun(runDir, {plan, pages: manifest.pages.map(p => ({id: p?.id, exit_code: p?.exit_code})), inputs});
    if (canonical(recomputed) !== canonical(manifest)) fail('run manifest does not recompute');
  } catch (error) { errors.push(error.message); }
  // manifest_sha256 is the digest of the exact bytes verified here (S7 attests it), and null whenever verification refused.
  return {ok: errors.length === 0, run_class: errors.length ? 'incomplete' : recomputed.run_class, errors, manifest, manifest_sha256: errors.length ? null : sha256(bytes)};
}
