import {nativeDispatchPOST} from '../../../../../lib/server/native-integration-live';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return nativeDispatchPOST(request,(await context.params).id);}
