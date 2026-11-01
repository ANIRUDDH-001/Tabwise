// Empty state (C.4): title, one-sentence reason, next action.
export default function EmptyState({title,reason,action,headingLevel=3}:{title:string,reason:React.ReactNode,action?:React.ReactNode,headingLevel?:2|3}){
 const Heading=headingLevel===2?'h2':'h3';
 return <div className="empty-state"><Heading>{title}</Heading><p>{reason}</p>{action&&<div className="actions">{action}</div>}</div>;
}
