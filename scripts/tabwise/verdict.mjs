const normalize=text=>text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,'').replace(/\s+/g,' ').trim();
const subsequence=(before,after)=>{let i=0;for(const text of after)if(normalize(text)===normalize(before[i]??''))i++;return i===before.length;};
export function verificationVerdict(baseline,verify,finding){
 const result={verdict:'INCONCLUSIVE',checks:{symptom_gone:null,other_steps_preserved:null,evidence_complete:false},reason:'Complete qualified evidence from distinct runs is required.'};
 if(!baseline?.qualified||!verify?.qualified||!baseline.complete||!verify.complete||baseline.run_id===verify.run_id||!Array.isArray(baseline.steps)||!Array.isArray(verify.steps))return result;
 if(new Set(baseline.steps.map(s=>s.step)).size!==baseline.steps.length||new Set(verify.steps.map(s=>s.step)).size!==verify.steps.length)return result;
 if(baseline.steps.length!==verify.steps.length||baseline.steps.some((s,i)=>s.step!==verify.steps[i].step||!Array.isArray(s.speech)||!Array.isArray(verify.steps[i].speech)))return result;
 const affected=verify.steps.find(s=>s.step===finding.step);if(!affected)return result;
 const before=baseline.steps.find(s=>s.step===finding.step);
 const trigger={validation:'validation-error',status:'search-ready',focus:'dialog-close'}[finding.kind];
 if(!trigger||!before?.app_events?.includes(trigger)||!affected.app_events?.includes(trigger))return {...result,reason:'The required trigger event is missing from one of the runs.'};
 const expected={validation:'Enter a valid email address to continue.',status:'Your train search is ready.'}[finding.kind];
 if(expected&&before.speech.some(s=>normalize(s).includes(normalize(expected))))return {...result,reason:'The baseline does not establish the claimed missing announcement.'};
 if(finding.kind==='focus'&&before.focus_after==='choose-seat')return {...result,reason:'The baseline does not establish focus loss.'};
 let gone;
 if(finding.kind==='validation')gone=affected.app_events?.includes('validation-error')&&affected.speech.some(s=>normalize(s).includes(normalize('Enter a valid email address to continue.')));
 else if(finding.kind==='status')gone=affected.app_events?.includes('search-ready')&&affected.speech.some(s=>normalize(s).includes(normalize('Your train search is ready.')));
 else if(finding.kind==='focus')gone=affected.app_events?.includes('dialog-close')&&affected.focus_after==='choose-seat';
 else return {...result,reason:'Unsupported symptom; no model prediction is used as a check.'};
 if(gone===undefined)return {...result,reason:'Required symptom event was not collected.'};
 const preserved=baseline.steps.filter(s=>s.step!==finding.step).every(s=>subsequence(s.speech,verify.steps.find(v=>v.step===s.step).speech));
 return {verdict:!preserved?'REGRESSED':gone?'FIXED':'NOT_FIXED',checks:{symptom_gone:Boolean(gone),other_steps_preserved:preserved,evidence_complete:true},reason:!preserved?'Unaffected speech was lost.':gone?'Observed symptom disappeared and unaffected speech was preserved.':'The observed symptom remains.'};
}
