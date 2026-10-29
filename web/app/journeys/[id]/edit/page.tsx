import {notFound} from 'next/navigation';
import Workspace from '../../../../components/Workspace';
import Recorder from '../../../../components/Recorder';
import {journeys} from '../../../../lib/journeys';
export function generateStaticParams(){return journeys.map(j=>({id:j.id}));}
export default async function Edit({params}:{params:Promise<{id:string}>}){const {id}=await params;const journey=journeys.find(j=>j.id===id);if(!journey)notFound();return <Workspace active="Journeys"><div className="crumb">Fernway / Journeys / {journey.name}</div><div className="page-title"><div><h1>{journey.name}</h1><p>Turn the path through your app into a repeatable keyboard journey. Save an immutable, hashed local version.</p></div><span className="chip blue">Local editor</span></div><Recorder id={id} flow={journey.flow}/></Workspace>;}
