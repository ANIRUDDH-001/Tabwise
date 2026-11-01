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
export const metadata:Metadata={title:'Demo workspace'};
export default function Demo(){
 const v=r1View(r1);
 return <Workspace><PageHeader title="A journey worth hearing." purpose="A public demo with sample data. Explore the sample app, prepare a keyboard journey, and inspect a genuine screen-reader trace." status={<StatusChip tone="info">Public demo · no account</StatusChip>} actions={<><Link className="button" href="/journeys">Record a journey</Link><Link className="button secondary" href={`/runs/${v.run_id}`}>Inspect the R1 trace</Link></>}/>
  <FlowStrip/>
  <div className="fernway-banner"><div className="fernway-logo" aria-hidden="true">fernway</div><div><h2>Your test app, with a destination.</h2><p>Rail booking · owned synthetic application · no real bookings</p></div><Link className="button secondary small" href="/apps/fernway">Explore the sample app</Link></div>
  <div className="section-heading"><h2 className="section-title">Journeys</h2><Link className="textlink" href="/journeys">All journeys</Link></div><JourneyList/>
  <section className="panel"><div className="panel-head"><h2>Recorded evidence</h2><StatusChip tone="info">R1 archive</StatusChip></div><table className="data-table stack"><thead><tr><th>Journey</th><th>Result</th><th>Source</th><th>Details</th></tr></thead><tbody><tr><td data-label="Journey">Diagnostic example: failed R1 run<small className="mono">{v.run_id}</small></td><td data-label="Result"><StatusChip tone="failed">{v.label}</StatusChip></td><td data-label="Source">Observed NVDA<small>Historical pre-A15 run</small></td><td data-label="Details"><Link className="textlink" href={`/runs/${v.run_id}`}>Inspect trace</Link> · <Link className="textlink" href="/r/r1-diagnostic">Report</Link></td></tr></tbody></table><div className="panel-body"><R1ScopeNote/></div></section></Workspace>;
}
