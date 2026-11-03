import Link from 'next/link';
import {flowSteps,TONE} from '../lib/feature-states.mjs';
import StatusChip,{type Tone} from './ui/StatusChip';
// Honest product flow (T-P0-08): every step shows its real state on this deployment.
export default function FlowStrip(){
 return <ol className="flow-strip" aria-label="Product workflow and what works today">{flowSteps().map(s=><li key={s.label}><b aria-hidden="true">{s.n}</b><span className="flow-label">{s.label}</span><StatusChip tone={TONE[s.feature.state as keyof typeof TONE] as Tone}>{s.feature.chip}</StatusChip></li>)}<li className="flow-more"><Link className="textlink" href="/status">What works today</Link></li></ol>;
}
