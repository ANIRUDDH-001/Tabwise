// Candidate-only durable adapter for the existing W5 authority. No private key is stored.
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {canonical} from '../../scripts/tabwise/r2-admission.mjs';
export function openCandidateStore({path,id,binding,consumer}){
 const db=new DatabaseSync(path),bound=canonical(binding),who=canonical(consumer);
 db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS consumption(id TEXT PRIMARY KEY, receipt TEXT NOT NULL)');
 return {async rpc(action,q){
  if(!['consume','read'].includes(action)||q.id!==id||canonical(q.binding)!==bound||canonical(q.consumer)!==who||Date.parse(binding.expires_at)<=Date.now())throw Error('candidate consumption binding refused');
  db.exec('BEGIN IMMEDIATE');
  try{let row=db.prepare('SELECT receipt FROM consumption WHERE id=?').get(id),fresh=false;
   if(!row){if(action!=='consume')throw Error('candidate authorization not consumed');const receipt={schema:'tabwise-r2-consumption/1',authorization_id:id,binding:JSON.parse(bound),consumer:JSON.parse(who),coordinator_key:q.coordinator_key,consumed_at:new Date().toISOString(),consumption_id:randomUUID()};db.prepare('INSERT INTO consumption(id,receipt) VALUES (?,?)').run(id,canonical(receipt));row={receipt:canonical(receipt)};fresh=true;}
   const receipt=JSON.parse(row.receipt);db.exec('COMMIT');return {fresh,receipt};
  }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
 },close(){db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close();}};
}
