// Test-only outbound fixture. Loaded explicitly with --import in an isolated Next process.
// Real route/auth-client/RPC code executes; auth provider is synthetic and SQL is disposable.
import {spawn} from 'node:child_process';
import {appendFileSync} from 'node:fs';
const original=globalThis.fetch,host='ueobjrtvsgvkigmjxkks.supabase.co',quote=v=>"'"+String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")+"'";
let interruptedPreparation=false;
const sql=s=>new Promise((yes,no)=>{const c=spawn('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-h','127.0.0.1','-p','55442','-U','g2test','-d','g2local','-At','-q','-v','ON_ERROR_STOP=1','-f','-'],{windowsHide:true,env:{...process.env,PGCLIENTENCODING:'UTF8'}});c.stdin.end(s,'utf8');let out='',err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('error',no);c.on('close',n=>n?no(Error(err)):yes(out.trim()));});
globalThis.fetch=async(input,init={})=>{
 const r=new Request(input,init),url=new URL(r.url);
 if(['127.0.0.1','localhost'].includes(url.hostname))return original(input,init);
 if(url.hostname!==host){if(process.env.TABWISE_FIXTURE_AUDIT)appendFileSync(process.env.TABWISE_FIXTURE_AUDIT,JSON.stringify({host:url.hostname})+'\n');throw Error('LOCAL TEST: external network refused');}
 const response=v=>Response.json(v,{headers:{'content-range':'0-0/1'}});
 if(url.pathname==='/auth/v1/user'){const t=r.headers.get('authorization')?.replace('Bearer ','');let sub;try{sub=JSON.parse(Buffer.from(t.split('.')[1],'base64url')).sub;}catch{return Response.json({message:'bad fixture session'},{status:401});}return response({id:sub,aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{provider:'github'},user_metadata:{}});}
 const rpc=/^\/rest\/v1\/rpc\/(admit_version|prepare_native_product_request)$/.exec(url.pathname);
 if(rpc?.[1]==='prepare_native_product_request'&&process.env.TABWISE_FIXTURE_FAIL_PREPARE_ONCE==='1'&&!interruptedPreparation){interruptedPreparation=true;return Response.json({message:'LOCAL injected preparation interruption',code:'P0001'},{status:400});}
 if(rpc){const args=await r.json();let value;try{value=await sql(`set role service_role;select public.${rpc[1]}(${Object.entries(args).map(([k,v])=>{if(!/^p_[a-z_]+$/.test(k))throw Error('argument');return k+'=>'+quote(v);}).join(',')});`);}catch(e){console.error('LOCAL RPC FAILURE',rpc[1],e.message);throw e;}return response(JSON.parse(value));}
 const table=/^\/rest\/v1\/(journey_versions|runs|native_product_requests|system_flags|apps)$/.exec(url.pathname);
 if(table){const clauses=[];for(const [key,value] of url.searchParams){if(['select','limit','order'].includes(key))continue;if(!['id','user_id','product_run_id'].includes(key)||!value.startsWith('eq.'))throw Error('unsupported fixture query');clauses.push(key+'='+quote(value.slice(3)));}const rows=JSON.parse(await sql(`set role service_role;select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select * from public.${table[1]}${clauses.length?' where '+clauses.join(' and '):''}) x;`));return response(r.headers.get('accept')?.includes('vnd.pgrst.object')?rows[0]??null:rows);}
 throw Error('LOCAL TEST: unsupported Supabase operation');
};
