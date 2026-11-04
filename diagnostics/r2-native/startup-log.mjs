// Fixed local NVDA log only, bounded before reading; never forwards raw environment or local paths.
import {openSync,readSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import {diagnosticErrorChain} from './policy.mjs';
const CAP=16384;
export function sanitizeNvdaLog(text,env=process.env){
 const scrubbed=diagnosticErrorChain(Error(String(text).slice(0,65536)),env).chain.message??'';
 const clean=scrubbed.replace(/[A-Za-z]:[\\/][^\s"'<>|]*/g,'<path>').replace(/\\\\[^\s"'<>|]+/g,'<path>');
 const b=Buffer.from(clean);return b.subarray(0,CAP).toString('utf8')+(text.length>8192||b.length>CAP?'\n[truncated]\n':'');
}
export function readNvdaLog(env=process.env){
 let fd;try{fd=openSync(join(env.TEMP??env.TMP,'nvda.log'),'r');const bytes=Buffer.alloc(65536),n=readSync(fd,bytes,0,bytes.length,0);return {available:true,text:sanitizeNvdaLog(bytes.subarray(0,n).toString('utf8'),env)};}
 catch{return {available:false,text:null};}finally{if(fd!==undefined)closeSync(fd);}
}
