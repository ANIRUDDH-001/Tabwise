// R2 O-11 (A-4): C-3 arm-input custody (S5b/S6 handoff §10 option A; D-89). Offline only: no model call, network,
// browser, NVDA, child process or physical input. Arm inputs are derived after the run is sealed, from evidence that
// verifyR2Run and openVerifiedR2SpeechEvidence verify independently, into a separately sealed sibling directory. The
// run and page directories are only read, so the S3 seals and verifyR2Run's exact coverage are unchanged.
//
// Custody is recomputation. verifyR2ArmInputs rebuilds every byte from the sealed run and compares manifest.json and
// every payload file byte for byte, so a stored record is never parsed for a decision and cannot add eligibility.
// The only route to an eligible page is buildR2SpeechPayload over a verified handle, which requires the S3
// genuine-unqualified class. S3 cannot assign that class before an authentic runtime attestation exists, so today every
// page is refused and the correct output is a verified refusal-only manifest with no payload file.
//
// Not recorded: a plaintext nonce, a nonce digest or commitment (O-12 finding 3; nonce-redact/2 records offsets only),
// any evidence class or qualification verdict, and any permission to send a payload to a model.
import {lstatSync, mkdirSync, opendirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {basename, dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {createHash, randomBytes} from 'node:crypto';
import {openVerifiedR2SpeechEvidence, buildR2SpeechPayload, redactNonce, BUILDER_VERSION, ARM_INPUT_SCHEMA, REDACTION_VERSION} from './speech-payload.mjs';
import {verifyR2Run} from '../../scripts/tabwise/r2-evidence.mjs';
import {r2Digest} from '../../scripts/tabwise/r2-policy.mjs';

export const ARM_INPUTS_SCHEMA = 'tabwise-r2-arm-inputs/1';
// Model-facing fixture ids are opaque: derived from the verified run-manifest digest and the page id, never the page id.
export const BLINDING = 'tabwise-r2-blind/1';
export const WITHHELD = 'reason withheld: it carries run-nonce characters';

const PAGE_ID = /^[a-z][a-z0-9-]{0,63}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_PAGES = 64, MAX_ENTRIES = MAX_PAGES + 2, MAX_REASONS = 8, REASON_CAP = 512;
const MANIFEST_CAP = 1_000_000, DIGEST_CAP = 128, PAYLOAD_CAP = 12_000_000, PAGE_MANIFEST_CAP = 1_000_000;

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => JSON.stringify(value, (k, v) => object(v) ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw Error(`arm inputs: ${message}`); };
const message = error => error?.message ?? String(error);

/** Opaque, deterministic model-facing fixture id for one page of one verified run. */
export function blindFixtureId(runManifestSha256, id) {
  if (!SHA256.test(runManifestSha256 ?? '') || !PAGE_ID.test(id ?? '')) fail('blinding needs a run-manifest digest and a page id');
  return `f-${sha256(`${BLINDING}\0${runManifestSha256}\0${id}`).slice(0, 16)}`;
}

/** payload-<id>.json: a fixed prefix, so a page id is never a bare Windows device name (con, nul, aux, com1...). */
export function payloadFileName(id) {
  if (typeof id !== 'string' || !PAGE_ID.test(id)) fail('payload file needs a plan page id');
  return `payload-${id}.json`;
}

// Bounded reasons; a reason holding the nonce or any 4-character run of it is replaced, never stored.
function boundReasons(reasons, nonce) {
  return reasons.slice(0, MAX_REASONS).map(r => {
    let text = String(r);
    if (text.length > REASON_CAP) text = `${text.slice(0, REASON_CAP - 12)} [truncated]`;
    if (nonce === null) return text;
    const scan = redactNonce([{seq: 1, text}], nonce);
    return scan.ok && scan.redaction.edits.length === 0 ? text : WITHHELD;
  });
}

/**
 * armInputPageRecord({id, page_manifest_sha256, nonce, result}) -> {record, payload:Buffer|null}. Pure formatter of one
 * manifest entry from a buildR2SpeechPayload result. It grants nothing: verifyR2ArmInputs never accepts a record it did
 * not recompute itself. Throws when eligibility, payload, digest and redaction disagree.
 */
export function armInputPageRecord({id, page_manifest_sha256, nonce = null, result}) {
  payloadFileName(id);
  if (page_manifest_sha256 !== null && !SHA256.test(page_manifest_sha256 ?? '')) fail(`page ${id} manifest digest`);
  if (!object(result) || typeof result.model_eligible !== 'boolean' || !Array.isArray(result.reasons) || !object(result.arm_input)) fail(`page ${id} result shape`);
  if (!result.model_eligible) {
    if (result.payload !== null || result.arm_input.payload_sha256 !== null || result.arm_input.redaction !== null) fail(`page ${id} refused but carries a payload`);
    if (!result.reasons.length) fail(`page ${id} refused without a reason`);
    return {record: {id, page_manifest_sha256, model_eligible: false, reasons: boundReasons(result.reasons, nonce), payload_file: null, payload_sha256: null, redaction: null}, payload: null};
  }
  if (result.reasons.length) fail(`page ${id} eligible with reasons`);
  if (!object(result.payload)) fail(`page ${id} eligible without a payload`);
  const bytes = Buffer.from(canonical(result.payload), 'utf8');
  if (bytes.length > PAYLOAD_CAP) fail(`page ${id} payload over its cap`);
  if (sha256(bytes) !== result.arm_input.payload_sha256) fail(`page ${id} payload digest does not match the builder`);
  const red = result.arm_input.redaction;
  if (!object(red) || red.version !== REDACTION_VERSION || !Array.isArray(red.edits)) fail(`page ${id} redaction is not ${REDACTION_VERSION}`);
  return {record: {id, page_manifest_sha256, model_eligible: true, reasons: [], payload_file: payloadFileName(id), payload_sha256: sha256(bytes),
    redaction: {version: REDACTION_VERSION, edits: red.edits.length}}, payload: bytes};
}

// Windows folds case; a path equal to or below base is inside it.
function inside(base, target) {
  const fold = p => process.platform === 'win32' ? p.toLowerCase() : p;
  const rel = relative(fold(base), fold(target));
  return !rel || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel));
}
function realRun(runDir) {
  if (typeof runDir !== 'string' || !isAbsolute(runDir) || runDir.includes('\0')) fail('run directory must be an absolute path');
  try {
    const stat = lstatSync(runDir);
    if (!stat.isDirectory()) throw Error('not a directory (links are refused)');
    return realpathSync.native(runDir);
  } catch (error) { return fail(`run directory unavailable: ${error.code ?? message(error)}`); }
}
// The output's real location: its parent must exist; the output must be outside the run and must not contain it.
function placement(runDir, outDir, {exists}) {
  if (typeof outDir !== 'string' || !isAbsolute(outDir) || outDir.includes('\0')) fail('output must be an absolute path');
  const run = realRun(runDir), out = resolve(outDir);
  let real;
  if (exists) {
    let stat;
    try { stat = lstatSync(out); } catch (error) { return fail(`arm-input output is not a directory: ${error.code ?? message(error)}`); }
    if (!stat.isDirectory()) fail('arm-input output is not a directory (links are refused)');
    real = realpathSync.native(out);
  } else {
    let parent;
    try { parent = realpathSync.native(dirname(out)); if (!lstatSync(parent).isDirectory()) throw Error('not a directory'); }
    catch (error) { return fail(`output parent unavailable: ${error.code ?? message(error)}`); }
    real = join(parent, basename(out));
  }
  if (inside(run, out) || inside(run, real)) fail('output is inside the run directory');
  if (inside(out, run) || inside(real, run)) fail('output contains the run directory');
  return real;
}
// Regular files only, at most MAX_ENTRIES, read without following links.
function listing(dir) {
  const names = [];
  const handle = opendirSync(dir);
  try {
    for (let entry = handle.readSync(); entry !== null; entry = handle.readSync()) {
      if (names.length === MAX_ENTRIES) fail(`more than ${MAX_ENTRIES} arm-input entries`);
      if (!entry.isFile()) fail(`arm-input entry ${entry.name} is not a regular file`);
      names.push(entry.name);
    }
  } finally { handle.closeSync(); }
  return names.sort();
}
function readCapped(dir, name, cap) {
  let stat;
  try { stat = lstatSync(join(dir, name)); } catch (error) { return fail(`missing ${name} (${error.code ?? message(error)})`); }
  if (!stat.isFile()) fail(`${name} is not a regular file`);
  if (stat.size > cap) fail(`${name} is ${stat.size} bytes, over its ${cap}-byte cap`);
  const bytes = readFileSync(join(dir, name));
  if (bytes.length > cap) fail(`${name} grew past its cap`);
  return bytes;
}
// The nonce is read only to keep it out of stored reasons. Untrusted here; a wrong value only changes which reasons are withheld.
function pageNonce(pageDir) {
  try { const n = JSON.parse(readCapped(pageDir, 'manifest.json', PAGE_MANIFEST_CAP)).transform?.nonce; return /^[0-9a-f]{8}$/.test(n ?? '') ? n : null; }
  catch { return null; }
}

/**
 * The full custody record recomputed from the sealed run: {manifest_sha256, run_manifest_sha256, files:Map(name -> Buffer),
 * eligible}. The run must verify and every planned page must have run. A page that exited non-zero or did not seal is
 * refused without opening it; every other page goes through openVerifiedR2SpeechEvidence, whose refusal is the reason.
 */
async function computeArmInputs(runDir, {plan, inputs}) {
  if (!object(inputs)) fail('approved per-page inputs are required');
  const run = await verifyR2Run(runDir, {plan, inputs});
  if (!run.ok) fail(`run does not verify: ${run.errors.join('; ')}`);
  const pages = run.manifest.pages;
  if ('stopped_after' in run.manifest || !Array.isArray(pages) || !pages.length || pages.length > MAX_PAGES || pages.length !== run.manifest.order?.length)
    fail(`run stopped after ${run.manifest.stopped_after ?? 'an unknown page'}: every planned page must have run`);
  const files = new Map(), records = [];
  for (const entry of pages) {
    const id = entry.id, dir = join(runDir, entry.dir);
    if (entry.dir !== id || !PAGE_ID.test(id)) fail(`run page ${id} directory`);
    let result;
    if (entry.exit_code !== 0) result = {reason: `run page exited ${entry.exit_code} (coordinator verdict); its evidence is never model input`};
    else if (entry.manifest_sha256 === null) result = {reason: 'page evidence did not verify when the run was sealed'};
    else {
      try {
        const handle = await openVerifiedR2SpeechEvidence(dir, inputs[id]);
        if (handle.manifest_sha256 !== entry.manifest_sha256) fail(`page ${id} changed after the run verified`);
        result = buildR2SpeechPayload({manifest: handle, fixture_id: blindFixtureId(run.manifest_sha256, id)});
      } catch (error) {
        if (/^arm inputs:/.test(message(error))) throw error;
        result = {reason: message(error)};
      }
    }
    if ('reason' in result) result = {model_eligible: false, reasons: [result.reason], payload: null, arm_input: {payload_sha256: null, redaction: null}};
    const {record, payload} = armInputPageRecord({id, page_manifest_sha256: entry.manifest_sha256, nonce: pageNonce(dir), result});
    records.push(record);
    if (payload) files.set(record.payload_file, payload);
  }
  const manifest = {schema: ARM_INPUTS_SCHEMA, run_manifest_sha256: run.manifest_sha256,
    builder: {builder_version: BUILDER_VERSION, arm_input_schema: ARM_INPUT_SCHEMA, redaction_version: REDACTION_VERSION, blinding: BLINDING, r2_sha256: r2Digest()},
    pages: records};
  const bytes = Buffer.from(JSON.stringify(JSON.parse(canonical(manifest)), null, 2) + '\n'), digest = sha256(bytes);
  if (bytes.length > MANIFEST_CAP) fail('manifest over its cap');
  files.set('manifest.json', bytes);
  files.set('manifest.sha256', Buffer.from(`${digest}  manifest.json\n`));
  return {manifest_sha256: digest, run_manifest_sha256: run.manifest_sha256, files, eligible: records.filter(r => r.model_eligible).length};
}

// What a directory holds, after its digest check: exact inventory and the sealed manifest bytes.
function stored(dir) {
  const present = listing(dir);
  const bytes = readCapped(dir, 'manifest.json', MANIFEST_CAP), digest = readCapped(dir, 'manifest.sha256', DIGEST_CAP);
  if (digest.toString('utf8') !== `${sha256(bytes)}  manifest.json\n`) fail('manifest digest');
  return {dir, present, bytes, digest};
}
// Exact inventory and exact bytes against a recomputation.
function matches({dir, present, bytes, digest}, expected) {
  if (!bytes.equals(expected.files.get('manifest.json')) || !digest.equals(expected.files.get('manifest.sha256'))) fail('manifest does not recompute from the sealed run');
  const extra = present.filter(name => !expected.files.has(name)), missing = [...expected.files.keys()].filter(name => !present.includes(name));
  if (extra.length) fail(`unexpected arm-input entry ${extra.join(', ')}`);
  if (missing.length) fail(`missing arm-input entry ${missing.join(', ')}`);
  for (const [name, want] of expected.files) if (!readCapped(dir, name, PAYLOAD_CAP).equals(want)) fail(`${name} does not recompute from the sealed run`);
}

/**
 * verifyR2ArmInputs(outDir, runDir, {plan, inputs}) -> {ok, errors, manifest_sha256, eligible}. Read-only. Refuses unless
 * the output is a real directory outside the run, holds exactly the recomputed files, its digest matches, the run still
 * verifies, and every byte equals a fresh recomputation. manifest_sha256 and eligible are null on refusal.
 */
export async function verifyR2ArmInputs(outDir, runDir, {plan, inputs} = {}) {
  try {
    const found = stored(placement(runDir, outDir, {exists: true}));
    const expected = await computeArmInputs(runDir, {plan, inputs});
    matches(found, expected);
    return {ok: true, errors: [], manifest_sha256: expected.manifest_sha256, eligible: expected.eligible};
  } catch (error) {
    return {ok: false, errors: [message(error)], manifest_sha256: null, eligible: null};
  }
}

/**
 * buildR2ArmInputs(runDir, outDir, {plan, inputs}) -> {manifest_sha256, run_manifest_sha256, eligible}. plan and inputs are
 * exactly what --run sealed with (r2RunInputs). Written once: outDir must not exist; its parent must. The files are
 * staged in a fresh sibling, recomputed again and compared there (a run edited in between refuses), then published by
 * one rename. On any failure the builder removes only its own staging directory and publishes nothing.
 */
export async function buildR2ArmInputs(runDir, outDir, {plan, inputs} = {}) {
  const real = placement(runDir, outDir, {exists: false});
  try { lstatSync(real); fail(`output ${basename(real)} exists (arm inputs are written once)`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const built = await computeArmInputs(runDir, {plan, inputs});
  const staging = `${real}.partial-${randomBytes(8).toString('hex')}`;
  mkdirSync(staging);
  try {
    for (const [name, bytes] of built.files) writeFileSync(join(staging, name), bytes, {flag: 'wx'});
    const again = await computeArmInputs(runDir, {plan, inputs});
    matches(stored(staging), again);
    if (again.manifest_sha256 !== built.manifest_sha256) fail('recomputation differs during build');
    try { lstatSync(real); fail(`output ${basename(real)} appeared during build`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    renameSync(staging, real);
  } catch (error) {
    rmSync(staging, {recursive: true, force: true});
    throw error;
  }
  return {manifest_sha256: built.manifest_sha256, run_manifest_sha256: built.run_manifest_sha256, eligible: built.eligible};
}
