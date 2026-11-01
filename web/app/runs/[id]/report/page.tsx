import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import Workspace from '../../../../components/Workspace';
import StoredDiagnosticReport from '../../../../components/StoredDiagnosticReport';
import {isUuid} from '../../../../lib/ids.mjs';
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{const {id}=await params;return {title:`Report for run ${id.slice(0,8)}`};}
export default async function Report({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!isUuid(id))notFound();return <Workspace><StoredDiagnosticReport id={id}/></Workspace>;}
