import {candidateRunRoute} from '../../../lib/server/candidate-run-live';
export const runtime='nodejs';
export async function POST(request:Request){return candidateRunRoute(request);}
