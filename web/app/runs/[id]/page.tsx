import {notFound} from 'next/navigation';
import Workspace from '../../../components/Workspace';
import RunDetail from '../../../components/RunDetail';
import r1 from '../../../data/r1.json';
import {validateSnapshot} from '../../../lib/snapshot.mjs';
import LiveRun from '../../../components/LiveRun';
export function generateStaticParams(){return [{id:r1.run_id}];}
export default async function Run({params}:{params:Promise<{id:string}>}){const {id}=await params;if(id!==r1.run_id){if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))notFound();return <Workspace active="Recorded runs"><LiveRun id={id}/></Workspace>;}const result=validateSnapshot(r1);if(!result.ok)throw Error('Snapshot integrity failed');return <Workspace active="Recorded runs"><RunDetail/></Workspace>;}
