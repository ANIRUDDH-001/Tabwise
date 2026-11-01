// One page-header pattern (C.4): h1 → one-line purpose → status → primary action. One h1 per page.
export default function PageHeader({title,purpose,status,actions}:{title:React.ReactNode,purpose?:React.ReactNode,status?:React.ReactNode,actions?:React.ReactNode}){
 return <header className="page-title"><div><h1>{title}</h1>{purpose&&<p>{purpose}</p>}{actions&&<div className="actions page-actions">{actions}</div>}</div>{status&&<div className="page-status">{status}</div>}</header>;
}
