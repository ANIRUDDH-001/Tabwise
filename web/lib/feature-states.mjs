// Canonical, truthful feature states for this deployment (T-P0-08). Presentational only: no gate is read or loosened here.
// state: 'available' | 'config' | 'gated' | 'off'
export const FEATURES=Object.freeze([
 {id:'recording',label:'Journey recording',state:'available',chip:'Available',reason:'Record, reorder and save keyboard journeys locally in this browser. No account needed.',href:'/journeys'},
 {id:'account-save',label:'Account save',state:'config',chip:'Needs sign-in setup',reason:'Saving to your account needs GitHub sign-in, which is not set up on every deployment.',href:'/status'},
 {id:'live-runs',label:'Live runs',state:'gated',chip:'Gated',reason:'Public screen-reader dispatch is gated. The owner’s isolated candidate captures are retained separately.',href:'/status'},
 {id:'spark',label:'Spark diagnosis',state:'off',chip:'Off',reason:'Public live diagnosis is off. The owner’s measured candidate retains its recorded model suggestion separately.',href:'/status'},
 {id:'verification',label:'Patch verification',state:'gated',chip:'Gated',reason:'Production-qualified verification is gated. The measured nonproduction candidate has its own labelled comparison.',href:'/status'},
]);
export const TONE={available:'ok',config:'info',gated:'gated',off:'off'};
export function feature(id){const f=FEATURES.find(x=>x.id===id);if(!f)throw Error(`unknown feature ${id}`);return f;}
// The product flow strip: each step paired with the feature that gates it.
export function flowSteps(){return [['Record a journey','recording'],['Capture evidence','live-runs'],['Diagnose with Spark','spark'],['Review & rerun','verification']].map(([label,id],i)=>({n:i+1,label,feature:feature(id)}));}
export function isUsable(id){return feature(id).state==='available';}
