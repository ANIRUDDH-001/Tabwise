// R2-L2 O-10: offline hosted-provenance verifier (D-85 hybrid). GitHub's maintained `gh attestation verify` performs
// the cryptographic verification (Sigstore bundle, certificate chain, transparency log and timestamps, against an
// owner-supplied trusted root). This module implements no X.509, Sigstore or Rekor cryptography. It only:
//   1. pins the gh executable and the trusted root by owner-policy SHA-256 (a caller-chosen root would let anyone
//      issue a matching certificate), and runs gh with an argv array (never a shell), its install directory as cwd,
//      a minimal environment, a timeout and an output cap, requiring exit 0;
//   2. recomputes the subject digest from the sealed run manifest on disk (never from the artifact);
//   3. applies owner policy to gh's JSON: exactly one verification result, allowlisted structure, the subject digest,
//      every certificate identity field (repository and numeric IDs, workflow, commit, ref, trigger, hosted runner,
//      run and attempt) and the verified timestamps. The predicate is workflow-controlled and is ignored.
// The result is a workflow-origin claim only: it says which hosted workflow run signed this run manifest. It is not
// runtime, physical-input or screen-reader evidence, and it does not change the S3 evidence class or the C-3 gate.
// The dispatching actor is not in the certificate, so it is reported unbound (the S4 approval guard checks it).
// A verifier built on an injected spawn is simulated: its handle is never accepted by readVerifiedHostedProvenance.
// Authentic signed-artifact verification is PENDING owner authorization (D-85); no test here runs gh.
import {spawn} from 'node:child_process';
import {readFileSync, lstatSync} from 'node:fs';
import {isAbsolute, join, dirname} from 'node:path';
import {createHash} from 'node:crypto';

export const PROVENANCE_POLICY_SCHEMA = 'tabwise-r2-provenance-policy/1';
export const WORKFLOW_ORIGIN_SCHEMA = 'tabwise-r2-workflow-origin/1';
export const VERIFICATION_RESULT_MEDIA = 'application/vnd.dev.sigstore.verificationresult+json;version=0.1';
export const SUBJECT_NAME = 'run-manifest.json';
const STATEMENT_TYPE = 'https://in-toto.io/Statement/v1';
const TIMEOUT_MS = 60_000, MAX_OUTPUT_BYTES = 4 * 1024 * 1024, MAX_TIMESTAMPS = 8, MANIFEST_CAP = 1_000_000, DIGEST_FILE_CAP = 128;
const TIMESTAMP_TYPES = new Set(['Tlog', 'TimestampAuthority']);
// Only these variables reach gh: no tokens and no host or repository redirection (GH_HOST, GH_REPO).
const ENV_ALLOW = ['SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'XDG_CONFIG_HOME'];

const POLICY_KEYS = ['schema', 'gh_executable', 'gh_sha256', 'trusted_root_sha256', 'repository', 'repository_id', 'owner_id', 'workflow', 'ref', 'sha', 'run_id',
  'run_attempt', 'actor', 'trigger', 'oidc_issuer', 'predicate_type', 'not_before', 'not_after'];
// sigstore-go certificate.Summary JSON keys (gh `--format json`). Required: identity the policy pins. Optional: the
// deprecated GitHub extensions (checked for consistency when present) and fields carrying no authority here.
const CERT_REQUIRED = ['certificateIssuer', 'subjectAlternativeName', 'issuer', 'buildSignerURI', 'buildSignerDigest', 'runnerEnvironment',
  'sourceRepositoryURI', 'sourceRepositoryDigest', 'sourceRepositoryRef', 'sourceRepositoryIdentifier', 'sourceRepositoryOwnerURI',
  'sourceRepositoryOwnerIdentifier', 'buildConfigURI', 'buildConfigDigest', 'buildTrigger', 'runInvocationURI'];
const CERT_OPTIONAL = ['githubWorkflowTrigger', 'githubWorkflowSHA', 'githubWorkflowName', 'githubWorkflowRepository', 'githubWorkflowRef',
  'sourceRepositoryVisibilityAtSigning'];

const authentic = new WeakMap(), simulated = new WeakSet();
// Captured at load: rebinding child_process.spawn later (syncBuiltinESMExports) cannot pass as the real spawn.
const realSpawn = spawn;
const sha256 = data => createHash('sha256').update(data).digest('hex');
const fail = message => { throw Error(`provenance: ${message}`); };
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const keysWithin = (v, allowed) => Object.keys(v).every(k => allowed.includes(k));
const text = v => typeof v === 'string' && v.length > 0 && v.length <= 1024 && !v.startsWith('-') && !/[\0\r\n]/.test(v);
const isoTime = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));

function checkPolicy(p) {
  if (!object(p) || p.schema !== PROVENANCE_POLICY_SCHEMA) fail(`policy schema must be ${PROVENANCE_POLICY_SCHEMA}`);
  if (!keysWithin(p, POLICY_KEYS)) fail(`policy has unknown fields ${Object.keys(p).filter(k => !POLICY_KEYS.includes(k)).join(', ')}`);
  for (const k of POLICY_KEYS) if (!(k in p)) fail(`policy ${k} missing`);
  for (const k of POLICY_KEYS.filter(k => k !== 'run_attempt')) if (!text(p[k])) fail(`policy ${k} must be a non-empty string not starting with '-'`);
  if (!isAbsolute(p.gh_executable)) fail('policy gh_executable must be an absolute path');
  if (/\.(cmd|bat|ps1|sh)$/i.test(p.gh_executable)) fail('policy gh_executable must be the gh binary, not a shell wrapper');
  for (const k of ['gh_sha256', 'trusted_root_sha256']) if (!/^[0-9a-f]{64}$/.test(p[k])) fail(`policy ${k} must be 64 lowercase hex characters`);
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(p.repository)) fail('policy repository must be owner/name');
  for (const k of ['repository_id', 'owner_id', 'run_id']) if (!/^[1-9][0-9]{0,19}$/.test(p[k])) fail(`policy ${k} must be a decimal string`);
  if (!/^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/.test(p.workflow)) fail('policy workflow must be a file under .github/workflows');
  if (!/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(p.ref)) fail('policy ref must be refs/heads/<branch>');
  if (!/^[0-9a-f]{40}$/.test(p.sha)) fail('policy sha must be a full 40-character commit SHA');
  if (!Number.isSafeInteger(p.run_attempt) || p.run_attempt < 1) fail('policy run_attempt must be a positive integer');
  if (!/^https:\/\//.test(p.oidc_issuer) || !/^https:\/\//.test(p.predicate_type)) fail('policy oidc_issuer and predicate_type must be https URIs');
  if (!isoTime(p.not_before) || !isoTime(p.not_after) || Date.parse(p.not_before) >= Date.parse(p.not_after)) fail('policy not_before/not_after must be an increasing RFC 3339 window');
}

// Regular file (not a symlink), read with a size cap.
function readRegular(path, cap, what) {
  let st;
  try { st = lstatSync(path); } catch { fail(`${what} missing`); }
  if (!st.isFile()) fail(`${what} must be a regular file`);
  if (cap !== null && st.size > cap) fail(`${what} exceeds ${cap} bytes`);
  return readFileSync(path);
}

/** r2ProvenancePolicyDigest(policy) -> sha256 over every owner policy field in fixed order (recorded in the claims). */
export function r2ProvenancePolicyDigest(policy) {
  return sha256(JSON.stringify(POLICY_KEYS.map(k => [k, policy?.[k] ?? null])));
}

function runGh(spawnImpl, file, args, {timeoutMs, maxOutputBytes}) {
  const env = {GH_NO_UPDATE_NOTIFIER: '1', GH_PROMPT_DISABLED: '1', NO_COLOR: '1'};
  for (const k of ENV_ALLOW) if (typeof process.env[k] === 'string') env[k] = process.env[k];
  return new Promise((resolve, reject) => {
    let child, settled = false, bytes = 0;
    const out = [];
    const done = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const stop = message => { done(Error(`provenance: ${message}`)); try { child?.kill('SIGKILL'); } catch {} };
    const timer = setTimeout(() => stop(`gh timed out after ${timeoutMs} ms`), timeoutMs);
    try {
      child = spawnImpl(file, args, {shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: dirname(file), env});
    } catch (error) { return done(Error(`provenance: gh could not start: ${error.message}`)); }
    if (!child || typeof child.on !== 'function' || typeof child.stdout?.on !== 'function' || typeof child.stderr?.on !== 'function') return stop('gh child has no output pipes');
    const take = (chunk, keep) => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) return stop(`gh output exceeds ${maxOutputBytes} bytes`);
      if (keep) out.push(chunk);
    };
    child.stdout.on('data', chunk => take(chunk, true));
    child.stderr.on('data', chunk => take(chunk, false));
    child.on('error', error => done(Error(`provenance: gh could not run: ${error.message}`)));
    child.on('close', (code, signal) => {
      if (code !== 0 || signal !== null) return done(Error(`provenance: gh exit ${code} signal ${signal}; verification refused`));
      done(null, Buffer.concat(out).toString('utf8'));
    });
  });
}

function checkCertificate(c, p) {
  const [owner] = p.repository.split('/'), repoUri = `https://github.com/${p.repository}`;
  const signer = `${repoUri}/${p.workflow}@${p.ref}`;
  const expected = {subjectAlternativeName: signer, issuer: p.oidc_issuer, buildSignerURI: signer, buildSignerDigest: p.sha,
    runnerEnvironment: 'github-hosted', sourceRepositoryURI: repoUri, sourceRepositoryDigest: p.sha, sourceRepositoryRef: p.ref,
    sourceRepositoryIdentifier: p.repository_id, sourceRepositoryOwnerURI: `https://github.com/${owner}`, sourceRepositoryOwnerIdentifier: p.owner_id,
    buildConfigURI: signer, buildConfigDigest: p.sha, buildTrigger: p.trigger,
    runInvocationURI: `${repoUri}/actions/runs/${p.run_id}/attempts/${p.run_attempt}`,
    githubWorkflowTrigger: p.trigger, githubWorkflowSHA: p.sha, githubWorkflowRepository: p.repository, githubWorkflowRef: p.ref};
  if (!object(c)) fail('certificate summary missing');
  for (const k of Object.keys(c)) if (!CERT_REQUIRED.includes(k) && !CERT_OPTIONAL.includes(k)) fail(`certificate has unsupported field ${k}`);
  for (const k of [...CERT_REQUIRED, ...CERT_OPTIONAL]) {
    if (!(k in c)) { if (CERT_REQUIRED.includes(k)) fail(`certificate ${k} missing`); continue; }
    if (typeof c[k] !== 'string' || !c[k]) fail(`certificate ${k} must be a non-empty string`);
    if (k in expected && c[k] !== expected[k]) fail(`certificate ${k} ${JSON.stringify(c[k])} does not match owner policy ${JSON.stringify(expected[k])}`);
  }
}

function checkTimestamps(list, p) {
  if (!Array.isArray(list) || list.length < 1) fail('no verified timestamp');
  if (list.length > MAX_TIMESTAMPS) fail(`more than ${MAX_TIMESTAMPS} verified timestamps`);
  const lo = Date.parse(p.not_before), hi = Date.parse(p.not_after);
  return list.map((t, i) => {
    if (!object(t) || !keysWithin(t, ['type', 'uri', 'timestamp']) || !TIMESTAMP_TYPES.has(t.type) || typeof t.uri !== 'string') fail(`verified timestamp ${i} structure`);
    if (!isoTime(t.timestamp)) fail(`verified timestamp ${i} is not RFC 3339`);
    const at = Date.parse(t.timestamp);
    if (at < lo || at > hi) fail(`verified timestamp ${i} ${t.timestamp} is outside the owner window`);
    return {type: t.type, uri: t.uri, timestamp: t.timestamp};
  });
}

function checkResult(stdout, p, subject) {
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { fail('gh output is not JSON'); }
  if (!Array.isArray(parsed) || parsed.length !== 1) fail(`gh output must be exactly one verification result (got ${Array.isArray(parsed) ? parsed.length : typeof parsed})`);
  const [entry] = parsed;
  if (!object(entry) || !keysWithin(entry, ['attestation', 'verificationResult'])) fail('verification entry structure');
  const v = entry.verificationResult;
  if (!object(v) || !keysWithin(v, ['mediaType', 'statement', 'signature', 'verifiedTimestamps', 'verifiedIdentity'])) fail('verificationResult structure');
  if (v.mediaType !== VERIFICATION_RESULT_MEDIA) fail(`verificationResult mediaType ${JSON.stringify(v.mediaType)} is not supported`);
  const s = v.statement;
  if (!object(s) || !keysWithin(s, ['_type', 'subject', 'predicateType', 'predicate'])) fail('statement structure');
  if (s._type !== STATEMENT_TYPE) fail(`statement type ${JSON.stringify(s._type)} is not supported`);
  if (s.predicateType !== p.predicate_type) fail(`statement predicateType ${JSON.stringify(s.predicateType)} does not match owner policy`);
  if (!Array.isArray(s.subject) || s.subject.length !== 1) fail('statement must carry exactly one subject');
  const [sub] = s.subject;
  if (!object(sub) || !keysWithin(sub, ['name', 'digest']) || sub.name !== SUBJECT_NAME) fail(`statement subject must be ${SUBJECT_NAME}`);
  if (!object(sub.digest) || !keysWithin(sub.digest, ['sha256']) || sub.digest.sha256 !== subject) fail('statement subject digest does not match the recomputed sealed run manifest');
  if (!object(v.signature) || !keysWithin(v.signature, ['certificate'])) fail('signature structure');
  checkCertificate(v.signature.certificate, p);
  return checkTimestamps(v.verifiedTimestamps, p);
}

/**
 * verifyR2HostedProvenance({runDir, bundle, trustedRoot, policy, timeoutMs?, maxOutputBytes?, spawnImpl?}) ->
 * {handle, claims, simulated}. Throws `provenance: ...` on any refusal. policy is owner-controlled (never read from
 * the artifact). spawnImpl is a test seam: anything other than node:child_process spawn marks the result simulated.
 */
export async function verifyR2HostedProvenance(options = {}) {
  if (!object(options) || !keysWithin(options, ['runDir', 'bundle', 'trustedRoot', 'policy', 'timeoutMs', 'maxOutputBytes', 'spawnImpl'])) {
    fail(`unknown option ${object(options) ? Object.keys(options).join(', ') : typeof options}`);
  }
  const {runDir, bundle, trustedRoot, policy, timeoutMs = TIMEOUT_MS, maxOutputBytes = MAX_OUTPUT_BYTES, spawnImpl = realSpawn} = options;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > TIMEOUT_MS) fail(`timeoutMs must be 1..${TIMEOUT_MS}`);
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > MAX_OUTPUT_BYTES) fail(`maxOutputBytes must be 1..${MAX_OUTPUT_BYTES}`);
  if (typeof spawnImpl !== 'function') fail('spawnImpl must be a function');
  checkPolicy(policy);
  const p = structuredClone(policy);
  for (const [name, path] of [['runDir', runDir], ['bundle', bundle], ['trustedRoot', trustedRoot]]) if (!text(path) || !isAbsolute(path)) fail(`${name} must be an absolute path`);
  readRegular(bundle, null, 'bundle');
  const root = readRegular(trustedRoot, null, 'trusted root');
  if (sha256(root) !== p.trusted_root_sha256) fail('trusted root digest does not match owner policy');
  if (sha256(readRegular(p.gh_executable, null, 'gh executable')) !== p.gh_sha256) fail('gh executable digest does not match owner policy');

  const subjectPath = join(runDir, SUBJECT_NAME);
  const before = readRegular(subjectPath, MANIFEST_CAP, SUBJECT_NAME), subject = sha256(before);
  if (readRegular(join(runDir, 'run-manifest.sha256'), DIGEST_FILE_CAP, 'run-manifest.sha256').toString('utf8') !== `${subject}  ${SUBJECT_NAME}\n`) {
    fail('sealed run manifest does not match its digest file');
  }
  const args = ['attestation', 'verify', subjectPath, `--bundle=${bundle}`, `--custom-trusted-root=${trustedRoot}`, `--repo=${p.repository}`,
    `--signer-workflow=${p.repository}/${p.workflow}`, `--source-digest=${p.sha}`, `--source-ref=${p.ref}`, `--cert-oidc-issuer=${p.oidc_issuer}`,
    `--predicate-type=${p.predicate_type}`, '--deny-self-hosted-runners', '--format=json'];
  const stdout = await runGh(spawnImpl, p.gh_executable, args, {timeoutMs, maxOutputBytes});
  if (!readRegular(subjectPath, MANIFEST_CAP, SUBJECT_NAME).equals(before)) fail('sealed run manifest changed during verification');
  if (!readRegular(trustedRoot, null, 'trusted root').equals(root)) fail('trusted root changed during verification');
  const timestamps = checkResult(stdout, p, subject);

  const claims = Object.freeze({schema: WORKFLOW_ORIGIN_SCHEMA, evidence_class: 'workflow-origin', runtime_attested: false,
    physical_input_attested: false, actor_bound: false, subject_name: SUBJECT_NAME, subject_sha256: subject,
    repository: p.repository, repository_id: p.repository_id, owner_id: p.owner_id, workflow: p.workflow, ref: p.ref, sha: p.sha,
    run_id: p.run_id, run_attempt: p.run_attempt, trigger: p.trigger, runner_environment: 'github-hosted',
    timestamps: Object.freeze(timestamps.map(t => Object.freeze(t))),
    authority: 'gh attestation verify certificate summary and verified timestamps; predicate ignored',
    trusted_root_sha256: p.trusted_root_sha256, policy_sha256: r2ProvenancePolicyDigest(p)});
  const isSimulated = spawnImpl !== realSpawn;
  const handle = Object.freeze({kind: 'tabwise-r2-workflow-origin', subject_sha256: subject});
  if (isSimulated) simulated.add(handle); else authentic.set(handle, claims);
  return {handle, claims, simulated: isSimulated};
}

/** readVerifiedHostedProvenance(handle) -> claims. Accepts only a handle minted by a real (non-simulated) run. */
export function readVerifiedHostedProvenance(handle) {
  if (object(handle) && simulated.has(handle)) fail('simulated verifier result; never authority');
  if (!object(handle) || !authentic.has(handle)) fail('not a verified hosted-provenance handle');
  return structuredClone(authentic.get(handle));
}
