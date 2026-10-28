// Offline D-43 fault-injection artifact. Run from the repository root with existing dependencies.
// Creates unique temporary copies; launches only Node test processes, with independent OS/TLS/network denial.
// Mutations stay in scratch; the live R1 entry point, NVDA, Actions and Meta are never executed.
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
const source=process.cwd(),root=fs.mkdtempSync(path.join(process.env.TEMP,'tabwise-r1-mutations-'));console.log('Scratch evidence: '+root);
const client='vendor/guidepup-0.36.4-r1/lib/windows/NVDA/NVDAClient.js',vbs='vendor/guidepup-0.36.4-r1/lib/windows/runVbsScript.js',runner='scripts/r1.mjs',gate='src/speech/sendguard.mjs',cap='src/speech/capture.mjs',tree='src/speech/vendortree.mjs';
const rows=[
['01',client,s=>s.replace('if (!gate.commit(token)) {','if (false) {')],
['01b',vbs,s=>s.replace('if (!gate.commit(token)) {','if (false) {')],
['02',vbs,s=>s.replace('        const filePath =','        const token = await gate.admit({ path: "sendkeys", char: character });\n        const filePath =').replace('        const token = await gate.admit({ path: "sendkeys", char: character });\n        if (!gate.commit','        if (!gate.commit')],
['03',client,s=>s.replace('protocolError(`connection error: ${cause.message}`);','this.disconnect(); this.#connect(ca, capture, onSuccess, onError);')],
['04',client,s=>s.replace('await this.sendKeyCode(keyCodeCommands_1.keyCodeCommands.stopSpeech);','this.sendKeyCode(keyCodeCommands_1.keyCodeCommands.stopSpeech);')],
['05',client,s=>s.replace('Object.freeze(NVDAClient.prototype);','void 0;')],
['06',vbs,s=>s.replace('typeof character !== "string" || !SENDKEYS_CHAR.test(character)','false')],
['07',runner,s=>s.replace('await finishRun({ failed, state, teardown });','await killAll(); await finishRun({ failed, state, teardown });')],
['08','src/speech/browser.mjs',s=>s.replace(', handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false','')],
['09','vendor/guidepup-0.36.4-r1/lib/teardown.js',s=>s+'\nprocess.on("SIGINT", () => {});\nprocess.on("SIGTERM", () => {});\n'],
['10',gate,s=>s.replace('bounded(() => auth.reader(token), ackMs + ACK_MARGIN_MS)','bounded(() => ({ack: true, reasons: []}), ackMs + ACK_MARGIN_MS)')],
['11',cap,s=>s.replace('if (next === prev) { stable = true; break; }','if (true) { stable = true; break; }')],
['12','test/helpers/sandbox.mjs',s=>s.replace("tls.connect = stub('tls.connect');",'// Independent preload still prevents any real TLS.')],
['13',gate,s=>s.replace('const reasons = judgeKeys(evs, expected);',"const first = evs.findIndex(e => !IGNORED.has(e.key)); const end = evs.findIndex((e,i) => i > first && e.key === 'Control'); const win = end < 0 ? evs : evs.slice(0,end); const reasons = judgeKeys(win, expected);").replace('cursor = top(evs);\n        return { ack: true','cursor = top(win);\n        return { ack: true')],
['14',gate,s=>s.replace('bounded(() => auth.before(token), ackMs + ACK_MARGIN_MS)','bounded(() => [], ackMs + ACK_MARGIN_MS)')],
['14b',cap,s=>s.replace('    reader.before = (tok) => ack.before(tok);','    void 0;')],
['14c',gate,s=>s.replace('if (stray.length) return stray.map','if (false) return stray.map')],
['15',cap,s=>s.replace("if (status === 'crashed') { crashes.push(reason); if (!exited) rewrite?.(); }",'void 0;')],
['15b',cap,s=>s.replace('if (!exited) rewrite?.();','void 0;')],
['16',cap,s=>s.replace('if (!onDisk) {\n    summary = build(found);','if (!onDisk) {\n    void 0;')],
['17',runner,s=>s.replace('pinErrors(lock.dependencies, deps);','lockMismatches(lock.dependencies, deps);')],
['17b',tree,s=>s.replace('if (!(k in pins)) out.push(`missing from lock.dependencies: ${k}`);','if (!(k in pins)) continue;')],
['17c',tree,s=>s.replace('for (const k of Object.keys(pins)) if (!UPSTREAM_PINS.includes(k))','for (const k of []) if (!UPSTREAM_PINS.includes(k))')],
['18-freshness',gate,s=>s.replace('const age = now() - auth.at;','const age = 0;')],
['19-capability',gate,s=>s.replace("if (typeof ackFn.before !== 'function')",'if (false)').replace('bounded(() => auth.before(token), ackMs + ACK_MARGIN_MS)','bounded(() => auth.before?.(token) ?? [], ackMs + ACK_MARGIN_MS)')],
['20-ack-class',gate,s=>s.replace('valid && !consumed && v.ack === true','valid && !consumed && (v.ack === true || v.ack === null)')],
['21-terminal',cap,s=>s.replace('const final = await withTimeout(ack.final(), t);','const final = { value: [], error: null, timedOut: false };')],
['22-framing',client,s=>s.replace('pending += String(data);','pending = String(data);')],
['23-quit-status','vendor/guidepup-0.36.4-r1/lib/windows/NVDA/quit.js',s=>s.replace('code === 0 && !signal ? null', 'true ? null')],
['24-owner','vendor/guidepup-0.36.4-r1/lib/windows/NVDA/NVDA.js',s=>s.replace('relayPid !== this.#owned.pid ||','false ||')],
['25-disconnect',client,s=>s.replace('protocolError(`connection error: ${cause.message}`);','this.disconnect(); this.#dead = true;')],
['26-ack-deadline',gate,s=>s.replace('if (performance.now() - t0 > ackMs) return', 'if (false) return')],
];
const files=[];const copyable=['src','scripts','test','fixtures','docs','vendor','package.json','package-lock.json','.gitattributes'];
const preload=path.join(root,'deny-os.mjs');fs.writeFileSync(preload,`import cp from 'node:child_process';import tls from 'node:tls';import {syncBuiltinESMExports} from 'node:module';const spawn=cp.spawn;cp.spawn=function(cmd,...args){if(cmd!==process.execPath)throw Error('DEFENSE: non-Node process blocked');return spawn.call(this,cmd,...args);};for(const k of ['spawnSync','exec','execSync','execFile','execFileSync','fork'])cp[k]=()=>{throw Error('DEFENSE: process blocked');};tls.connect=()=>{throw Error('SANDBOX: tls.connect DEFENSE blocked');};const fetch=globalThis.fetch;globalThis.fetch=(input,options)=>{const url=new URL(input?.url??String(input));if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw Error('DEFENSE: non-loopback fetch blocked');return fetch(input,{...options,redirect:'error'});};syncBuiltinESMExports();`);
for(let n=0;n<4;n++){const app=path.join(root,'worker-'+n);fs.mkdirSync(app,{recursive:true});for(const f of copyable)fs.cpSync(path.join(source,f),path.join(app,f),{recursive:true});fs.mkdirSync(path.join(app,'.github'),{recursive:true});fs.mkdirSync(path.join(app,'.github/workflows'),{recursive:true});fs.copyFileSync(path.join(source,'.github/workflows/r1.yml'),path.join(app,'.github/workflows/r1.yml'));fs.mkdirSync(path.join(app,'node_modules'),{recursive:true});for(const name of fs.readdirSync(path.join(source,'node_modules'))){const dest=path.join(app,'node_modules',name);if(name==='@guidepup')fs.cpSync(path.join(source,'node_modules',name),dest,{recursive:true,dereference:true});else fs.symlinkSync(path.join(source,'node_modules',name),dest,'junction');}files.push(app);}
const results=[];
async function run(app,id){return new Promise(resolve=>{const p=spawn(process.execPath,['--test','--test-concurrency=1','--test-timeout=3000','--test-reporter=tap','test/*.test.mjs'],{cwd:app,env:{...process.env,NODE_OPTIONS:'--import='+pathToFileURL(preload).href},windowsHide:true});let out='',timed=false;const timer=setTimeout(()=>{timed=true;p.kill();},90000);p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>out+=b);p.on('close',code=>{clearTimeout(timer);fs.writeFileSync(path.join(root,id+'.tap'),out);const row={id,exit:code,timed,tests:Number(/^# tests (\d+)/m.exec(out)?.[1]),pass:Number(/^# pass (\d+)/m.exec(out)?.[1]),fail:Number(/^# fail (\d+)/m.exec(out)?.[1]),cancelled:Number(/^# cancelled (\d+)/m.exec(out)?.[1]),parseError:/SyntaxError/.test(out),failures:[...out.matchAll(/^not ok \d+ - (.+)$/gm)].map(m=>m[1])};results.push(row);fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({id,exit:code,timed,tests:row.tests,pass:row.pass,fail:row.fail,cancelled:row.cancelled,parseError:row.parseError}));resolve(row);});});}
const baseline=await run(files[0],'baseline');if(baseline.exit!==0)throw Error('baseline failed; no mutant considered meaningful');let next=0;await Promise.all(files.map(async app=>{for(;;){const i=next++;if(i>=rows.length)return;const [id,file,change]=rows[i],f=path.join(app,file),old=fs.readFileSync(f,'utf8'),s=change(old);if(s===old)throw Error('unapplied '+id);fs.writeFileSync(f,s);try{await run(app,id);}finally{fs.writeFileSync(f,old);}}}));console.log(JSON.stringify({cases:rows.length,detected:results.filter(r=>r.id!=='baseline'&&r.exit!==0&&!r.timed&&!r.parseError&&r.fail>0).length}));
