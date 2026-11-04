import {candidateRunRoute} from '../../../../lib/server/candidate-run-live';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return candidateRunRoute(request,(await params).id);}
