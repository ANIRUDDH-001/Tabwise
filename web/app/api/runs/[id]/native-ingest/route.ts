import {nativeIngestPOST} from '../../../../../lib/server/native-artifacts-live';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return nativeIngestPOST(request,(await context.params).id);}
