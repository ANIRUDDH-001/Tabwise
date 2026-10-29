import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
export async function GET(){const html=await readFile(join(process.cwd(),'../fixtures/fernway/index.html'),'utf8');return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action 'none'; connect-src 'none'; img-src 'none'; frame-ancestors 'self'",'Cache-Control':'no-store'}});}
