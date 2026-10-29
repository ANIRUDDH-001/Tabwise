import { test } from 'node:test';
import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import { schemas, metaDiagnosisSchema } from '../schemas.mjs';
import { fixtures } from '../fixtures.mjs';
import { CONTRACTS_VERSION, validateContract, encodeSpec, decodeSpec, sha256, validateDiagnosis, verifyManifest } from '../index.mjs';
import { LIMITS, TIMELINE_LANES } from '../limits.mjs';
import { PALETTE } from '../palette.mjs';

const ajv = new Ajv2020({ strict:true, allErrors:true });

test('version, lanes and bounded resources match owner decisions', () => {
  assert.equal(CONTRACTS_VERSION, '0.1.0');
  assert.deepEqual(TIMELINE_LANES, ['keys','focus','speech','app_events','screenshots']);
  assert.equal(LIMITS.LOCAL_CAP_NANO + LIMITS.HOSTED_CAP_NANO, 100e9);
  assert.equal(LIMITS.HOSTED_CALL_CAP_NANO, 100e6);
});

for (const name of ['journey','run-spec','artifact-manifest','evidence-bundle','diagnosis-input','diagnosis-output','patch','verdict']) {
  test(`${name}: positive and negative fixtures, Ajv and runtime agree`, () => {
    const validate = ajv.compile(schemas[name]);
    assert.equal(validate(fixtures[name].valid), true, JSON.stringify(validate.errors));
    assert.equal(validateContract(name, fixtures[name].valid).ok, true);
    for (const {value, keyword} of fixtures[name].invalid) {
      assert.equal(validate(value), false);
      assert.ok(validate.errors.some(e => e.keyword === keyword), JSON.stringify(validate.errors));
      assert.equal(validateContract(name, value).ok, false);
    }
    assert.equal(validate({...fixtures[name].valid, unexpected:true}), false);
    assert.equal(validateContract(name, {...fixtures[name].valid, unexpected:true}).ok, false);
  });
}

test('nested unknown fields and non-palette typed text fail closed', () => {
  const spec = structuredClone(fixtures['run-spec'].valid);
  spec.steps[0].private_text = 'secret';
  assert.equal(validateContract('run-spec',spec).ok, false);
  delete spec.steps[0].private_text;
  spec.steps[0].key = 'type'; spec.steps[0].text = 'private@example.org';
  assert.equal(validateContract('run-spec',spec).ok, false);
  spec.steps[0].text = PALETTE.email;
  assert.equal(validateContract('run-spec',spec).ok, true);
});

test('encoding hashes exact UTF-8 bytes and validates the dispatch envelope on decode', () => {
  const spec = fixtures['run-spec'].valid;
  const encoded = encodeSpec(spec);
  assert.equal(encoded.spec_sha256, sha256(Buffer.from(encoded.spec_b64, 'base64')));
  assert.deepEqual(decodeSpec(encoded), spec);
  assert.throws(()=>decodeSpec({...encoded,spec_sha256:'0'.repeat(64)}), /hash/);
  assert.throws(()=>decodeSpec({...encoded,run_id:'00000000-0000-4000-8000-000000000099'}), /run_id/);
  assert.throws(()=>decodeSpec({...encoded,spec_b64:encoded.spec_b64+'!'}), /base64/);
  assert.throws(()=>decodeSpec({...encoded,extra:'private'}), /unknown/);
  // Below the raw JSON limit but above the actual encoded workflow input limit.
  const oversized = {run_id:spec.run_id,spec_b64:Buffer.from(' '.repeat(50000)).toString('base64'),spec_sha256:'0'.repeat(64)};
  assert.throws(()=>decodeSpec(oversized), /encoded/);
});

test('Meta schema uses a separately enforced strict subset', () => {
  const allowed = new Set(['type','properties','required','additionalProperties','items','enum','anyOf']);
  function visit(s) {
    for(const key of Object.keys(s)) assert.ok(allowed.has(key), key);
    if(s.type === 'object') {
      assert.equal(s.additionalProperties,false);
      assert.deepEqual([...s.required].sort(),Object.keys(s.properties).sort());
      Object.values(s.properties).forEach(visit);
    }
    if(s.items) visit(s.items);
    s.anyOf?.forEach(visit);
  }
  assert.equal(metaDiagnosisSchema.type,'object'); visit(metaDiagnosisSchema);
  assert.ok(schemas['diagnosis-output'].$id);
  assert.equal(metaDiagnosisSchema.$id,undefined);
});

test('diagnosis rejects unknown refs, invalid source lines and contradictory abstention', () => {
  const input=fixtures['diagnosis-input'].valid;
  const output=structuredClone(fixtures['diagnosis-output'].valid);
  assert.equal(validateDiagnosis(input,output).ok,true);
  output.findings[0].evidence_refs=['absent'];
  assert.match(validateDiagnosis(input,output).errors.join(' '), /reference/);
  output.findings[0].evidence_refs=[input.evidence_refs[0]];
  output.findings[0].location.end_line=999;
  assert.match(validateDiagnosis(input,output).errors.join(' '), /source/);
  output.verdict='insufficient_evidence';
  assert.equal(validateDiagnosis(input,output).ok,false);
});

test('manifest integrity checks hashes, missing/extra files, total bytes and screenshot limits', () => {
  const files={'evidence.json':Buffer.from('{}')};
  const manifest=structuredClone(fixtures['artifact-manifest'].valid);
  assert.equal(verifyManifest(manifest,files).ok,true);
  assert.equal(verifyManifest(manifest,{'evidence.json':Buffer.from('tampered')}).ok,false);
  assert.equal(verifyManifest(manifest,{...files,'extra.json':Buffer.from('{}')}).ok,false);
  assert.equal(verifyManifest(manifest,{}).ok,false);
  manifest.files[0].path='../escape';
  assert.equal(validateContract('artifact-manifest',manifest).ok,false);
});

test('four verdicts are accepted, model outputs cannot attest to execution safety', () => {
  const checks={FIXED:{symptom_gone:true,other_steps_preserved:true,evidence_complete:true},NOT_FIXED:{symptom_gone:false,other_steps_preserved:true,evidence_complete:true},REGRESSED:{symptom_gone:true,other_steps_preserved:false,evidence_complete:true},INCONCLUSIVE:{symptom_gone:null,other_steps_preserved:null,evidence_complete:false}};
  for(const verdict of ['FIXED','NOT_FIXED','REGRESSED','INCONCLUSIVE'])
    assert.equal(validateContract('verdict',{...fixtures.verdict.valid,verdict,checks:checks[verdict]}).ok,true);
  const b=structuredClone(fixtures['evidence-bundle'].valid);
  b.guarded_execution_verified=true;
  assert.equal(validateContract('evidence-bundle',b).ok,false);
});
