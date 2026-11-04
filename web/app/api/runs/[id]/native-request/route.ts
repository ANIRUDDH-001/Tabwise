import {nativeRequestRoute} from '../../../../../lib/server/native-request-live';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return nativeRequestRoute(request,(await params).id);}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return nativeRequestRoute(request,(await params).id);}
