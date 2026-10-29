import Workspace from '../../../../components/Workspace';
import SavedJourneyVersion from '../../../../components/SavedJourneyVersion';
export default async function Version({params}:{params:Promise<{id:string}>}){const {id}=await params;return <Workspace owned active="Journeys"><SavedJourneyVersion id={id}/></Workspace>;}
