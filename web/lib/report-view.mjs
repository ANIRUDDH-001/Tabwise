export async function verifyDiagnosticExport(value,runId){
 if(value?.snapshot?.schema!=='tabwise-diagnostic-report/1'||value.snapshot.run_id!==runId||value.snapshot.verification?.verdict!==null)throw Error('diagnostic report identity invalid');
 const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value.snapshot)))),byte=>byte.toString(16).padStart(2,'0')).join('');
 if(actual!==value.sha256)throw Error('diagnostic report hash mismatch');return value.snapshot;
}
