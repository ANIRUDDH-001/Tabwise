import Link from 'next/link';
import pass from '../data/r1-pass.json';
import {r1PassView} from '../lib/r1-pass.mjs';
import R1ScopeNote from './R1ScopeNote';
import PrintReport from './PrintReport';
import PageHeader from './ui/PageHeader';
import StatusChip from './ui/StatusChip';
// Successful R1 capture (T-P0-10 Step 2a). Server component: renders only from the validated public snapshot.
export default function PassRunDetail(){
 const v=r1PassView(pass),g=pass.send_guard;
 return <article className="report pass-report"><PageHeader title="Hear a whole journey." purpose="A successful R1 capture: real NVDA speech for every step of a synthetic sign-up journey, recorded three times from a fresh start." status={<StatusChip tone="ok">{v.label} · A15 profile</StatusChip>}/>
  <R1ScopeNote variant="pass" acks={v.acks}/>
  <dl className="run-stats" aria-label="Run summary"><div><dt>Attempts</dt><dd>{v.attempts}<small>completed, fresh</small></dd></div><div><dt>Steps per attempt</dt><dd>{v.steps}<small>no timeouts or errors</small></dd></div><div><dt>Key sends</dt><dd>{g.sends}<small>{g.acks.confirmed} confirmed · {g.acks.unconfirmable} unconfirmable</small></dd></div><div><dt>Misdelivered</dt><dd>{g.misdelivered?'yes':'0'}<small>{g.refused} refused · {g.unsettled} unsettled</small></dd></div></dl>
  <section className="panel"><div className="panel-head"><h2>What NVDA said, step by step</h2><span className="chip purple">Observed · attempt 1</span></div><ol className="speech-steps">{v.speech.map((s:{step:number,keys:string,speech:string})=><li key={s.step}><span className="key">{s.keys}</span><blockquote className="quote">“{s.speech}”</blockquote></li>)}</ol></section>
  <section className="panel"><div className="panel-head"><h2>Provenance</h2></div><div className="panel-body"><dl className="provenance"><dt>Run</dt><dd className="mono">{pass.run_id}</dd><dt>GitHub source</dt><dd><a className="textlink" href={pass.github_url}>Run {pass.github_run_id}</a></dd><dt>Artifact</dt><dd className="mono">{pass.artifact_name} · id {pass.artifact_id}</dd><dt>Artifact ZIP SHA256</dt><dd className="mono">{pass.archive_sha256}</dd><dt>Source commit</dt><dd className="mono">{pass.source_commit}</dd><dt>Recorded interval</dt><dd>{pass.started} → {pass.finished}</dd><dt>Profile</dt><dd>{pass.profile} · browse mode off on page load</dd><dt>Fixture</dt><dd>{pass.fixture}</dd><dt>Model provenance</dt><dd>Not run. No model output, usage or cost asserted.</dd><dt>Public snapshot SHA256</dt><dd className="mono">{pass.snapshot_sha256}</dd></dl></div></section>
  <h2>Source file digests</h2><dl className="provenance">{Object.entries(pass.source_hashes).map(([path,hash])=><div key={path} className="contents"><dt>{path}</dt><dd className="mono">{hash}</dd></div>)}</dl>
  <h2>Limitations</h2><ul className="limitations">{pass.limitations.map(s=><li key={s}>{s}</li>)}</ul>
  <div className="actions"><PrintReport/><Link className="button secondary" href="/w/demo">Back to the demo</Link><Link className="button quiet" href="/runs/r1-20261028T134638Z">Diagnostic example: failed R1 run</Link></div>
  <p className="muted small-note">Public summary of a validated artifact. Raw focus and send logs, process identifiers and runner metadata are not published.</p></article>;
}
