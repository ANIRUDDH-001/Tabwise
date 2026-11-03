'use client';
import Link from 'next/link';
export default function ErrorPage({reset}:{reset:()=>void}){return <main id="main" className="error-page"><p className="eyebrow">Something went wrong</p><h1>This view couldn’t load.</h1><p>Your saved evidence has not changed. Try loading the view again, or go somewhere that works.</p><div className="actions"><button type="button" className="button" onClick={reset}>Try again</button><Link className="button secondary" href="/w/demo">Open the demo</Link><Link className="button secondary" href="/w/me">Your workspace</Link></div></main>;}
