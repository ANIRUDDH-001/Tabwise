import {createIsolatedContext,BROWSER_ARGS} from './network.mjs';
import {createHash} from 'node:crypto';
export function qualificationFixture(nonce){
 if(!/^[a-f0-9]{8}$/.test(nonce))throw Error('invalid owned qualification nonce');
 // Reuse only the frozen, already-qualified title marker/parser; this is not an R1 journey or result.
 return `<!doctype html><html lang="en"><meta charset="utf-8"><title>R1 sign-up ${nonce}</title><main><h1>Owned observer qualification</h1><p>One screen-reader title report only. No journey, typing, model or external content.</p></main></html>`;
}
export function createQualificationBrowser({chromium,port,nonce,timeoutMs}){
 const source=qualificationFixture(nonce),url=`http://127.0.0.1:${port}/index.html?nonce=${nonce}`;
 return {async open(){
  const server=await chromium.launchServer({headless:false,args:[...BROWSER_ARGS],handleSIGINT:false,handleSIGTERM:false,handleSIGHUP:false});
  let browser,context;
  try{
   const pid=server.process()?.pid;if(!Number.isInteger(pid)||pid<=0)throw Error('owned Chromium PID missing');
   browser=await chromium.connect(server.wsEndpoint());context=await createIsolatedContext(browser,{port,source});
   await context.addInitScript(({nonce})=>{
    const events=[];let complete=true,last=-Infinity,bytes=0;
    const append=(type,event)=>{
     const t=performance.now();const entry={seq:events.length+1,t,type,key:type==='keydown'?event.key:null,shift:!!event.shiftKey,target:event.target?.id||event.target?.tagName?.toLowerCase()||'unknown'};
     const size=new TextEncoder().encode(JSON.stringify(entry)).length;
     if(t<last||events.length>=5000||bytes+size>512000){complete=false;return;}events.push(entry);last=t;bytes+=size;
    };
    addEventListener('keydown',event=>append('keydown',event),true);addEventListener('focusin',event=>append('focus',event),true);
    Object.defineProperty(window,'__tabwiseQualification',{value:()=>({complete,nonce,url:location.href,title:document.title,network_restrictions:globalThis.__tabwiseNetworkRestricted===true&&['RTCPeerConnection','webkitRTCPeerConnection','RTCDataChannel'].every(name=>typeof globalThis[name]==='undefined'&&Object.getOwnPropertyDescriptor(globalThis,name)?.writable===false&&Object.getOwnPropertyDescriptor(globalThis,name)?.configurable===false),active:document.activeElement?.id||document.activeElement?.tagName?.toLowerCase()||'unknown',events:structuredClone(events)}),writable:false,configurable:false});
   },{nonce});
   const page=await context.newPage();await page.goto(url,{waitUntil:'load',timeout:timeoutMs});
   let previous=[],closing;
   const read=async()=>{
    const snapshot=await page.evaluate(()=>window.__tabwiseQualification());
    if(snapshot?.complete!==true||snapshot.network_restrictions!==true||snapshot.nonce!==nonce||snapshot.url!==url||snapshot.title!==`R1 sign-up ${nonce}`||!Array.isArray(snapshot.events)||snapshot.events.length<previous.length||previous.some((event,i)=>JSON.stringify(event)!==JSON.stringify(snapshot.events[i]))||snapshot.events.some((event,i)=>event.seq!==i+1||!Number.isFinite(event.t)||(i>0&&event.t<snapshot.events[i-1].t)))throw Error('qualification page identity/journal/network capabilities incomplete');
    previous=structuredClone(snapshot.events);return snapshot;
   };
   return Object.freeze({pid,version:browser.version(),fixture_sha256:createHash('sha256').update(source).digest('hex'),read,keys:async from=>(await read()).events.filter(event=>event.seq>from&&event.type==='keydown'),close:()=>closing??=(async()=>{try{await context.close();}finally{try{await browser.close();}finally{await server.close();}}})()});
  }catch(error){await context?.close().catch(()=>{});await browser?.close().catch(()=>{});await server.kill().catch(()=>{});throw error;}
 }};
}
