import Link from 'next/link';
// Truthful state screen for owned pages when the API refuses (T-P0-04). Never offers sign-in when sign-in isn't configured.
export default function WorkspaceUnavailable({state,onRetry}:{state:{kind:string,title:string,message:string,actions:string[]},onRetry?:()=>void}){
 return <section className={`state-card state-${state.kind}`} role="status" aria-live="polite"><h2>{state.title}</h2><p>{state.message}</p><div className="actions">{state.actions.map((a,i)=>a==='signin'?<a key={a} className="button" href="/auth/login">Sign in with GitHub</a>:a==='demo'?<Link key={a} className={`button ${i===0?'':'secondary'}`} href="/w/demo">Open demo</Link>:a==='status'?<Link key={a} className="button secondary" href="/status">View status</Link>:onRetry?<button key={a} type="button" className={`button ${i===0?'':'secondary'}`} onClick={onRetry}>Try again</button>:null)}</div></section>;
}
