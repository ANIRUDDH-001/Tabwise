import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import Workspace from '../../../../components/Workspace';
import Recorder from '../../../../components/Recorder';
import PageHeader from '../../../../components/ui/PageHeader';
import StatusChip from '../../../../components/ui/StatusChip';
import {journeys} from '../../../../lib/journeys';
export function generateStaticParams(){return journeys.map(j=>({id:j.id}));}
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{const {id}=await params;const journey=journeys.find(j=>j.id===id);return {title:journey?`Edit ${journey.name}`:'Journey not found'};}
export default async function Edit({params}:{params:Promise<{id:string}>}){const {id}=await params;const journey=journeys.find(j=>j.id===id);if(!journey)notFound();return <Workspace crumbs={{[journey.id]:journey.name}}><PageHeader title={journey.name} purpose="Turn the path through your app into a repeatable keyboard journey. Drafts autosave in this browser; save a hashed local version when it's ready." status={<StatusChip tone="ok">Editable · local</StatusChip>}/><Recorder id={id} flow={journey.flow}/></Workspace>;}
