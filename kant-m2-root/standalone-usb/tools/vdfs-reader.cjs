'use strict';
// Read-only VDFS2007 reader. Layouts adapted from gtors/vdfs-unpack (MIT).
// See LICENSE-vdfs-unpack-MIT.txt. No firmware or user data is distributed.
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
function openImage(img){
const u64 = (b,o) => { const n = Number(b.readBigUInt64LE(o)); if(!Number.isSafeInteger(n)) throw Error('Unsafe integer'); return n; };
const sb=1024, ex=1536;
if(img.toString('ascii',sb,sb+8)!=='VDFS2007') throw Error('Unexpected filesystem');
const block=2**img[sb+164], nodeSize=2**img[sb+165];
const tables=u64(img,ex+72)*block;
function metaBlock(n) {
  for(let i=0;i<96;i++){ const begin=u64(img,ex+88+i*16), len=u64(img,ex+96+i*16); if(n<len)return begin+n; n-=len; }
  throw Error('Metadata block outside extents');
}
const last=u64(img,tables+24), translation=tables+u64(img,tables+64);
const records=[];
for(let id=1;id<=last;id++){
 const mi=u64(img,translation+id*16), off=metaBlock(mi)*block;
 const b=img.subarray(off,off+nodeSize);
 if(b.readUInt32LE(28)!==2)continue;
 const count=b.readUInt16LE(14);
 if(count>nodeSize/8)throw Error('Invalid record count');
 for(let i=0;i<count;i++){
  const at=b.readUInt32LE(nodeSize-8-i*4);
  if(at+26>b.length)throw Error('Invalid catalog record offset');
  const kl=b.readUInt16LE(at+4),rl=b.readUInt16LE(at+6);
  if(at+rl>b.length||kl>rl)throw Error('Catalog bounds');
  const r={parent:u64(b,at+8),id:u64(b,at+16),type:b[at+24],name:b.toString('utf8',at+26,at+26+b[at+25]),value:Buffer.from(b.subarray(at+kl,at+rl)),node:id};
  records.push(r);
 }
}
const dirs=new Map(records.filter(r=>r.type===1).map(r=>[r.id,r]));
function full(r,seen=new Set()){
 if((r.id===0||r.id===1)&&r.parent===0)return '';
 if(seen.has(r.id))return '@cycle/'+r.name;
 seen.add(r.id);
 const p=dirs.get(r.parent);
 return (p&&p!==r?full(p,seen):'')+'/'+r.name;
}
for(const r of records)r.path=full(r);
function blob(r){
 const v=r.value;if(v.length<312)throw Error('Not a complete file record');
 const size=u64(v,80),blocks=u64(v,88);
 if(!blocks)return v.subarray(96,96+size);
 const dest=Buffer.alloc(size);let copied=0;
 for(let i=0;i<9;i++){
  const at=96+i*24,begin=u64(v,at),len=u64(v,at+8),ib=u64(v,at+16);
  if(!len)continue;
  const start=begin*block,end=Math.min(start+len*block,img.length),target=ib*block;
  if(start>=img.length||target>=size)continue;
  copied+=img.copy(dest,target,start,Math.min(end,start+size-target));
 }
 if(copied<size)throw Error('Overflow extents unsupported: '+r.path);
 return dest;
}
function decode(r){
 const data=blob(r),flags=r.value.readUInt32LE(0);
 if(!(flags&8192))return data;
 let d=-1;for(const size of [40,32]){const c=data.length-size;if(c>=0&&/^(Zip|Gzp)$/.test(data.toString('ascii',c+9,c+12))&&[5,6].includes(data.readUInt16LE(c+14))){d=c;break;}}
 if(d<0)throw Error('Compressed descriptor missing');
 const magic=data.toString('ascii',d+8,d+12),count=data.readUInt16LE(d+12),unpacked=u64(data,d+16);
 if(unpacked>512*1024*1024)throw Error('Decoded file exceeds this selective reader limit');
 const digest={C:0,I:16,H:20,h:32}[magic[0]];
 const sig={0:0,1:128,2:256}[data[d+7]];
 if(digest===undefined||sig===undefined)throw Error('Unknown authentication format');
 const table=d-count*16-(count+1)*digest-sig;
 const out=[];
 for(let i=0;i<count;i++){
  const at=table+i*16,flag=data.readUInt16LE(at+2),len=data.readUInt32LE(at+4),start=u64(data,at+8);
  if(start+len>table)throw Error('Compressed extent bounds');
  const chunk=data.subarray(start,start+len);
  out.push(flag&1?chunk:magic.endsWith('Zip')?zlib.inflateSync(chunk,{maxOutputLength:Math.max(1,unpacked)}):zlib.gunzipSync(chunk,{maxOutputLength:Math.max(1,unpacked)}));
 }
 const result=Buffer.concat(out);if(result.length!==unpacked)throw Error('Unpacked length mismatch');
 return result;
}
return {records,decode};
}
if(require.main===module){try{const a=process.argv.slice(2),arg=n=>{const i=a.indexOf(n);return i<0?null:a[i+1];};const input=arg('--image'),entry=arg('--extract'),output=arg('--output');if(!input||!entry||!output)throw Error('Usage: node tools/vdfs-reader.cjs --image platform.img --extract /etc/os-release --output out/firmware-os-release');const st=fs.lstatSync(input);if(!st.isFile()||st.isSymbolicLink()||st.size>2*1024**3)throw Error('Expected a bounded regular firmware image');const root=path.resolve(__dirname,'..'),dest=path.resolve(output);if(!['out','inputs'].some(n=>dest.startsWith(path.join(root,n)+path.sep)))throw Error('Extract only into ignored out/ or inputs/');const volume=openImage(fs.readFileSync(input)),record=volume.records.find(r=>r.path===entry&&r.type===2);if(!record)throw Error('Exact firmware entry not found');const bytes=volume.decode(record);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes,{flag:'wx'});console.log(JSON.stringify({firmwareEntry:entry,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),tvContacted:false},null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={openImage};
