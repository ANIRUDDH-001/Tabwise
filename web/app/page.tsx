import Link from 'next/link';
import r1 from '../data/r1.json';
import JourneyList from '../components/JourneyList';
import FlowStrip from '../components/FlowStrip';
import R1ScopeNote from '../components/R1ScopeNote';
import StatusChip from '../components/ui/StatusChip';
import pass from '../data/r1-pass.json';
import {r1PassView} from '../lib/r1-pass.mjs';
export default function Home(){
 const p=r1PassView(pass);
 return <main id="main" tabIndex={-1}><section className="hero"><div><span className="release"><span className="dot"/> Built for the journey, beyond the scan</span><h1>What does your<br/>app sound like?</h1><p className="lead">Follow the keys. Hear the screen reader. Find the moment a journey breaks.</p><div className="actions"><Link className="button" href="/w/demo">Open the demo <span aria-hidden="true">→</span></Link><Link className="button secondary" href="/w/me">Your workspace</Link></div><p className="hero-note">Recording works in your browser today. Live runs, Spark diagnosis and repair verification are gated — <Link className="textlink" href="/status">see what works</Link>.</p></div>
  <div className="speech-window"><div className="window-top"><span className="window-dots" aria-hidden="true"><i/><i/><i/></span><span>Inside a real screen-reader session</span><span>NVDA</span></div><div className="speech-body"><div className="speech-label">The screen reader said <span className="chip purple">Observed · L4</span></div><blockquote>“{p.quote}”</blockquote><div className="trace-row"><span className="key">Enter</span><span>Step 9 of {p.steps}, after confirming the dialog. Every step was captured in {p.attempts} fresh attempts.</span></div><StatusChip tone="ok">{p.label} · A15 profile</StatusChip></div><div className="speech-footer"><span>R1 sign-up fixture · not Fernway</span><Link className="textlink" href={`/runs/${p.run_id}`}>Hear every step</Link></div></div></section>
  <div className="hero-scope"><R1ScopeNote compact variant="pass" acks={p.acks}/><p className="muted small-note">Also kept: a <Link className="textlink" href={`/runs/${r1.run_id}`}>diagnostic example of a failed R1 run</Link>.</p></div>
  <FlowStrip/>
  <section className="product-section"><div className="section-heading"><div><h2>Small moments.<br/>The whole journey at stake.</h2></div><p>Explore Fernway, our fictional rail booking app. Each journey tests something a static scan can miss. No real bookings. No customer data.</p></div><JourneyList/></section></main>;
}
