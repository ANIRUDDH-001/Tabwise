// Bounded localhost-only production integration check; no credentials, database or native desktop input.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const server=spawn(process.execPath,[root+'web/node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3101'],{cwd:root+'web',stdio:'inherit',windowsHide:true,env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'',SUPABASE_SERVICE_ROLE_KEY:''}});
const closed=new Promise(resolve=>{server.once('error',()=>resolve());server.once('close',resolve);});
let timer;
try{
 let ready=false;
 for(let i=0;i<30;i++){try{if((await fetch('http://localhost:3101/status',{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
 if(!ready)throw Error('local production server not ready');
 const child=spawn(process.execPath,['--test','web/test/web-smoke.browser.mjs','web/test/product-integration.browser.mjs'],{cwd:root,env:{...process.env,TABWISE_SMOKE_URL:'http://localhost:3101'},stdio:'inherit',windowsHide:true});
 timer=setTimeout(()=>child.kill(),90000);
 const code=await new Promise(resolve=>{child.once('error',()=>resolve(1));child.once('close',code=>resolve(code??1));});
 process.exitCode=code;
}finally{clearTimeout(timer);server.kill();await closed;}
