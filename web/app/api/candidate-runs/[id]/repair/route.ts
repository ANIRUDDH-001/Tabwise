import {candidateRepairRoute} from '../../../../../lib/server/candidate-repair-live';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return candidateRepairRoute(request,(await params).id);}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return candidateRepairRoute(request,(await params).id);}
