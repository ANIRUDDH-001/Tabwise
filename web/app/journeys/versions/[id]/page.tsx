import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import Workspace from '../../../../components/Workspace';
import SavedJourneyVersion from '../../../../components/SavedJourneyVersion';
import {isUuid} from '../../../../lib/ids.mjs';
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{const {id}=await params;return {title:`Saved version ${id.slice(0,8)}`};}
export default async function Version({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!isUuid(id))notFound();return <Workspace><SavedJourneyVersion id={id}/></Workspace>;}
