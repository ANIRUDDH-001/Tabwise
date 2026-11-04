import {candidateEvidenceGET,candidateIngestPOST} from '../../../../../lib/server/candidate-evidence-live';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return candidateEvidenceGET(request,(await params).id);}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return candidateIngestPOST(request,(await params).id);}
