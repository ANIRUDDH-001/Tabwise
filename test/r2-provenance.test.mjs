import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const sha256=data=>createHash('sha256').update(data).digest('hex');
const roots=[];
const temp=()=>{const d=mkdtempSync(join(tmpdir(),'tabwise-r2-o10-'));roots.push(d);return d;};
test.after(()=>{for(const d of roots)rmSync(d,{recursive:true,force:true});});

// ---- R2-L2 O-10: offline hosted-provenance verifier (D-85 hybrid) ----
// GitHub's `gh attestation verify` does the cryptography; src/r2/provenance.mjs only runs it (explicit executable,
// argv array, no shell, timeout, output cap, exit check) and applies owner policy to its JSON. These tests never run
// gh or any process: the spawn seam is an in-memory fake, and a verifier built on an injected spawn is marked
// simulated, so its handle is never authority. Authentic signed-artifact verification is PENDING owner authorization.
import {EventEmitter} from 'node:events';
import {createRequire, syncBuiltinESMExports} from 'node:module';
import {dirname} from 'node:path';
import {verifyR2HostedProvenance, readVerifiedHostedProvenance, r2ProvenancePolicyDigest, PROVENANCE_POLICY_SCHEMA, VERIFICATION_RESULT_MEDIA} from '../src/r2/provenance.mjs';

const O10_GH = 'fake gh executable bytes (never run)\n', O10_ROOT = '{"root":1}\n';
const O10_SHA = 'a'.repeat(40);
function o10Fixture() {
  const root = temp(), run = join(root, 'run');
  mkdirSync(run);
  const manifestBytes = Buffer.from(JSON.stringify({schema: 'tabwise-r2-run-evidence/1', pages: []}, null, 2) + '\n');
  writeFileSync(join(run, 'run-manifest.json'), manifestBytes);
  writeFileSync(join(run, 'run-manifest.sha256'), `${sha256(manifestBytes)}  run-manifest.json\n`);
  for (const [name, body] of [['gh.exe', O10_GH], ['bundle.jsonl', '{"bundle":1}\n'], ['trusted_root.jsonl', O10_ROOT]]) writeFileSync(join(root, name), body);
  const policy = {schema: PROVENANCE_POLICY_SCHEMA, gh_executable: join(root, 'gh.exe'), gh_sha256: sha256(O10_GH), trusted_root_sha256: sha256(O10_ROOT),
    repository: 'ANIRUDDH-001/Tabwise', repository_id: '900001', owner_id: '800001', workflow: '.github/workflows/tabwise-r2.yml',
    ref: 'refs/heads/main', sha: O10_SHA, run_id: '123456789', run_attempt: 1, actor: 'ANIRUDDH-001', trigger: 'workflow_dispatch',
    oidc_issuer: 'https://token.actions.githubusercontent.com', predicate_type: 'https://slsa.dev/provenance/v1',
    not_before: '2026-11-01T00:00:00Z', not_after: '2026-11-05T00:00:00Z'};
  return {root, run, subject: sha256(manifestBytes), policy, bundle: join(root, 'bundle.jsonl'), trustedRoot: join(root, 'trusted_root.jsonl')};
}
const O10_SIGNER = 'https://github.com/ANIRUDDH-001/Tabwise/.github/workflows/tabwise-r2.yml@refs/heads/main';
function o10Certificate() {
  return {certificateIssuer: 'CN=sigstore-intermediate,O=sigstore.dev', subjectAlternativeName: O10_SIGNER,
    issuer: 'https://token.actions.githubusercontent.com', githubWorkflowTrigger: 'workflow_dispatch', githubWorkflowSHA: O10_SHA,
    githubWorkflowName: 'tabwise-r2', githubWorkflowRepository: 'ANIRUDDH-001/Tabwise', githubWorkflowRef: 'refs/heads/main',
    buildSignerURI: O10_SIGNER, buildSignerDigest: O10_SHA, runnerEnvironment: 'github-hosted',
    sourceRepositoryURI: 'https://github.com/ANIRUDDH-001/Tabwise', sourceRepositoryDigest: O10_SHA, sourceRepositoryRef: 'refs/heads/main',
    sourceRepositoryIdentifier: '900001', sourceRepositoryOwnerURI: 'https://github.com/ANIRUDDH-001', sourceRepositoryOwnerIdentifier: '800001',
    buildConfigURI: O10_SIGNER, buildConfigDigest: O10_SHA, buildTrigger: 'workflow_dispatch',
    runInvocationURI: 'https://github.com/ANIRUDDH-001/Tabwise/actions/runs/123456789/attempts/1', sourceRepositoryVisibilityAtSigning: 'private'};
}
function o10Output(subject, edit) {
  const entry = {attestation: {bundle: {opaque: true}}, verificationResult: {mediaType: VERIFICATION_RESULT_MEDIA,
    statement: {_type: 'https://in-toto.io/Statement/v1', subject: [{name: 'run-manifest.json', digest: {sha256: subject}}],
      predicateType: 'https://slsa.dev/provenance/v1', predicate: {buildDefinition: {externalParameters: {workflow: {repository: 'https://github.com/ANIRUDDH-001/Tabwise'}}}}},
    signature: {certificate: o10Certificate()},
    verifiedTimestamps: [{type: 'Tlog', uri: 'https://rekor.sigstore.dev', timestamp: '2026-11-02T10:00:00Z'}],
    verifiedIdentity: {subjectAlternativeName: {subjectAlternativeName: O10_SIGNER}}}};
  const out = [entry];
  edit?.(out, entry.verificationResult);
  return out;
}
// In-memory child process. behave(child, args) drives it; a child that is never closed models a hang.
function o10Spawn(behave) {
  const calls = [];
  const spawnImpl = (file, args, options) => {
    calls.push({file, args, options});
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.kill = signal => { child.killed = signal; setImmediate(() => child.emit('close', null, signal)); return true; };
    setImmediate(() => behave(child, args));
    return child;
  };
  spawnImpl.calls = calls;
  return spawnImpl;
}
const o10Emit = (text, code = 0, signal = null) => child => { if (text) child.stdout.emit('data', Buffer.from(text)); child.emit('close', code, signal); };
const o10Json = (subject, edit) => o10Emit(JSON.stringify(o10Output(subject, edit)));
function o10Run(f, spawnImpl, extra = {}) {
  return verifyR2HostedProvenance({runDir: f.run, bundle: f.bundle, trustedRoot: f.trustedRoot, policy: f.policy, spawnImpl, ...extra});
}

test('O10-1 policy-conforming output yields workflow-origin claims; the simulated handle is never authority', async () => {
  const f = o10Fixture(), spawnImpl = o10Spawn(o10Json(f.subject));
  const leak = ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST', 'GH_REPO', 'GH_ENTERPRISE_TOKEN'], saved = leak.map(k => process.env[k]);
  for (const k of leak) process.env[k] = 'placeholder-not-a-credential';
  let r;
  try { r = await o10Run(f, spawnImpl); } finally { leak.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; }); }
  assert.equal(r.simulated, true);
  assert.deepEqual(r.claims, {schema: 'tabwise-r2-workflow-origin/1', evidence_class: 'workflow-origin', runtime_attested: false,
    physical_input_attested: false, actor_bound: false, subject_name: 'run-manifest.json', subject_sha256: f.subject,
    repository: 'ANIRUDDH-001/Tabwise', repository_id: '900001', owner_id: '800001', workflow: '.github/workflows/tabwise-r2.yml',
    ref: 'refs/heads/main', sha: O10_SHA, run_id: '123456789', run_attempt: 1, trigger: 'workflow_dispatch', runner_environment: 'github-hosted',
    timestamps: [{type: 'Tlog', uri: 'https://rekor.sigstore.dev', timestamp: '2026-11-02T10:00:00Z'}],
    authority: 'gh attestation verify certificate summary and verified timestamps; predicate ignored',
    trusted_root_sha256: sha256(O10_ROOT), policy_sha256: r2ProvenancePolicyDigest(f.policy)});
  assert.ok(Object.isFrozen(r.claims) && Object.isFrozen(r.handle));
  assert.throws(() => readVerifiedHostedProvenance(r.handle), /simulated/);
  const [call] = spawnImpl.calls;
  assert.equal(spawnImpl.calls.length, 1);
  assert.equal(call.file, f.policy.gh_executable);
  assert.deepEqual(call.args, ['attestation', 'verify', join(f.run, 'run-manifest.json'), `--bundle=${f.bundle}`,
    `--custom-trusted-root=${f.trustedRoot}`, '--repo=ANIRUDDH-001/Tabwise', '--signer-workflow=ANIRUDDH-001/Tabwise/.github/workflows/tabwise-r2.yml',
    `--source-digest=${O10_SHA}`, '--source-ref=refs/heads/main', '--cert-oidc-issuer=https://token.actions.githubusercontent.com',
    '--predicate-type=https://slsa.dev/provenance/v1', '--deny-self-hosted-runners', '--format=json']);
  assert.equal(call.options.shell, false);
  assert.equal(call.options.cwd, dirname(f.policy.gh_executable), 'gh runs in the owner-pinned install directory, not the caller cwd');
  for (const name of leak) assert.equal(name in call.options.env, false, `${name} is never forwarded to gh`);
  assert.doesNotMatch(JSON.stringify(r.claims), /externalParameters/, 'the predicate never reaches the claims');
});

test('O10-2 forged, copied or plain handles are refused', async () => {
  const f = o10Fixture(), r = await o10Run(f, o10Spawn(o10Json(f.subject)));
  for (const forged of [undefined, null, {}, {...r.handle}, Object.freeze({...r.handle}), structuredClone(r.handle), {verified: true, simulated: false}]) {
    assert.throws(() => readVerifiedHostedProvenance(forged), /^Error: provenance: /, JSON.stringify(forged));
  }
  await assert.rejects(o10Run(f, o10Spawn(o10Json(f.subject)), {verified: true}), /^Error: provenance: unknown option/);
});

test('O10-3 malformed owner policy refuses before any process starts', async () => {
  const cases = [
    ['missing policy', p => null], ['wrong schema', p => ({...p, schema: 'x/1'})], ['extra key', p => ({...p, success: true})],
    ...Object.keys(o10Fixture().policy).filter(k => k !== 'schema').map(k => [`missing ${k}`, p => { const q = {...p}; delete q[k]; return q; }]),
    ['non-numeric repository id', p => ({...p, repository_id: 'Tabwise'})], ['numeric owner id as a number', p => ({...p, owner_id: 800001})],
    ['short sha', p => ({...p, sha: 'abc'})], ['run attempt zero', p => ({...p, run_attempt: 0})], ['repository with a path', p => ({...p, repository: 'a/b/c'})],
    ['workflow outside .github/workflows', p => ({...p, workflow: 'tabwise-r2.yml'})], ['ref not a branch', p => ({...p, ref: 'main'})],
    ['window reversed', p => ({...p, not_before: p.not_after, not_after: p.not_before})], ['value starting with a dash', p => ({...p, actor: '--help'})]];
  for (const [name, edit] of cases) {
    const f = o10Fixture(), spawnImpl = o10Spawn(o10Json(f.subject));
    f.policy = edit(f.policy);
    await assert.rejects(o10Run(f, spawnImpl), /^Error: provenance: policy/, name);
    assert.equal(spawnImpl.calls.length, 0, name);
  }
});

test('O10-4 the executable is pinned: relative, shell-wrapper and digest-mismatched executables refuse before spawn', async () => {
  for (const [name, edit] of [['relative path', (f) => { f.policy.gh_executable = 'gh.exe'; }],
    ['batch wrapper', (f) => { writeFileSync(join(f.root, 'gh.cmd'), O10_GH); f.policy.gh_executable = join(f.root, 'gh.cmd'); }],
    ['digest mismatch', (f) => { writeFileSync(f.policy.gh_executable, 'swapped binary'); }],
    ['missing executable', (f) => { unlinkSync(f.policy.gh_executable); }]]) {
    const f = o10Fixture(), spawnImpl = o10Spawn(o10Json(f.subject));
    edit(f);
    await assert.rejects(o10Run(f, spawnImpl), /^Error: provenance: /, name);
    assert.equal(spawnImpl.calls.length, 0, name);
  }
});

test('O10-5 the subject digest is recomputed from the sealed run manifest; copied or tampered evidence refuses', async () => {
  const cases = [
    ['attestation for other evidence (copied bundle)', f => o10Json('b'.repeat(64))],
    ['sealed manifest edited after sealing', f => { writeFileSync(join(f.run, 'run-manifest.json'), '{"tampered":true}\n'); return o10Json(f.subject); }],
    ['manifest and attestation both swapped, digest file stale', f => {
      const bytes = Buffer.from('{"forged":true}\n'); writeFileSync(join(f.run, 'run-manifest.json'), bytes); return o10Json(sha256(bytes)); }],
    ['missing digest file', f => { unlinkSync(join(f.run, 'run-manifest.sha256')); return o10Json(f.subject); }],
    ['manifest changed while gh ran', f => child => { writeFileSync(join(f.run, 'run-manifest.json'), 'late edit\n'); o10Json(f.subject)(child); }],
    ['uppercase digest in the attestation', f => o10Json(f.subject.toUpperCase())],
    ['second digest algorithm', f => o10Json(f.subject, (o, v) => { v.statement.subject[0].digest.sha512 = 'c'.repeat(128); })],
    ['two subjects', f => o10Json(f.subject, (o, v) => { v.statement.subject.push({name: 'other', digest: {sha256: f.subject}}); })],
    ['no subjects', f => o10Json(f.subject, (o, v) => { v.statement.subject = []; })],
    ['subject named for another file', f => o10Json(f.subject, (o, v) => { v.statement.subject[0].name = 'manifest.json'; })]];
  for (const [name, behave] of cases) {
    const f = o10Fixture();
    await assert.rejects(o10Run(f, o10Spawn(behave(f))), /^Error: provenance: /, name);
  }
});

test('O10-6 certificate identity must equal owner policy: wrong repo, id, workflow, run, attempt, commit, ref, trigger, runner or issuer refuse', async () => {
  const cert = o10Certificate();
  const wrong = {
    certificateIssuer: '', subjectAlternativeName: O10_SIGNER.replace('tabwise-r2', 'other'), issuer: 'https://evil.example',
    githubWorkflowTrigger: 'push', githubWorkflowSHA: 'b'.repeat(40), githubWorkflowRepository: 'attacker/Tabwise', githubWorkflowRef: 'refs/heads/dev',
    buildSignerURI: O10_SIGNER.replace('main', 'dev'), buildSignerDigest: 'b'.repeat(40), runnerEnvironment: 'self-hosted',
    sourceRepositoryURI: 'https://github.com/attacker/Tabwise', sourceRepositoryDigest: 'b'.repeat(40), sourceRepositoryRef: 'refs/heads/dev',
    sourceRepositoryIdentifier: '900002', sourceRepositoryOwnerURI: 'https://github.com/attacker', sourceRepositoryOwnerIdentifier: '800002',
    buildConfigURI: 'https://github.com/ANIRUDDH-001/Tabwise/.github/workflows/r1.yml@refs/heads/main', buildConfigDigest: 'b'.repeat(40),
    buildTrigger: 'push', runInvocationURI: cert.runInvocationURI.replace('123456789', '123456788')};
  for (const [field, value] of Object.entries(wrong)) {
    const f = o10Fixture();
    await assert.rejects(o10Run(f, o10Spawn(o10Json(f.subject, (o, v) => { v.signature.certificate[field] = value; }))),
      new RegExp(`^Error: provenance: certificate ${field}`), field);
  }
  for (const [name, uri] of [['replayed attempt', cert.runInvocationURI.replace(/1$/, '2')], ['run URI in another repository', cert.runInvocationURI.replace('ANIRUDDH-001/Tabwise', 'attacker/Tabwise')]]) {
    const f = o10Fixture();
    await assert.rejects(o10Run(f, o10Spawn(o10Json(f.subject, (o, v) => { v.signature.certificate.runInvocationURI = uri; }))), /^Error: provenance: certificate runInvocationURI/, name);
  }
  const second = o10Fixture();
  second.policy.run_attempt = 2;
  await assert.rejects(o10Run(second, o10Spawn(o10Json(second.subject))), /^Error: provenance: certificate runInvocationURI/, 'attempt 1 replayed where the owner approved attempt 2');
  const rerun = o10Fixture();
  rerun.policy.run_attempt = 2;
  const ok = await o10Run(rerun, o10Spawn(o10Json(rerun.subject, (o, v) => { v.signature.certificate.runInvocationURI = cert.runInvocationURI.replace(/1$/, '2'); })));
  assert.equal(ok.claims.run_attempt, 2, 'the approved attempt comes from owner policy');
  const renamed = o10Fixture();
  renamed.policy.repository_id = '900009';
  await assert.rejects(o10Run(renamed, o10Spawn(o10Json(renamed.subject))), /^Error: provenance: certificate sourceRepositoryIdentifier/, 'a same-name repository with another numeric id (rename or re-creation)');
});

test('O10-7 missing, mistyped or unsupported certificate fields refuse', async () => {
  const required = ['certificateIssuer', 'subjectAlternativeName', 'issuer', 'buildSignerURI', 'buildSignerDigest', 'runnerEnvironment',
    'sourceRepositoryURI', 'sourceRepositoryDigest', 'sourceRepositoryRef', 'sourceRepositoryIdentifier', 'sourceRepositoryOwnerURI',
    'sourceRepositoryOwnerIdentifier', 'buildConfigURI', 'buildConfigDigest', 'buildTrigger', 'runInvocationURI'];
  for (const field of required) {
    const f = o10Fixture();
    await assert.rejects(o10Run(f, o10Spawn(o10Json(f.subject, (o, v) => { delete v.signature.certificate[field]; }))), new RegExp(`^Error: provenance: certificate ${field}`), `missing ${field}`);
    const g = o10Fixture();
    await assert.rejects(o10Run(g, o10Spawn(o10Json(g.subject, (o, v) => { v.signature.certificate[field] = 1; }))), new RegExp(`^Error: provenance: certificate ${field}`), `mistyped ${field}`);
  }
  for (const field of ['githubWorkflowTrigger', 'githubWorkflowSHA', 'githubWorkflowName', 'githubWorkflowRepository', 'githubWorkflowRef', 'sourceRepositoryVisibilityAtSigning']) {
    const f = o10Fixture();
    const r = await o10Run(f, o10Spawn(o10Json(f.subject, (o, v) => { delete v.signature.certificate[field]; })));
    assert.equal(r.claims.run_id, '123456789', `optional ${field} may be absent`);
  }
  const f = o10Fixture();
  await assert.rejects(o10Run(f, o10Spawn(o10Json(f.subject, (o, v) => { v.signature.certificate.actorIdentifier = '1'; }))), /^Error: provenance: certificate has unsupported field actorIdentifier/);
});

test('O10-8 output structure is strict: one entry, allowlisted media type, statement type and predicate type, no unknown keys', async () => {
  const cases = [
    ['empty array', o => { o.length = 0; }], ['two entries', o => { o.push(structuredClone(o[0])); }],
    ['object instead of array', null], ['media type', (o, v) => { v.mediaType = 'application/json'; }],
    ['statement type', (o, v) => { v.statement._type = 'https://in-toto.io/Statement/v0.1'; }],
    ['predicate type', (o, v) => { v.statement.predicateType = 'https://example.com/custom'; }],
    ['unknown result key', (o, v) => { v.verified = true; }], ['unknown entry key', o => { o[0].success = true; }],
    ['missing signature', (o, v) => { delete v.signature; }], ['missing statement', (o, v) => { delete v.statement; }],
    ['unknown signature key', (o, v) => { v.signature.key = 'x'; }], ['certificate not an object', (o, v) => { v.signature.certificate = 'x'; }]];
  for (const [name, edit] of cases) {
    const f = o10Fixture();
    const behave = edit ? o10Json(f.subject, edit) : o10Emit(JSON.stringify(o10Output(f.subject)[0]));
    await assert.rejects(o10Run(f, o10Spawn(behave)), /^Error: provenance: /, name);
  }
});

test('O10-9 verified timestamps are required, well-formed and inside the owner window', async () => {
  const cases = [
    ['none', (o, v) => { v.verifiedTimestamps = []; }], ['missing', (o, v) => { delete v.verifiedTimestamps; }],
    ['before the window', (o, v) => { v.verifiedTimestamps[0].timestamp = '2026-10-31T23:59:59Z'; }],
    ['after the window', (o, v) => { v.verifiedTimestamps[0].timestamp = '2026-11-05T00:00:01Z'; }],
    ['one of two outside the window', (o, v) => { v.verifiedTimestamps.push({type: 'TimestampAuthority', uri: 'https://tsa.example', timestamp: '2025-01-01T00:00:00Z'}); }],
    ['malformed', (o, v) => { v.verifiedTimestamps[0].timestamp = 'yesterday'; }], ['unknown type', (o, v) => { v.verifiedTimestamps[0].type = 'Local'; }],
    ['unknown key', (o, v) => { v.verifiedTimestamps[0].trusted = true; }], ['too many', (o, v) => { v.verifiedTimestamps = Array(9).fill(v.verifiedTimestamps[0]); }]];
  for (const [name, edit] of cases) {
    const f = o10Fixture();
    await assert.rejects(o10Run(f, o10Spawn(o10Json(f.subject, edit))), /^Error: provenance: .*timestamp/, name);
  }
});

test('O10-10 predicate content never gains certificate authority', async () => {
  const f = o10Fixture();
  const r = await o10Run(f, o10Spawn(o10Json(f.subject, (o, v) => {
    v.statement.predicate = {repository: 'attacker/Tabwise', runner_environment: 'self-hosted', run_id: '1', actor: 'attacker', sha: 'b'.repeat(40)};
  })));
  assert.equal(r.claims.repository, 'ANIRUDDH-001/Tabwise');
  assert.equal(r.claims.run_id, '123456789');
  assert.equal(r.claims.actor_bound, false, 'the actor is not in the certificate, so it stays an unbound workflow claim');
  assert.doesNotMatch(JSON.stringify(r.claims), /attacker|self-hosted/);
});

test('O10-11 process boundary: non-zero exit, signal, timeout, oversized output, malformed or empty JSON and spawn errors refuse', async () => {
  const big = 'x'.repeat(16384);
  const cases = [
    ['non-zero exit with valid JSON', f => o10Emit(JSON.stringify(o10Output(f.subject)), 1), /exit/],
    ['killed by a signal', f => o10Emit(JSON.stringify(o10Output(f.subject)), null, 'SIGTERM'), /exit/],
    ['hang (timeout)', f => () => {}, /timed out/],
    ['stdout over the cap', f => child => { child.stdout.emit('data', Buffer.from(big)); child.emit('close', 0, null); }, /output exceeds/],
    ['stderr over the cap', f => child => { child.stderr.emit('data', Buffer.from(big)); child.emit('close', 0, null); }, /output exceeds/],
    ['malformed JSON', f => o10Emit('[{"verificationResult":'), /JSON/],
    ['empty output', f => o10Emit(''), /JSON/],
    ['trailing garbage after JSON', f => o10Emit(JSON.stringify(o10Output(f.subject)) + ' ok'), /JSON/],
    ['spawn error', f => child => child.emit('error', Error('ENOENT')), /ENOENT/]];
  for (const [name, behave, reason] of cases) {
    const f = o10Fixture(), spawnImpl = o10Spawn(behave(f));
    const t0 = performance.now();
    await assert.rejects(o10Run(f, spawnImpl, {timeoutMs: 50, maxOutputBytes: 8192}), err => /^provenance: /.test(err.message) && reason.test(err.message), name);
    assert.ok(performance.now() - t0 < 5000, `${name}: bounded`);
  }
  const f = o10Fixture();
  for (const extra of [{timeoutMs: 0}, {timeoutMs: 10 * 60_000}, {maxOutputBytes: 0}, {maxOutputBytes: 64 * 1024 * 1024}]) {
    await assert.rejects(o10Run(f, o10Spawn(o10Json(f.subject)), extra), /^Error: provenance: /, JSON.stringify(extra));
  }
});

test('O10-12 a spawn that throws or returns a child without pipes refuses promptly', async () => {
  for (const [name, spawnImpl, reason] of [['spawn throws', () => { throw Error('EACCES'); }, /could not start: EACCES/],
    ['no child', () => undefined, /no output pipes/], ['child without pipes', () => ({on() {}}), /no output pipes/]]) {
    const f = o10Fixture(), t0 = performance.now();
    await assert.rejects(o10Run(f, spawnImpl, {timeoutMs: 60_000}), err => /^provenance: /.test(err.message) && reason.test(err.message), name);
    assert.ok(performance.now() - t0 < 1000, `${name}: refused without waiting for the timeout`);
  }
});

test('O10-13 the trusted root is pinned by owner policy digest before and after gh runs (adversarial review)', async () => {
  const f = o10Fixture(), spawnImpl = o10Spawn(o10Json(f.subject));
  writeFileSync(f.trustedRoot, '{"root":"attacker CA"}\n');
  await assert.rejects(o10Run(f, spawnImpl), /^Error: provenance: trusted root digest does not match owner policy/);
  assert.equal(spawnImpl.calls.length, 0);
  const g = o10Fixture();
  await assert.rejects(o10Run(g, o10Spawn(child => { writeFileSync(g.trustedRoot, '{"root":"swapped"}\n'); o10Json(g.subject)(child); })),
    /^Error: provenance: trusted root changed during verification/);
  const h = o10Fixture();
  h.policy.trusted_root_sha256 = 'A'.repeat(64);
  await assert.rejects(o10Run(h, o10Spawn(o10Json(h.subject))), /^Error: provenance: policy trusted_root_sha256/);
});

test('O10-14 the policy digest covers every owner field; rebinding child_process.spawn cannot mint an authentic handle', async () => {
  const f = o10Fixture(), base = r2ProvenancePolicyDigest(f.policy);
  assert.match(base, /^[0-9a-f]{64}$/);
  for (const k of Object.keys(f.policy)) {
    const q = {...f.policy, [k]: k === 'run_attempt' ? 2 : `${f.policy[k]}x`};
    assert.notEqual(r2ProvenancePolicyDigest(q), base, k);
  }
  const cp = createRequire(import.meta.url)('node:child_process'), original = cp.spawn, fake = o10Spawn(o10Json(f.subject));
  cp.spawn = fake;
  syncBuiltinESMExports();
  let r;
  try { r = await o10Run(f, fake); } finally { cp.spawn = original; syncBuiltinESMExports(); }
  assert.equal(r.simulated, true, 'a spawn rebound after load is still an injected seam');
  assert.throws(() => readVerifiedHostedProvenance(r.handle), /simulated/);
});

// ---- R2 S7 (A-3): --verify-run re-verification from disk. Synthetic sealed runs only; nothing here is genuine evidence. ----
