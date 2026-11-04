import PrepareCandidate from '../../../components/PrepareCandidate';
export default async function Page({searchParams}:{searchParams:Promise<{version?:string}>}){return <PrepareCandidate version={(await searchParams).version??''}/>;}
