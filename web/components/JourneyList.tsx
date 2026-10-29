import Link from 'next/link';
import {journeys} from '../lib/journeys';
export default function JourneyList(){return <div className="journey-list">{journeys.map(j=><Link href={`/journeys/${j.id}/edit`} key={j.id} className="journey-row"><span className="journey-icon" aria-hidden="true">{j.icon}</span><div><h3>{j.name}</h3><p>{j.description}</p></div><span className="chip">Run pending</span><span className="arrow" aria-hidden="true">↗</span></Link>)}</div>;}
