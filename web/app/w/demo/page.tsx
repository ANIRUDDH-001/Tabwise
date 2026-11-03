import type {Metadata} from 'next';
import Link from 'next/link';
import Workspace from '../../../components/Workspace';
import JourneyList from '../../../components/JourneyList';
import PageHeader from '../../../components/ui/PageHeader';
import StatusChip from '../../../components/ui/StatusChip';
import FlowStrip from '../../../components/FlowStrip';
import R1ScopeNote from '../../../components/R1ScopeNote';
import r1 from '../../../data/r1.json';
import {r1View} from '../../../lib/r1-evidence.mjs';
import pass from '../../../data/r1-pass.json';
import {r1PassView,passStatus} from '../../../lib/r1-pass.mjs';
export const metadata:Metadata={title:'Demo workspace'};
export default function Demo(){
 const v=r1View(r1,passStatus(pass)),p=r1PassView(pass);
 return <Workspace><PageHeader title="A journey, step by step." purpose="A public demo with sample data. Explore the sample app, prepare a keyboard journey, and inspect a genuine screen-reader trace." status={<StatusChip tone="info">Public demo · no account</StatusChip>} actions={<><Link className="button" href="/journeys">Record a journey</Link><Link className="button secondary" href={`/runs/${p.run_id}`}>Read the R1 transcript</Link></>}/>
  <FlowStrip/>
  <p className="demo-context">Start with a local keyboard recording in Fernway. The archived R1 evidence below comes from a separate sign-up fixture; it is not a live run of these journeys.</p>
  <div className="fernway-banner"><div className="fernway-logo" aria-hidden="true">fernway</div><div><h2>Your test app, with a destination.</h2><p>Rail booking · owned synthetic application · no real bookings</p></div><Link className="button secondary small" href="/apps/fernway">Explore the sample app</Link></div>
  <div className="section-heading"><h2 className="section-title">Journeys</h2><Link className="textlink" href="/journeys">All journeys</Link></div><JourneyList/>
  <section className="panel"><div className="panel-head"><h2>Recorded evidence</h2><StatusChip tone="info">R1 archive</StatusChip></div><table className="data-table stack"><thead><tr><th>Journey</th><th>Result</th><th>Source</th><th>Details</th></tr></thead><tbody><tr><td data-label="Journey">Successful R1 capture<small className="mono">{p.run_id}</small></td><td data-label="Result"><StatusChip tone="ok">PASS · {p.attempts} attempts × {p.steps} steps</StatusChip></td><td data-label="Source">Observed NVDA<small>A15 profile · sign-up fixture</small></td><td data-label="Details"><Link className="textlink" href={`/runs/${p.run_id}`}>Read the transcript</Link></td></tr><tr><td data-label="Journey">Diagnostic example: failed R1 run<small className="mono">{v.run_id}</small></td><td data-label="Result"><StatusChip tone="failed">{v.label}</StatusChip></td><td data-label="Source">Observed NVDA<small>Historical pre-A15 run</small></td><td data-label="Details"><Link className="textlink" href={`/runs/${v.run_id}`}>Inspect trace</Link> · <Link className="textlink" href="/r/r1-diagnostic">Report</Link></td></tr></tbody></table><div className="panel-body scope-pair"><R1ScopeNote variant="pass" acks={p.acks}/><R1ScopeNote pass={passStatus(pass)}/></div></section></Workspace>;
}
