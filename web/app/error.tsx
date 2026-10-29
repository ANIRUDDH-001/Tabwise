'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main id="main" className="error-page"><h1>This view couldn’t load.</h1><p>Your saved evidence has not changed. Try loading the view again.</p><button className="button" onClick={reset}>Try again</button></main>;}
