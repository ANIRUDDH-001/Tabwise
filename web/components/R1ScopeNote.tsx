import r1 from '../data/r1.json';
import {r1View} from '../lib/r1-evidence.mjs';
// Visible scope note for every R1 surface (T-P0-10). Not a tooltip.
export default function R1ScopeNote({compact=false}:{compact?:boolean}){
 const v=r1View(r1);
 return <div className={`scope-note ${compact?'compact':''}`}><p><strong>Scope.</strong> {v.scope}</p>{v.passNotice&&<p className="muted">{v.passNotice}</p>}</div>;
}
