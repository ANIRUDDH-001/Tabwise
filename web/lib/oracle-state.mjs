export function oracleState(patch){
 if(patch?.oracle_available!==true)return 'unavailable';
 const o=patch.oracle;if(o===null)return 'absent';
 if(!o||o.patch_id!==patch.patch_id||o.baseline_run_id!==patch.run_id||o.base_sha256!==patch.base_sha256||o.step!==patch.finding?.step||typeof o.user_id!=='string'||!o.user_id||o.reviewed_by!==o.user_id||!['focus','validation','status'].includes(o.kind)||typeof o.review_ref!=='string'||!o.review_ref.trim())return 'unavailable';
 return 'registered';
}
