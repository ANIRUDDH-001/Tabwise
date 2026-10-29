import Workspace from '../../../../components/Workspace';
import StoredDiagnosticReport from '../../../../components/StoredDiagnosticReport';
export default async function Report({params}:{params:Promise<{id:string}>}){const {id}=await params;return <Workspace owned active="Reports"><StoredDiagnosticReport id={id}/></Workspace>;}
