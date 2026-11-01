// Polite live region for save/progress feedback (C.4).
export default function InlineStatus({children,tone='info',id}:{children?:React.ReactNode,tone?:'info'|'ok'|'warning',id?:string}){
 return <p id={id} role="status" aria-live="polite" className={`inline-status ${children?`is-${tone}`:'is-empty'}`}>{children}</p>;
}
