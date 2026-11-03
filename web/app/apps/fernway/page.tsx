import type {Metadata} from 'next';
import Link from 'next/link';
import Workspace from '../../../components/Workspace';
import JourneyList from '../../../components/JourneyList';
import PageHeader from '../../../components/ui/PageHeader';
import StatusChip from '../../../components/ui/StatusChip';
export const metadata:Metadata={title:'Fernway sample app'};
export default function App(){return <Workspace><PageHeader title="Meet Fernway." purpose="A fictional rail booking app built as a test fixture. Three everyday interactions with healthy and broken variants. No real bookings, no customer data." status={<StatusChip tone="ok">Owned sample</StatusChip>} actions={<Link className="button" href="/journeys">Record a journey</Link>}/><h2 className="section-title">Journeys</h2><JourneyList/><section className="panel"><div className="panel-head"><h2>Explore the passenger form</h2><StatusChip tone="info">Broken variant · no NVDA session</StatusChip></div><iframe className="recorder-frame" title="Fernway passenger form, broken variant" src="/fernway?flow=passenger&variant=broken" sandbox="allow-scripts allow-same-origin allow-forms"/></section></Workspace>;}
