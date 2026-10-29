import {LIMITS} from '../../packages/contracts/limits.mjs';

export function applyPatch(files,diff){
 if(typeof diff!=='string'||Buffer.byteLength(diff)>LIMITS.MAX_PATCH_BYTES)throw Error('patch byte cap');
 const lines=diff.replace(/\r\n/g,'\n').split('\n');if(lines.at(-1)==='')lines.pop();
 const output={...files};let at=0,changed=0;const touched=new Set();
 while(at<lines.length){
  const before=/^--- a\/(.+)$/.exec(lines[at++]??''),after=/^\+\+\+ b\/(.+)$/.exec(lines[at++]??'');
  if(!before||!after||before[1]!==after[1]||before[1]!=='index.html'||!Object.hasOwn(files,before[1])||touched.has(before[1]))throw Error('patch file allowlist');
  const file=before[1];touched.add(file);const original=files[file].replace(/\r\n/g,'\n').split('\n');if(original.at(-1)==='')original.pop();
  const result=[];let cursor=0,hunks=0;
  while(at<lines.length&&!lines[at].startsWith('--- ')){
   const h=/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@$/.exec(lines[at++]??'');if(!h)throw Error('invalid patch hunk');
   hunks++;const start=Number(h[1])-1,oldCount=Number(h[2]??1),newStart=Number(h[3])-1,newCount=Number(h[4]??1);if(start<cursor||start>original.length)throw Error('patch context offset');
   result.push(...original.slice(cursor,start));cursor=start;if(newStart!==result.length)throw Error('patch new-line offset');let oldSeen=0,newSeen=0;
   while(at<lines.length&&!lines[at].startsWith('@@ ')&&!lines[at].startsWith('--- ')){
    const row=lines[at++],op=row[0],text=row.slice(1);
    if(![' ','-','+'].includes(op))throw Error('invalid patch line');
    if(op!=='+'&&original[cursor++]!==text)throw Error('patch context mismatch');
    if(op!=='+')oldSeen++;if(op!=='-'){result.push(text);newSeen++;}if(op!==' ')changed++;
   }
   if(oldSeen!==oldCount||newSeen!==newCount)throw Error('patch hunk counts');
  }
  if(!hunks)throw Error('patch has no hunks');
  result.push(...original.slice(cursor));output[file]=result.join('\n')+'\n';
 }
 if(changed===0||changed>LIMITS.MAX_PATCH_LINES)throw Error('patch line cap');
 for(const text of Object.values(output))if(/https?:|wss?:|<script\b[^>]*\bsrc\s*=|\b(?:fetch|XMLHttpRequest|WebSocket|importScripts)\s*\(|\b(?:RTCPeerConnection|webkitRTCPeerConnection|RTCDataChannel)\b|\brel\s*=\s*(?:["'][^"']*\b(?:preconnect|dns-prefetch)\b[^"']*["']|(?:preconnect|dns-prefetch)\b)/i.test(text))throw Error('external URL or network code refused');
 return output;
}
