import type {Metadata} from 'next';
import Workspace from '../../../../components/Workspace';
import OwnedWorkspace from '../../../../components/OwnedWorkspace';
export const metadata:Metadata={title:'Runs'};
export default function Page(){return <Workspace><OwnedWorkspace section="runs"/></Workspace>;}
