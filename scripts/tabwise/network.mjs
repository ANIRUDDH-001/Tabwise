// Browser requests never go upstream. Only the pinned document is fulfilled from memory.
export function allowLoopback(url,port){try{const u=new URL(url);return Number.isInteger(port)&&port>0&&port<=65535&&u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.port===String(port)&&!u.username&&!u.password;}catch{return false;}}
export function documentAllowed(url,method,port){
 if(method!=='GET'||!allowLoopback(url,port))return false;
 return ['/','/index.html'].includes(new URL(url).pathname);
}
export const BROWSER_ARGS=Object.freeze(['--dns-prefetch-disable','--disable-background-networking']);
export async function createIsolatedContext(browser,{port,source}){
 if(!allowLoopback(`http://127.0.0.1:${port}/`,port)||typeof source!=='string'||Buffer.byteLength(source)>100000)throw Error('invalid isolated fixture');
 const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
 try{
  if(typeof context.routeWebSocket!=='function')throw Error('WebSocket routing required');
  await context.routeWebSocket('**/*',socket=>socket.close({code:1008,reason:'Tabwise network isolation'}));
  await context.route('**/*',route=>{
   const request=route.request();
   if(!request.isNavigationRequest()||!documentAllowed(request.url(),request.method(),port))return route.abort('blockedbyclient');
   return route.fulfill({status:200,body:source,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-dns-prefetch-control':'off','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; worker-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'self'"}});
  });
  return context;
 }catch(error){await context.close();throw error;}
}
