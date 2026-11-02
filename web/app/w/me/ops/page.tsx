import type {Metadata} from 'next';
import Workspace from '../../../../components/Workspace';
import Ops from '../../../../components/Ops';
import PageHeader from '../../../../components/ui/PageHeader';
import StatusChip from '../../../../components/ui/StatusChip';
export const metadata:Metadata={title:'Operations'};
export default function Operations(){return <Workspace><PageHeader title="Room to run." purpose="Budget, capacity and admission controls for the dedicated Tabwise project. Values appear only after operator authorization, which is checked on the server." status={<StatusChip tone="gated">Operators only</StatusChip>}/><Ops/></Workspace>;}
