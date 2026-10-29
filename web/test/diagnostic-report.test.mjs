import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildDiagnosticReport} from '../lib/server/diagnostic-report.mjs';
import {sha256} from '../../packages/contracts/index.mjs';
const sample=()=>({run:{id:'owned-run',created_at:'2026-10-29T00:00:00Z',spec_sha256:'a'.repeat(64),user_id:'omit-me',spec:{private:'omit-me'}},stored:{complete:false,classification:'INCONCLUSIVE',evidence:{run_id:'owned-run',provenance:'observed-nvda',lanes:{keys:[],focus:[],speech:[],app_events:[],screenshots:[]}},runner:{profile:'A15'},manifest_sha256:'b'.repeat(64),artifacts:[],files:{private:Buffer.from('omit-me')}},findings:[],diagnoses:[],patches:[]});
test('diagnostic report is content-hashed and retains incomplete provenance without a repair verdict',()=>{
 const result=buildDiagnosticReport(sample());assert.equal(result.sha256,sha256(JSON.stringify(result.snapshot)));assert.equal(result.snapshot.verification.verdict,null);assert.equal(result.snapshot.observation,'INCONCLUSIVE');assert.equal(JSON.stringify(result).includes('omit-me'),false);
});
test('complete capture and approved patch still cannot become a verified repair',()=>{
 const value=sample();value.stored.complete=true;value.stored.classification='COMPLETE_OBSERVATION';value.patches=[{id:'p',status:'approved',reviewed_at:'2026-10-29T00:00:00Z'}];assert.equal(buildDiagnosticReport(value).snapshot.verification.status,'pending');
});
test('report refuses absent, foreign and synthetic capture',()=>{
 for(const change of [s=>s.stored=null,s=>s.stored.evidence.run_id='foreign',s=>s.stored.evidence.provenance='synthetic-test']){const value=sample();change(value);assert.throws(()=>buildDiagnosticReport(value));}
});
