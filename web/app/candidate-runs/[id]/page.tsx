import CandidateRun from '../../../components/CandidateRun';
export default async function Page({params}:{params:Promise<{id:string}>}){return <CandidateRun id={(await params).id}/>;}
