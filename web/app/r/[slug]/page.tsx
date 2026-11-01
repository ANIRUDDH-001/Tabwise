import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import Link from 'next/link';
import PrintReport from '../../../components/PrintReport';
import Workspace from '../../../components/Workspace';
import R1ScopeNote from '../../../components/R1ScopeNote';
import StatusChip from '../../../components/ui/StatusChip';
import r1 from '../../../data/r1.json';
import {validateSnapshot} from '../../../lib/snapshot.mjs';
import {r1View} from '../../../lib/r1-evidence.mjs';
import pass from '../../../data/r1-pass.json';
import {passStatus} from '../../../lib/r1-pass.mjs';
export function generateStaticParams(){return [{slug:'r1-diagnostic'}];}
export const metadata:Metadata={title:'R1 diagnostic report'};
export default async function Report({params}:{params:Promise<{slug:string}>}){if((await params).slug!=='r1-diagnostic')notFound();if(!validateSnapshot(r1).ok)throw Error('Snapshot integrity failed');const v=r1View(r1);return <Workspace><article className="report"><StatusChip tone="failed">{v.label} · not a verified fix</StatusChip><h1 className="report-title">Every claim has a source.</h1><p className="muted">This public report preserves a historical capture failure. It does not establish a Fernway finding, a model diagnosis or a successful repair.</p><R1ScopeNote pass={passStatus(pass)}/><section className="panel"><div className="panel-head"><h2>Observed session speech</h2><span className="chip purple">Observed · L4</span></div><div className="panel-body"><blockquote className="quote speech-quote">“{r1.raw[0]}”</blockquote></div></section><h2>Why the run stopped</h2><p>{r1.reason}</p><section className="panel"><div className="panel-head"><h2>Provenance</h2></div><div className="panel-body"><dl className="provenance"><dt>Run</dt><dd className="mono">{r1.run_id}</dd><dt>GitHub source</dt><dd><a className="textlink" href={r1.github_url}>Run {r1.github_run_id}</a></dd><dt>Recorded interval</dt><dd>{r1.started} → {r1.finished}</dd><dt>Model provenance</dt><dd>Not run. No model output, usage or cost asserted.</dd><dt>Scope</dt><dd>R1 sign-up fixture · historical pre-A15 run</dd><dt>Snapshot SHA256</dt><dd className="mono">{r1.snapshot_sha256}</dd></dl></div></section><h2>Source references</h2><dl className="provenance">{r1.files.map(file=><div key={file.path} className="contents"><dt>{file.path}</dt><dd className="mono">{file.sha256}<br/>{file.bytes} source bytes</dd></div>)}</dl><h2>Limitations</h2><ul className="limitations">{r1.limitations.map(s=><li key={s}>{s}</li>)}</ul><div className="actions"><PrintReport/><Link className="button secondary" href={`/runs/${r1.run_id}`}>Back to the evidence trace</Link><Link className="button quiet" href="/w/demo">Back to the demo</Link></div><p className="muted small-note">Immutable snapshot in this build. Use your browser’s print command to save this report.</p></article></Workspace>;}
