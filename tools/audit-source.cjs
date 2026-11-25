'use strict';
// Source publication checks. Generated/private ignored directories are not inputs.
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),skip=new Set(['.git','out','dist','bin','obj','node_modules','__pycache__','.local']);
const files=[];function walk(dir){for(const n of fs.readdirSync(dir).sort()){if(skip.has(n))continue;const p=path.join(dir,n),s=fs.lstatSync(p);assert(!s.isSymbolicLink(),'Review source symlink: '+p);if(s.isDirectory())walk(p);else files.push(p);}}walk(root);
const errors=[],examples=[];
const flag=(p,msg)=>errors.push(path.relative(root,p).replaceAll('\\','/')+': '+msg);
let privatePatterns=process.env.VETRO_PRIVATE_PATTERNS?JSON.parse(process.env.VETRO_PRIVATE_PATTERNS):[];
const at=process.argv.indexOf('--private-pattern-file');if(at>=0){assert(process.argv[at+1]);privatePatterns=privatePatterns.concat(JSON.parse(fs.readFileSync(process.argv[at+1],'utf8')));}assert(Array.isArray(privatePatterns));
for(const p of files){const name=path.relative(root,p).replaceAll('\\','/'),b=fs.readFileSync(p),texts=[b.toString('utf8'),b.toString('utf16le')];
 if(/\.(?:img|msd|wgt|p12|pfx|pem|key|dpapi|log|zip|tgz|tar|xz)$/i.test(name)||/(^|\/)(?:vendor-original|key\.dpapi|auth\.json|vetro-auth\.json)$/.test(name))flag(p,'private/generated artifact');
 if(/\.ni\.dll$/i.test(name)||/Tizen\.TV\..*\.dll$/i.test(name))flag(p,'firmware/runtime reference assembly');
 for(const text of texts){
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))flag(p,'private key');
  for(const value of privatePatterns)if(value&&text.toLowerCase().includes(value.toLowerCase()))flag(p,'owner-specific value');
  for(const m of text.matchAll(/[A-Z]:[\\/]+Users[\\/]+([^\\/\s'"<>]+)/gi))if(!/^(?:user|username|you|public|test|example)$/i.test(m[1]))flag(p,'personal home path');
 }
 if(b.includes(0))continue;
 const text=texts[0],fixture=/^(?:app|chain|rooting)\/tests\/|^design\//.test(name);
 const ips=text.match(/\b(?:192\.168|10\.\d+|172\.(?:1[6-9]|2\d|3[01]))\.\d+\.\d+\b/g)||[];
 for(const ip of ips){if(fixture||(name==='app/service/mqtt-bridge.js'&&ip===['192','168','1','50'].join('.')))examples.push({file:name,kind:'synthetic address'});else flag(p,'review private-network address');}
 if(/\b(?:[a-f0-9]{2}:){5}[a-f0-9]{2}\b/i.test(text)){if(fixture)examples.push({file:name,kind:'synthetic MAC fixture'});else flag(p,'review MAC address');}
 // Only placeholder domains and GitHub noreply addresses may appear outside test fixtures.
 for(const m of text.matchAll(/\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b/g)){if(fixture||m[0]==='git@github.com'||/^(?:example\.(?:com|org|net)|[a-z0-9.-]+\.(?:test|example|invalid)|users\.noreply\.github\.com)$/i.test(m[1]))continue;flag(p,'review email address');}
}
// Owner-specific values (names, serials, addresses) are never committed; pass them at audit time.
if(!privatePatterns.length)console.error('audit: no owner-specific patterns supplied (VETRO_PRIVATE_PATTERNS or --private-pattern-file); generic checks only');
require('./build-payload.cjs').nativeCheck(root,path.join(root,'native/current'));
const manifest=require('../native/current/manifest.json');
for(const n of ['tvlauncher-dotnet-2.0.dll','tvlauncher-dotnet-2.0.runtimeconfig.json'])assert(fs.readFileSync(path.join(root,'app/native/dock',n)).equals(fs.readFileSync(path.join(root,'native/current/pinned/dock',n))),'Duplicate native package input differs: '+n);
for(const p of ['LICENSE','LICENSES.md','THIRD_PARTY_NOTICES.md','dock/tools/glyphs/LICENSE-phosphor.txt','profiles/runtime-invariants.json','profiles/tested-payload.json'])assert(fs.existsSync(path.join(root,p)),p);
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(JSON.stringify({passed:true,sourceFiles:files.length,nativeSourceAndArtifactsVerified:true,privatePatternsChecked:privatePatterns.length,syntheticAddressFixtureFiles:[...new Set(examples.map(x=>x.file))].length}));
