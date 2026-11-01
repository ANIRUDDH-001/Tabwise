import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import Workspace from '../../../components/Workspace';
import RunDetail from '../../../components/RunDetail';
import r1 from '../../../data/r1.json';
import {validateSnapshot} from '../../../lib/snapshot.mjs';
import {isUuid} from '../../../lib/ids.mjs';
import LiveRun from '../../../components/LiveRun';
export function generateStaticParams(){return [{id:r1.run_id}];}
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{const {id}=await params;return {title:id===r1.run_id?'R1 trace (failed run)':`Run ${id.slice(0,8)}`};}
export default async function Run({params}:{params:Promise<{id:string}>}){const {id}=await params;if(id!==r1.run_id){if(!isUuid(id))notFound();return <Workspace><LiveRun id={id}/></Workspace>;}const result=validateSnapshot(r1);if(!result.ok)throw Error('Snapshot integrity failed');return <Workspace><RunDetail/></Workspace>;}
