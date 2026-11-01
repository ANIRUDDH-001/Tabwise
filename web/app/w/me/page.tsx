import type {Metadata} from 'next';
import Workspace from '../../../components/Workspace';
import OwnedWorkspace from '../../../components/OwnedWorkspace';
export const metadata:Metadata={title:'Your workspace'};
export default function Account(){return <Workspace><OwnedWorkspace section="overview"/></Workspace>;}
