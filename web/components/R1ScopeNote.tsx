import r1 from '../data/r1.json';
import {r1View,R1_SCOPE_NOTE} from '../lib/r1-evidence.mjs';
// Visible scope note for every R1 surface (T-P0-10). Not a tooltip. `pass` is the server-side PASS validation result.
export default function R1ScopeNote({compact=false,variant='failed',pass=null,acks}:{compact?:boolean,variant?:'failed'|'pass',pass?:{validated:boolean,result:string}|null,acks?:string}){
 if(variant==='pass')return <div className={`scope-note ${compact?'compact':''}`}><p><strong>Scope.</strong> {R1_SCOPE_NOTE}</p>{acks&&<p className="muted">{acks}</p>}</div>;
 const v=r1View(r1,pass);
 return <div className={`scope-note ${compact?'compact':''}`}><p><strong>Scope.</strong> {v.scope}</p>{v.passNotice&&<p className="muted">{v.passNotice}</p>}</div>;
}
