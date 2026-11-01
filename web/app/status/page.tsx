import type {Metadata} from 'next';
import Link from 'next/link';
import Workspace from '../../components/Workspace';
import PageHeader from '../../components/ui/PageHeader';
import StatusChip,{type Tone} from '../../components/ui/StatusChip';
import {FEATURES,TONE} from '../../lib/feature-states.mjs';
export const metadata:Metadata={title:'Status'};
export default function Status(){
 const extra=[['Public demo','available','Available','Demo workspace, sample app, journey editor and the historical R1 trace and report work without an account.','/w/demo'],['Public mode','gated','Gated','Public run dispatch is disabled and needs a separate recorded approval.',null]] as const;
 return <Workspace><PageHeader title="What’s available." purpose="What you can use on this deployment today, and what still needs setup or qualification. This page is static: it does not monitor provider uptime."/>
  <ul className="availability-list">{[...extra.map(([label,state,chip,reason,href])=>({id:label,label,state,chip,reason,href})),...FEATURES].map(f=><li className="availability" key={f.id}><div><strong>{f.label}</strong><p>{f.reason}</p>{f.href&&f.href!=='/status'&&<Link className="textlink" href={f.href}>Open</Link>}</div><StatusChip tone={TONE[f.state as keyof typeof TONE] as Tone}>{f.chip}</StatusChip></li>)}</ul></Workspace>;
}
