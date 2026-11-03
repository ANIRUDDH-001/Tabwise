// Card / section (C.4): consistent padding, section heading, optional status.
export default function Panel({title,status,children,id,level=2,bodyless=false}:{title?:React.ReactNode,status?:React.ReactNode,children?:React.ReactNode,id?:string,level?:2|3,bodyless?:boolean}){
 const Heading=level===3?'h3':'h2';
 return <section className="panel" id={id} aria-labelledby={id&&title?`${id}-title`:undefined}>{title&&<div className="panel-head"><Heading id={id?`${id}-title`:undefined}>{title}</Heading>{status}</div>}{bodyless?children:<div className="panel-body">{children}</div>}</section>;
}
