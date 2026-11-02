'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {breadcrumbsFor} from '../lib/site-navigation.mjs';
export default function Breadcrumbs({labels}:{labels?:Record<string,string>}){
 const crumbs=breadcrumbsFor(usePathname()??'/',labels??{});
 if(!crumbs.length)return null;
 return <nav aria-label="Breadcrumb" className="crumb"><ol>{crumbs.map((c,i)=><li key={`${c.label}-${i}`}>{c.href?<Link href={c.href}>{c.label}</Link>:<span aria-current="page">{c.label}</span>}</li>)}</ol></nav>;
}
