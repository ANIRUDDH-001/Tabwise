import type {Metadata} from 'next';
import Link from 'next/link';
import Workspace from '../../components/Workspace';
import PageHeader from '../../components/ui/PageHeader';
import StatusChip from '../../components/ui/StatusChip';
import LocalJourneyBadge from '../../components/LocalJourneyBadge';
import {journeys} from '../../lib/journeys';
export const metadata:Metadata={title:'Journeys'};
export default function Journeys(){
 return <Workspace><PageHeader title="Pick a journey." purpose="Three keyboard journeys through Fernway, the owned sample app. Open one to record, reorder and save local versions. No account is needed." status={<StatusChip tone="ok">Recording available</StatusChip>}/>
  <ul className="journey-list picker">{journeys.map(j=><li key={j.id} className="journey-row"><span className="journey-icon" aria-hidden="true">{j.icon}</span><div><h2 className="journey-name">{j.name}</h2><p>{j.description}</p><p className="journey-meta">Flow <code>{j.flow}</code> · checks {j.symptom.toLowerCase()} · <LocalJourneyBadge id={j.id}/></p></div><Link className="button small" href={`/journeys/${j.id}/edit`} aria-label={`Open editor: ${j.name}`}>Open editor</Link></li>)}</ul>
  <p className="muted small-note">Drafts and local versions live only in this browser. To keep a version across devices, save it to your account from the editor.</p></Workspace>;
}
