import {notFound} from 'next/navigation';
import Workspace from '../../../components/Workspace';
import PatchReview from '../../../components/PatchReview';
export default async function Patch({params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))notFound();
 return <Workspace owned active="Recorded runs"><PatchReview key={id} id={id}/></Workspace>;
}
