import { createHash } from 'node:crypto';
import { schemas } from './schemas.mjs';
import { LIMITS } from './limits.mjs';
export { CONTRACTS_VERSION, LIMITS, TIMELINE_LANES } from './limits.mjs';
export { PALETTE, TYPED_VALUES, JOURNEY_IDS, KEYS } from './palette.mjs';
export { schemas, metaDiagnosisSchema } from './schemas.mjs';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// Dependency-free evaluator for the keywords authored in this package, not a general JSON Schema engine.
function errorsFor(schema,value,path='$') {
  const errors=[];
  const error=message=>errors.push(`${path}: ${message}`);
  if(schema.anyOf && !schema.anyOf.some(s=>errorsFor(s,value,path).length===0)) error('anyOf');
  if(schema.allOf) for(const s of schema.allOf) errors.push(...errorsFor(s,value,path));
  if(schema.if) errors.push(...errorsFor(errorsFor(schema.if,value,path).length===0?schema.then:schema.else,value,path));
  if('const' in schema && !same(value,schema.const)) error('const');
  if(schema.enum && !schema.enum.some(x=>same(x,value))) error('enum');
  if(schema.type) {
    const valid=schema.type==='null'?value===null:schema.type==='array'?Array.isArray(value):schema.type==='object'?value!==null&&typeof value==='object'&&!Array.isArray(value):schema.type==='integer'?Number.isSafeInteger(value):schema.type==='number'?typeof value==='number'&&Number.isFinite(value):typeof value===schema.type;
    if(!valid) {error(`type ${schema.type}`);return errors;}
  }
  if(value!==null && typeof value==='object'&&!Array.isArray(value)) {
    for(const key of schema.required??[]) if(!Object.hasOwn(value,key)) error(`required ${key}`);
    if(schema.additionalProperties===false) for(const key of Object.keys(value)) if(!Object.hasOwn(schema.properties,key)) error(`unknown field ${key}`);
    for(const [key,s] of Object.entries(schema.properties??{})) if(Object.hasOwn(value,key)) errors.push(...errorsFor(s,value[key],`${path}.${key}`));
  }
  if(Array.isArray(value)) {
    if(value.length<(schema.minItems??0)||value.length>(schema.maxItems??Infinity)) error('array size');
    if(schema.uniqueItems && new Set(value.map(x=>JSON.stringify(x))).size!==value.length) error('uniqueItems');
    if(schema.items) value.forEach((v,i)=>errors.push(...errorsFor(schema.items,v,`${path}[${i}]`)));
  }
  if(typeof value==='string') {
    if([...value].length>(schema.maxLength??Infinity)) error('maxLength');
    if(schema.pattern && !new RegExp(schema.pattern,'u').test(value)) error('pattern');
  }
  if(typeof value==='number' && (value<(schema.minimum??-Infinity)||value>(schema.maximum??Infinity))) error('numeric bound');
  return errors;
}
export function validateContract(name,value) {
  if(!Object.hasOwn(schemas,name)) throw new Error(`unknown contract ${name}`);
  const errors=errorsFor(schemas[name],value);
  if(errors.length===0 && (name==='run-spec'||name==='journey')) {
    if(value.steps.some((s,i)=>s.step!==i+1)) errors.push('steps must be contiguous and ordered from 1');
    if(name==='run-spec' && (value.variant==='patched') !== Boolean(value.patch_ref)) errors.push('patch_ref required only for patched variant');
  }
  if(errors.length===0 && name==='diagnosis-output') {
    if(value.verdict==='barrier_found' && (!value.findings.length || value.abstention_reason!==null)) errors.push('barrier_found requires findings and no abstention');
    if(value.verdict!=='barrier_found' && value.findings.length) errors.push('abstention/no_barrier cannot contain findings');
    if(value.verdict==='insufficient_evidence' && !value.abstention_reason?.trim()) errors.push('explicit abstention reason required');
    if(value.verdict==='no_barrier' && value.abstention_reason!==null) errors.push('no_barrier is not an abstention');
  }
  if(errors.length===0 && name==='evidence-bundle') {
    const events=Object.values(value.lanes).flat();
    const refs=[...events,...value.axe].map(e=>e.evidence_ref);
    if(new Set(refs).size!==refs.length) errors.push('duplicate evidence reference');
    for(const e of value.lanes.speech) if(e.kind==='observed-silence' && (e.text!==null || !(e.duration_ms>0))) errors.push('silence requires positive window and null speech');
  }
  if(errors.length===0 && name==='verdict') {
    const c=value.checks;
    if(value.baseline_run_id===value.verify_run_id) errors.push('verification requires a distinct run');
    if(!c.evidence_complete && value.verdict!=='INCONCLUSIVE') errors.push('incomplete evidence requires INCONCLUSIVE');
    if(value.verdict==='FIXED' && !(c.symptom_gone===true&&c.other_steps_preserved===true)) errors.push('FIXED requires all checks');
    if(value.verdict==='REGRESSED' && c.other_steps_preserved!==false) errors.push('REGRESSED requires observed regression');
    if(value.verdict==='NOT_FIXED' && !(c.symptom_gone===false&&c.other_steps_preserved===true)) errors.push('NOT_FIXED requires preserved steps and remaining symptom');
  }
  return {ok:errors.length===0,errors};
}
export function assertContract(name,value) {
  const result=validateContract(name,value);
  if(!result.ok) throw new Error(`${name}: ${result.errors.join('; ')}`);
  return value;
}
function dispatchEnvelope(envelope) {
  if(!envelope || Object.keys(envelope).sort().join(',')!=='run_id,spec_b64,spec_sha256') throw new Error('unknown or missing dispatch field');
  if(Object.values(envelope).some(v=>typeof v!=='string')) throw new Error('dispatch strings required');
  if(JSON.stringify(envelope).length>LIMITS.DISPATCH_INPUT_CHARS) throw new Error('encoded dispatch input exceeds limit');
  if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(envelope.spec_b64)) throw new Error('invalid base64');
}
export function encodeSpec(spec) {
  assertContract('run-spec',spec);
  const bytes=Buffer.from(JSON.stringify(spec),'utf8');
  if(bytes.length>LIMITS.SPEC_JSON_BYTES) throw new Error('spec JSON exceeds limit');
  const envelope={run_id:spec.run_id,spec_b64:bytes.toString('base64'),spec_sha256:sha256(bytes)};
  dispatchEnvelope(envelope);return envelope;
}
export function decodeSpec(envelope) {
  dispatchEnvelope(envelope);
  const bytes=Buffer.from(envelope.spec_b64,'base64');
  if(bytes.length>LIMITS.SPEC_JSON_BYTES) throw new Error('spec JSON exceeds limit');
  if(sha256(bytes)!==envelope.spec_sha256) throw new Error('spec hash mismatch');
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  assertContract('run-spec',value);
  if(value.run_id!==envelope.run_id) throw new Error('run_id mismatch');
  return value;
}
export function validateDiagnosis(input,output) {
  const errors=[...validateContract('diagnosis-input',input).errors,...validateContract('diagnosis-output',output).errors];
  if(errors.length) return {ok:false,errors};
  const refs=new Set(input.evidence_refs);
  const observedRefs=new Set([...input.timeline.map(e=>e.evidence_ref),...input.signals.map(s=>s.id)]);
  if(input.evidence_refs.some(r=>!observedRefs.has(r))) errors.push('evidence reference lacks a supplied origin');
  for(const signal of input.signals) if(signal.refs.some(r=>!refs.has(r))) errors.push('signal references unknown evidence');
  for(const finding of output.findings) {
    if(finding.evidence_refs.some(r=>!refs.has(r))) errors.push('unknown evidence reference');
    const source=input.source.find(s=>s.path===finding.location.path);
    const {start_line:start,end_line:end}=finding.location;
    const lines=new Set(source?.lines.map(l=>l.n));
    if(!source || end<start || end-start>2000 || !Array.from({length:Math.min(2001,end-start+1)},(_,i)=>i+start).every(n=>lines.has(n))) errors.push('invalid source location');
    if(!input.journey.some(s=>s.step===finding.step)) errors.push('unknown journey step');
  }
  return {ok:errors.length===0,errors};
}
export function verifyManifest(manifest,files) {
  const errors=validateContract('artifact-manifest',manifest).errors;
  if(errors.length) return {ok:false,errors};
  const paths=manifest.files.map(f=>f.path);
  const evidence=manifest.files.filter(f=>f.kind==='evidence');
  if(evidence.length!==1 || evidence[0].sha256!==manifest.evidence_sha256) errors.push('manifest evidence digest mismatch');
  if(new Set(paths).size!==paths.length) errors.push('duplicate artifact path');
  if(Object.keys(files).some(p=>!paths.includes(p))) errors.push('unlisted artifact');
  let total=0;
  for(const f of manifest.files) {
    const bytes=files[f.path];
    if(!(bytes instanceof Uint8Array)) {errors.push(`missing artifact ${f.path}`);continue;}
    total+=bytes.byteLength;
    if(bytes.byteLength!==f.bytes || sha256(bytes)!==f.sha256) errors.push(`integrity mismatch ${f.path}`);
    if(f.kind==='screenshot'&&f.bytes>LIMITS.SCREENSHOT_BYTES) errors.push('screenshot cap');
    if(f.kind==='journal'&&f.bytes>LIMITS.JOURNAL_BYTES) errors.push('journal cap');
  }
  if(total>LIMITS.RUN_BYTES) errors.push('run byte cap');
  for(const stage of manifest.stage_timings) if(stage.finished_ms<stage.started_ms) errors.push('stage timing reversed');
  return {ok:errors.length===0,errors};
}
