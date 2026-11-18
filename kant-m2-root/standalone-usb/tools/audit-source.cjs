'use strict';
// Reports categories/locations only, never the matched personal value.
const fs=require('fs'),path=require('path'),net=require('net');
const excluded=new Set(['.git','.cache','out','inputs','.venv','__pycache__','node_modules','bin','obj']);
function publicExample(ip){const a=ip.split('.').map(Number);return a.every(n=>n===0)||a[0]===127||(a[0]===192&&a[1]===0&&a[2]===2)||(a[0]===198&&a[1]===51&&a[2]===100)||(a[0]===203&&a[1]===0&&a[2]===113);}
function findings(name,bytes,denylist=[]){
 const found=[],seen=new Set(),add=(kind,line)=>{const key=kind+':'+line;if(!seen.has(key)){seen.add(key);found.push({file:name,line,category:kind});}};
 if(/\.(?:dpapi|p12|pfx|pem|key|cer|wgt|img|log)$/i.test(name))add('private-or-generated-file',1);
 const texts=bytes.includes(0)?[bytes.toString('latin1'),bytes.toString('utf16le'),bytes.subarray(1).toString('utf16le')]:[bytes.toString('utf8')];
 for(const text of texts){
  for(const value of denylist)if(typeof value==='string'&&value.length>=6&&text.includes(value))add('private-denylist-match',1);
  let offset=0;
  text.split('\n').forEach((line,i)=>{
   for(const m of line.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)){
    const prefix=text.slice(Math.max(0,offset+m.index-80),offset+m.index);
    const assemblyVersion=/\.dll$/i.test(name)&&/(?:FileVersion|Assembly Version|Release)[\x00-\x20]{0,16}$|<assemblyIdentity\s+version=["']$/i.test(prefix);
    if(m[0].split('.').every(n=>Number(n)<=255)&&!publicExample(m[0])&&!assemblyVersion)add('non-example-ip-address',i+1);
   }
   for(const m of line.matchAll(/(?<![0-9a-f])(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}(?![0-9a-f])/gi))if(!/^(?:00[:-]){5}00$|^(?:ff[:-]){5}ff$/i.test(m[0]))add('possible-mac-address',i+1);
   for(const m of line.matchAll(/(?<![0-9a-z:])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![0-9a-z:])/gi))if(net.isIP(m[0])===6&&!/^(?:::|::1)$/i.test(m[0])&&!/^2001:db8:/i.test(m[0])&&!/^(?:0*:){1,7}0*1?$/.test(m[0]))add('non-example-ipv6-address',i+1);
   if(/(?:[A-Za-z]:\\Users\\|\/Users\/)[A-Za-z0-9_.-]+/.test(line))add('personal-home-path',i+1);
   if(/\b(?:serial|serialNumber|serial_number|serialId|deviceSerial|duid|macAddress|mac_address)\b["']?\s*[:=]\s*["'][A-Za-z0-9:_.-]{6,}["']/i.test(line))add('possible-device-identifier',i+1);
   if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[opusr]_[A-Za-z0-9]{20,}|\bAKIA[A-Z0-9]{16}\b/.test(line))add('possible-secret',i+1);
   offset+=line.length+1;
  });
 }
 return found;
}
function audit(root,denylist=[]){let files=0;const issues=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(excluded.has(e.name))continue;const p=path.join(dir,e.name),rel=path.relative(root,p).replace(/\\/g,'/');if(e.isSymbolicLink()){issues.push({file:rel,line:1,category:'source-symlink'});continue;}if(e.isDirectory())walk(p);else if(e.isFile()){files++;issues.push(...findings(rel,fs.readFileSync(p),denylist));}}}walk(root);return {files,findings:issues,valuesRedacted:true};}
if(require.main===module){try{const args=process.argv.slice(2),at=args.indexOf('--denylist'),deny=at>=0?JSON.parse(fs.readFileSync(args[at+1],'utf8')):[];const root=path.resolve(args[0]||path.join(__dirname,'..'));const report=audit(root,deny);console.log(JSON.stringify(report,null,2));if(report.findings.length)process.exitCode=1;}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={findings,audit};
