import type {Metadata} from 'next';
import Link from 'next/link';
import './globals.css';
export const metadata:Metadata={title:{default:'Tabwise — hear the whole journey',template:'%s · Tabwise'},description:'Inspect keyboard journeys, real screen-reader evidence and the path from a finding to a checked fix.'};
export default function Layout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body><a className="skip" href="#main">Skip to content</a><header className="topbar" aria-label="Tabwise"><Link className="wordmark" href="/"><span className="brandmark" aria-hidden="true"><i/><i/><i/></span>tabwise<span className="preview-badge">Preview</span></Link><nav aria-label="Main navigation"><Link href="/w/demo">Demo workspace</Link><Link href="/journeys/fernway-passenger/edit">Journey editor</Link><Link href="/status">Status</Link></nav><Link className="button small" href="/w/me">Your workspace <span aria-hidden="true">↗</span></Link></header>{children}<footer className="footer" aria-label="Tabwise project"><Link className="wordmark" href="/">tabwise</Link><p>Hear what happens between the clicks.</p><span>Owned sample apps. NVDA A15 coverage only.</span></footer></body></html>;
}
