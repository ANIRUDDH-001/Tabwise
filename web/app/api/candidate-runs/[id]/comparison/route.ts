import {candidateComparisonRoute} from '../../../../../lib/server/candidate-comparison-live';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return candidateComparisonRoute(request,(await params).id);}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return candidateComparisonRoute(request,(await params).id);}
