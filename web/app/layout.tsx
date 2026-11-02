import type {Metadata} from 'next';
import Link from 'next/link';
import TopNav from '../components/TopNav';
import './globals.css';
export const metadata:Metadata={title:{default:'Tabwise — hear the whole journey',template:'%s · Tabwise'},description:'Inspect keyboard journeys, real screen-reader evidence and the path from a finding to a checked fix.'};
export default function Layout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body><a className="skip" href="#main">Skip to content</a><TopNav/>{children}<footer className="footer" aria-label="Tabwise project"><Link className="wordmark" href="/">tabwise</Link><p>Hear what happens between the clicks.</p><nav aria-label="Footer" className="footer-links"><Link href="/w/demo">Demo</Link><Link href="/w/me">Your workspace</Link><Link href="/status">Status</Link></nav><span>Owned sample apps. NVDA A15 coverage only.</span></footer></body></html>;
}
