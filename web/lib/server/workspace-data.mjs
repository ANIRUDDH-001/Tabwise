export async function loadOwnedWorkspace(userId,read,hasDiagnostics){
 if(typeof userId!=='string'||!userId)throw Error('authenticated owner required');
 const [versions,runs]=await Promise.all(['journey_versions','runs'].map(table=>read(table,userId)));
 if(![versions,runs].every(rows=>Array.isArray(rows)&&rows.length<=25&&rows.every(row=>row.user_id===userId)))throw Error('workspace ownership/limit mismatch');
 // Only already-authorized run ids reach the artifact lookup. At most 25 bounded lookups.
 const runViews=await Promise.all(runs.map(async({id,status,evidence_status,created_at})=>({id,status,evidence_status,created_at,...(hasDiagnostics?{diagnostic_evidence_available:status==='completed'&&evidence_status==='complete'?false:await hasDiagnostics(id)===true}:{})})));
 return {versions:versions.map(({id,journey_id,n,sha256,created_at})=>({id,journey_id,n,sha256,created_at})),runs:runViews};
}
