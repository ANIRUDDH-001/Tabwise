import Link from 'next/link';
import {journeys} from '../lib/journeys';
// Journeys open the local editor. No run state is implied: live runs are gated (T-P0-08).
export default function JourneyList({headingLevel=3}:{headingLevel?:2|3}){
 const Heading=headingLevel===2?'h2':'h3';
 return <ul className="journey-list">{journeys.map(j=><li key={j.id}><Link href={`/journeys/${j.id}/edit`} className="journey-row"><span className="journey-icon" aria-hidden="true">{j.icon}</span><div><Heading>{j.name}</Heading><p>{j.description}</p></div><span className="chip status-ok"><span aria-hidden="true" className="chip-glyph">●</span>Record locally</span><span className="arrow" aria-hidden="true">→</span></Link></li>)}</ul>;
}
