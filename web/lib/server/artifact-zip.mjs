import {inflateRawSync} from 'node:zlib';
import {LIMITS} from '../../../packages/contracts/limits.mjs';
// Bounded ZIP subset for GitHub artifacts; no disk extraction, ZIP64, links or encryption.
export function readArtifactZip(bytes){
 const zip=Buffer.from(bytes);if(zip.length<22||zip.length>8_000_000)throw Error('archive size');
 const end=zip.length-22;
 if(zip.readUInt32LE(end)!==0x06054b50||zip.readUInt16LE(end+20)!==0||zip.readUInt16LE(end+4)!==0||zip.readUInt16LE(end+6)!==0)throw Error('unsupported ZIP directory');
 const count=zip.readUInt16LE(end+10),size=zip.readUInt32LE(end+12),start=zip.readUInt32LE(end+16);
 if(count<1||count>101||zip.readUInt16LE(end+8)!==count||start+size!==end)throw Error('ZIP directory bounds');
 let cursor=start,total=0;const files=Object.create(null),folded=new Set(),intervals=[];
 for(let i=0;i<count;i++){
  if(cursor+46>end||zip.readUInt32LE(cursor)!==0x02014b50)throw Error('ZIP central entry');
  const flags=zip.readUInt16LE(cursor+8),method=zip.readUInt16LE(cursor+10),compressed=zip.readUInt32LE(cursor+20),length=zip.readUInt32LE(cursor+24),nameSize=zip.readUInt16LE(cursor+28),extra=zip.readUInt16LE(cursor+30),comment=zip.readUInt16LE(cursor+32),attributes=zip.readUInt32LE(cursor+38),local=zip.readUInt32LE(cursor+42);
  const next=cursor+46+nameSize+extra+comment;if(next>end||(flags&1)||![0,8].includes(method)||length>LIMITS.RUN_BYTES||compressed>8_000_000||((attributes>>>16)&0xf000)===0xa000)throw Error('unsupported ZIP entry size or method');
  const name=new TextDecoder('utf-8',{fatal:true}).decode(zip.subarray(cursor+46,cursor+46+nameSize));
  if(!/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*(?:\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*)*$/.test(name)||name.length>240||folded.has(name.toLowerCase()))throw Error('ZIP path refused');
  folded.add(name.toLowerCase());
  if(local+30>start||zip.readUInt32LE(local)!==0x04034b50||zip.readUInt16LE(local+8)!==method)throw Error('ZIP local entry');
  const localNameSize=zip.readUInt16LE(local+26),dataStart=local+30+localNameSize+zip.readUInt16LE(local+28),dataEnd=dataStart+compressed;
  if(dataEnd>start||dataStart>dataEnd||new TextDecoder('utf-8',{fatal:true}).decode(zip.subarray(local+30,local+30+localNameSize))!==name)throw Error('ZIP local bounds/name');
  if(intervals.some(([from,to])=>local<to&&dataEnd>from))throw Error('overlapping ZIP data');intervals.push([local,dataEnd]);
  const data=method===0?Buffer.from(zip.subarray(dataStart,dataEnd)):inflateRawSync(zip.subarray(dataStart,dataEnd),{maxOutputLength:LIMITS.RUN_BYTES-total+1});
  total+=data.length;if(data.length!==length||total>LIMITS.RUN_BYTES)throw Error('uncompressed size limit');
  files[name]=data;cursor=next;
 }
 if(cursor!==end)throw Error('trailing directory entry');
 return files;
}
