import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from '@playwright/test';
import {sha256} from '../packages/contracts/index.mjs';
import {validatePatchProposal} from '../src/repair/patch.mjs';
import {consumePatchedSource} from '../src/repair/rerun.mjs';
import {stagePatchedWorkerSource} from '../scripts/tabwise/repair-source.mjs';
import {liveGate} from '../scripts/tabwise/worker.mjs';
// Newly authored synthetic offline fixture. No NVDA observation or real withheld evaluation claimed.
const base=`<label for="email">Email</label><input id="email"><button type="button" onclick="document.getElementById('error').textContent='Enter a valid email address to continue.'">Continue</button>
<p id="error"></p>
<button>Help</button>
`;
function sample(correct=true){const replacement=correct?'<p id="error" role="alert"></p>':'<p id="error" class="red"></p>';const proposal={diff:`--- a/index.html
+++ b/index.html
@@ -2,1 +2,1 @@
-<p id="error"></p>
+${replacement}
`,rationale:'Synthetic development proposal',expected_speech_after:[]};const id='00000000-0000-4000-8000-000000000001',verify='00000000-0000-4000-8000-000000000002',steps=[{step:1,key:'Tab',text:null,checkpoint:true}];const checked=validatePatchProposal({runId:id,source:base,baseSha256:sha256(base),evidenceRefs:['speech:1'],knownEvidenceRefs:['speech:1'],proposal});assert.equal(checked.ok,true);const source=checked.patched['index.html'];const baseline={id,user_id:'owner',journey_id:'fernway-passenger',status:'completed',evidence_status:'complete',spec:{app_hash:sha256(base),steps}};const patch={id:'patch',run_id:id,status:'approved',reviewed_by:'owner',diff:proposal.diff,validator:{ok:true,contract:checked.contract}};const application={id:'candidate',user_id:'owner',run_id:id,patch_id:patch.id,base_sha256:sha256(base),patch_sha256:sha256(patch.diff),source_sha256:sha256(source),source,base_source:base};const binding={verify_run_id:verify,baseline_run_id:id,application_id:application.id,source_sha256:application.source_sha256,patch_sha256:application.patch_sha256,user_id:'owner'};const spec={version:'0.1.0',run_id:verify,journey_id:baseline.journey_id,variant:'patched',patch_ref:application.patch_sha256,app_hash:application.source_sha256,steps};return {spec,application,patch,baseline,binding,baseSource:base};}
test('consumer binds exact base, patch, candidate, journey and distinct rerun identity',()=>{const a=sample(),out=consumePatchedSource(a);assert.equal(sha256(out.files['index.html']),a.spec.app_hash);assert.equal(out.qualified,false);for(const mutate of [a=>a.application.source+='x',a=>a.baseSource+='x',a=>a.patch.diff+='x',a=>a.patch.status='rejected',a=>a.binding.application_id='other',a=>a.binding.user_id='intruder',a=>a.spec.steps=[{...a.spec.steps[0],key:'Enter'}],a=>a.baseline.evidence_status='incomplete',a=>a.spec.run_id=a.baseline.id,a=>a.application.base_sha256='0'.repeat(64)]){const bad=sample();mutate(bad);assert.throws(()=>consumePatchedSource(bad));}});
test('worker stages only exact candidate bytes; malformed input refuses before a directory is produced',async()=>{const a=sample(),dir=await mkdtemp(join(tmpdir(),'r3-test-')),bundlePath=join(dir,'bundle.json');await writeFile(bundlePath,JSON.stringify(a));const out=await stagePatchedWorkerSource({spec:a.spec,bundlePath});assert.equal(await readFile(join(out.root,'index.html'),'utf8'),a.application.source);a.application.source+='tamper';await writeFile(bundlePath,JSON.stringify(a));await assert.rejects(()=>stagePatchedWorkerSource({spec:a.spec,bundlePath}));});
test('offline held-out task oracle distinguishes rescue and wrong patch without producing NVDA evidence',async()=>{const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();async function task(source){await page.setContent(source);await page.getByLabel('Email',{exact:true}).fill('invalid');await page.getByRole('button',{name:'Continue',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Help',exact:true}).count(),1);return await page.getByRole('alert').filter({hasText:'Enter a valid email address to continue.'}).count()===1;}assert.equal(await task(base),false);assert.equal(await task(consumePatchedSource(sample(true)).files['index.html']),true);assert.equal(await task(consumePatchedSource(sample(false)).files['index.html']),false);}finally{await browser.close();}});
test('existing live execution gate remains a hard stop on this offline host',()=>{assert.throws(()=>liveGate({},'0'.repeat(40)),/BLOCK|GitHub|runner|workflow/i);});
