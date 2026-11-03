import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import Workspace from '../../../components/Workspace';
import PatchReview from '../../../components/PatchReview';
import {isUuid} from '../../../lib/ids.mjs';
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{const {id}=await params;return {title:`Patch review ${id.slice(0,8)}`};}
export default async function Patch({params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!isUuid(id))notFound();
 return <Workspace><PatchReview key={id} id={id}/></Workspace>;
}
