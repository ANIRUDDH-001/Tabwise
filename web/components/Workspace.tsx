'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {primaryNavigation,currentInList,sectionFor} from '../lib/site-navigation.mjs';
import Breadcrumbs from './Breadcrumbs';
const icons:Record<string,string>={'/w/me':'◫','/w/me/journeys':'⌘','/w/me/runs':'≋','/w/me/reports':'▤','/w/demo':'◫','/apps/fernway':'⌁','/journeys':'⌘','/r/r1-diagnostic':'▤','/status':'◌'};
// Shared application shell: sidebar (≥741px) + breadcrumbs + main. Active state comes only from the pathname (REV-05).
export default function Workspace({children,crumbs}:{children:React.ReactNode,crumbs?:Record<string,string>,owned?:boolean,active?:string}){
 const pathname=usePathname()??'/';
 const section=sectionFor(pathname);
 const groups=primaryNavigation();
 const current=currentInList(groups.flatMap(g=>g.items.map(i=>i.href)),pathname);
 return <div className="workspace"><aside className="sidebar" aria-label="Section navigation"><nav aria-label="Sections">{groups.map(group=><div key={group.id} className={`side-group ${section===group.id?'current':''}`}><div className="nav-group">{group.label}<small>{group.note}</small></div>{group.items.map(item=>{const on=current?.href===item.href;return <Link key={item.href} className={`navlink ${on?'active':''}`} href={item.href} aria-current={on&&current?.exact?'page':undefined}><span aria-hidden="true">{icons[item.href]??'≋'}</span>{item.label}</Link>;})}</div>)}</nav><div className="sidebar-bottom">Real evidence carries its source.<br/>Missing evidence stays visible.</div></aside><main aria-label={section==='workspace'?'Your workspace':section==='demo'?'Demo':'Tabwise'} id="main" className="workspace-main" tabIndex={-1}><Breadcrumbs labels={crumbs}/>{children}</main></div>;
}
