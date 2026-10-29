import Link from 'next/link';
export default function Missing(){return <main id="main" className="error-page"><h1>There’s no record here.</h1><p>The journey, run or report you requested isn’t available.</p><Link className="button" href="/w/demo">Return to the workspace</Link></main>;}
