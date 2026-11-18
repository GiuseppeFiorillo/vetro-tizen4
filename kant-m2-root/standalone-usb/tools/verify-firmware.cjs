'use strict';
// Read-only static assessment. A matching report is not a TV compatibility test.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function crc32(b){let c=0xffffffff;for(const v of b){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function parseUImage(u){
 if(u.length<64||u.readUInt32BE(0)!==0x27051956)throw Error('Invalid uImage header');
 if(u[31]!==0)throw Error('This static profile expects an uncompressed uImage');
 const size=u.readUInt32BE(12);if(!size||size>u.length-64)throw Error('Truncated kernel');
 const header=Buffer.from(u.subarray(0,64)),stored=header.readUInt32BE(4);header.writeUInt32BE(0,4);
 const kernel=u.subarray(64,64+size);
 return {kernel,checks:[{name:'uImage header CRC32',pass:crc32(header)===stored},{name:'uImage data CRC32',pass:crc32(kernel)===u.readUInt32BE(24)}]};
}
function verify(u,modules){
 const {kernel:k,checks}=parseUImage(u),base=0xc0008000;
 const check=(name,pass,detail)=>checks.push({name,pass,...(detail?{detail}: {})});
 const symbols={call_usermodehelper:0xc0039a78,memcpy:0xc01fa720,v7_coherent_kern_range:0xc001cba8,schedule_timeout_uninterruptible:0xc04cc05c,SfdUepVerifyFileSignature:0xc01cdecc};
 for(const [name,expected]of Object.entries(symbols)){
  const found=[];let off=-1;
  while((off=k.indexOf(Buffer.from(name+'\0'),off+1))>=0){const p=Buffer.alloc(4);p.writeUInt32LE(base+off);let ref=-1;while((ref=k.indexOf(p,ref+1))>=0)if(ref>=4&&ref%4===0){const a=k.readUInt32LE(ref-4);if(a>=base&&a<base+k.length)found.push(a);}}
  check('export '+name,found.length===1&&found[0]===expected,{expected:'0x'+expected.toString(16),found:found.map(a=>'0x'+a.toString(16))});
 }
 for(const [name,address,hex]of [['ldm-ip',0xc04dde3c,'9ce79ce8'],['copy-window',0xc010598c,'0420a0e10c10a0e10600a0e133ff2fe1'],['save-r1 and epilogue',0xc00a5c44,'001084e51cd04be2f0a89de8'],['flush-wrapper',0xc0012954,'1c1084e20400a0e1'],['copy exit and epilogue',0xc0105778,'0500a0e128d04be2f0af9de8'],['flush epilogue',0xc0012960,'0500a0e114d04be230a89de8']]){
  const actual=k.subarray(address-base,address-base+hex.length/2).toString('hex');check(name,actual===hex,{address:'0x'+address.toString(16),expected:hex,actual});
 }
 check('zero cave',k.length>=0x1000&&k.subarray(0x358,0x1000).every(v=>v===0));
 const at=0xc001295c-base;
 if(k.length>=at+4){const ins=k.readUInt32LE(at);let imm=ins&0xffffff;if(imm&0x800000)imm-=0x1000000;const target=base+at+8+imm*4;check('flush-wrapper BL target',(ins>>>24)===0xeb&&target===symbols.v7_coherent_kern_range,{target:'0x'+target.toString(16)});}else check('flush-wrapper BL target',false);
 for(const [name,expected]of Object.entries({'exfat_core.ko':'22f43de04d7ee4ff4183e99474e4b3c0a02a3690f1aa0636961daceebfe602cf','exfat_fs.ko':'e86e85c54e7b8feeb1f8bc56ca3ef877bb9bac09da65d8a3b020d76f964f5a90'}))check(name+' fingerprint',!!modules[name]&&sha(modules[name])===expected,{expected,...(modules[name]?{actual:sha(modules[name])}:{missing:true})});
 return {platform:'Kant-M2 (T-KTM2)',referenceProfile:'ktm2ldeuc-1400.2',assessment:'Static firmware inputs only; not hardware validation or automatic profile approval',matchesReferenceInputs:checks.every(c=>c.pass),uImageSha256:sha(u),kernelSha256:sha(k),kernelBytes:k.length,checks};
}
function regular(p){const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size>64*1024*1024)throw Error('Expected a bounded regular firmware file');return fs.readFileSync(p);}
if(require.main===module){try{const a=process.argv.slice(2),at=n=>{const i=a.indexOf(n);return i<0?null:a[i+1];},image=at('--uimage'),dir=at('--modules');if(!image||!dir)throw Error('Usage: node tools/verify-firmware.cjs --uimage FILE --modules EXTRACTED_MODULE_DIRECTORY');const report=verify(regular(image),Object.fromEntries(['exfat_core.ko','exfat_fs.ko'].map(n=>[n,regular(path.join(dir,n))])));console.log(JSON.stringify(report,null,2));if(!report.matchesReferenceInputs)process.exitCode=1;}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={crc32,parseUImage,verify};
