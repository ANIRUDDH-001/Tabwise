'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {primaryNavigation,topNavigation,activeHref,currentInList,sectionFor} from '../lib/site-navigation.mjs';

const sectionLabel:Record<string,string>={demo:'Demo',workspace:'Your workspace',status:'Status',public:''};

export default function TopNav(){
 const pathname=usePathname()??'/';
 const section=sectionFor(pathname);
 const [open,setOpen]=useState(false);
 const menuButton=useRef<HTMLButtonElement>(null);
 const drawer=useRef<HTMLElement>(null);
 const top=topNavigation();
 const topActive=activeHref(top.flatMap(g=>g.items.map(i=>i.href)),pathname);
 const groups=primaryNavigation();
 const drawerCurrent=currentInList(groups.flatMap(g=>g.items.map(i=>i.href)),pathname);
 function close(returnFocus:boolean){setOpen(false);if(returnFocus)requestAnimationFrame(()=>menuButton.current?.focus());}
 // Close on route change (refresh-safe: state is never stored in the URL).
 useEffect(()=>{setOpen(false);},[pathname]);
 useEffect(()=>{
  if(!open)return;
  drawer.current?.querySelector<HTMLElement>('a,button')?.focus();
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close(true);}};
  document.addEventListener('keydown',onKey);
  return()=>document.removeEventListener('keydown',onKey);
 },[open]);
 const demo=top.find(g=>g.id==='demo')!,status=top.find(g=>g.id==='status')!,work=top.find(g=>g.id==='workspace')!;
 const link=(href:string,label:string,className='')=><Link key={href} href={href} className={`${className} ${topActive===href?'active':''}`.trim()} aria-current={topActive===href?'page':undefined}>{label}</Link>;
 return <header className="topbar" aria-label="Tabwise">
  <Link className="wordmark" href="/" aria-current={pathname==='/'?'page':undefined}><span className="brandmark" aria-hidden="true"><i/><i/><i/></span>tabwise<span className="preview-badge">Preview</span></Link>
  {section!=='public'&&<span className="topbar-section" aria-hidden="true">{sectionLabel[section]}</span>}
  <nav aria-label="Main navigation" className="topnav">
   <div className={`navgroup ${section==='demo'?'current':''}`} aria-label="Demo, public, no account" role="group"><span className="navgroup-label" aria-hidden="true">Demo</span>{demo.items.map(i=>link(i.href,i.label))}</div>
   {status.items.map(i=>link(i.href,i.label,'navlink-status'))}
   <span className="navdivider" aria-hidden="true"/>
   {work.items.map(i=><Link key={i.href} href={i.href} className={`button small ${section==='workspace'?'':'secondary'}`} aria-current={topActive===i.href?'page':undefined}>{i.label}</Link>)}
  </nav>
  <button ref={menuButton} type="button" className="menu-button" aria-expanded={open} aria-controls="site-drawer" onClick={()=>open?close(false):setOpen(true)}><span className="menu-icon" aria-hidden="true"><i/><i/><i/></span>Menu</button>
  <div className={`drawer-backdrop ${open?'open':''}`} hidden={!open} onClick={()=>close(true)}/>
  <nav id="site-drawer" ref={drawer} className={`drawer ${open?'open':''}`} aria-label="Site menu" hidden={!open}>
   <div className="drawer-head"><span className="drawer-title">Navigate Tabwise</span><button type="button" className="iconbutton drawer-close" aria-label="Close menu" onClick={()=>close(true)}>×</button></div>
   {groups.map(group=><section key={group.id} className={`drawer-group ${section===group.id?'current':''}`} aria-labelledby={`drawer-${group.id}`}>
    <h2 id={`drawer-${group.id}`}>{group.label}<small>{group.note}</small></h2>
    <ul>{group.items.map(item=>{const current=drawerCurrent?.href===item.href;return <li key={item.href}><Link href={item.href} className={current?'active':''} aria-current={current&&drawerCurrent?.exact?'page':undefined}>{item.label}</Link></li>;})}</ul>
   </section>)}
  </nav>
 </header>;
}
