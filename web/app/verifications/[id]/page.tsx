import Workspace from '../../../components/Workspace';
import VerificationPanel from '../../../components/VerificationPanel';
export default async function Verification({params}:{params:Promise<{id:string}>}){const {id}=await params;return <Workspace owned><VerificationPanel id={id}/></Workspace>;}
