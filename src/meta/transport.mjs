// Allowlisted error metadata only: messages, stacks, headers and socket objects
// can contain credentials and are intentionally excluded from persisted diagnostics.
export function transportDiagnostics(error,{endpoint,elapsedMs,headersMs=null,redact=String}){
 const seen=new Set(),codes=[];
 const safe=value=>typeof value==='string'?redact(value).replace(/[^A-Za-z0-9_.:\[\]-]/g,'').slice(0,120):null;
 function visit(e,depth=0){
  if(!e||typeof e!=='object'||depth>5||seen.has(e))return null;
  seen.add(e);const code=safe(e.code),name=safe(e.name);codes.push(code??name??'');
  return {name,code,syscall:safe(e.syscall),...(e.cause?{cause:visit(e.cause,depth+1)}:{}),...(Array.isArray(e.errors)?{errors:e.errors.slice(0,4).map(x=>visit(x,depth+1))}:{})};
 }
 const causes=[visit(error)],joined=codes.join(' ');
 const classification=/ENOTFOUND|EAI_AGAIN|EAI_FAIL/.test(joined)?'dns':/CERT|TLS|SSL/.test(joined)?'tls':/UND_ERR_CONNECT_TIMEOUT/.test(joined)?'connect-timeout':/ECONN|EPIPE|ETIMEDOUT|ENET|EHOST|UND_ERR_SOCKET/.test(joined)?'socket':/AbortError|TimeoutError/.test(joined)?'timeout':'transport';
 let target='invalid-endpoint';try{const url=new URL(endpoint);target=redact(url.origin+url.pathname);}catch{}
 return {classification,endpoint:target,elapsed_ms:Math.max(0,elapsedMs),response_headers_ms:headersMs,connection_timing_ms:null,causes};
}
