export function findingReferences(rows){
 return Object.fromEntries((Array.isArray(rows)?rows:[]).filter(row=>['signal','spark'].includes(row.source)).slice(0,25).map(row=>[row.id,(Array.isArray(row.evidence_refs)?row.evidence_refs:[]).filter(ref=>typeof ref==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(ref)).slice(0,100)]));
}
