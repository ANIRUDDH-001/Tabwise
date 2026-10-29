export async function loadOwnedWorkspace(userId,read){
 if(typeof userId!=='string'||!userId)throw Error('authenticated owner required');
 const [versions,runs]=await Promise.all(['journey_versions','runs'].map(table=>read(table,userId)));
 if(![versions,runs].every(rows=>Array.isArray(rows)&&rows.length<=25&&rows.every(row=>row.user_id===userId)))throw Error('workspace ownership/limit mismatch');
 return {versions:versions.map(({id,journey_id,n,sha256,created_at})=>({id,journey_id,n,sha256,created_at})),runs:runs.map(({id,status,evidence_status,created_at})=>({id,status,evidence_status,created_at}))};
}
