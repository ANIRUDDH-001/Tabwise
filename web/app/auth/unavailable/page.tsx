import type {Metadata} from 'next';
import Link from 'next/link';
import Workspace from '../../../components/Workspace';
import PageHeader from '../../../components/ui/PageHeader';
import {safeReason} from '../../../lib/auth-redirect.mjs';
import {reasonText} from '../../../lib/reason-copy.mjs';
export const metadata:Metadata={title:'Sign-in unavailable'};
export default async function Unavailable({searchParams}:{searchParams:Promise<{reason?:string|string[]}>}){
 const reason=safeReason((await searchParams).reason);
 return <Workspace><PageHeader title="Sign-in is unavailable" purpose={reasonText(reason)}/><p>Your browser-local journeys are still on this device. You can continue using the public demo.</p><div className="actions"><Link className="button" href="/w/demo">Open the demo</Link><Link className="button secondary" href="/status">View status</Link></div></Workspace>;
}
