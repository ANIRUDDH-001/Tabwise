import type {Metadata} from 'next';
import Workspace from '../../../../components/Workspace';
import OwnedWorkspace from '../../../../components/OwnedWorkspace';
export const metadata:Metadata={title:'Saved journeys'};
export default function Page(){return <Workspace><OwnedWorkspace section="journeys"/></Workspace>;}
