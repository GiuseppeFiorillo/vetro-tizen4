'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),vm=require('vm');
const adapter=require('../lib/standalone.cjs'),profile=adapter.profile,root=adapter.root;
const target=require('./target.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),text=b=>b.toString('utf8').replace(/\r\n/g,'\n');
function nativeCheck(source,manifestDir=path.join(root,'native')){
 const m=JSON.parse(fs.readFileSync(path.join(manifestDir,'manifest.json')));
 for(const [n,h]of Object.entries(m.launcherInputs)){if(hash(Buffer.from(text(fs.readFileSync(path.join(source,n)))))!==h)throw Error('Native source changed; rebuild/record native artifacts before packaging: '+n);}
 function list(dir){return fs.readdirSync(dir).flatMap(n=>{const p=path.join(dir,n);return fs.statSync(p).isDirectory()?list(p):p.endsWith('.cs')?[path.relative(source,p).replace(/\\/g,'/')]:[]});}
 for(const n of list(path.join(source,'dock/src')))if(!Object.hasOwn(m.launcherInputs,n))throw Error('New native source requires a rebuild: '+n);
 for(const [n,h]of Object.entries(m.pairingInputs))if(hash(Buffer.from(text(fs.readFileSync(path.join(root,'overlay/pairing',n)))))!==h)throw Error('Pairing source changed; rebuild native display: '+n);
 for(const [n,h]of Object.entries(m.artifacts))if(hash(fs.readFileSync(path.join(manifestDir,'pinned',n)))!==h)throw Error('Native artifact checksum mismatch: '+n);
 return m;
}
function build(source,output,manifestDir){
 target.target(profile.id,profile.firmware);
 const vendor=target.vendor();
 function rootFile(n){if(n==='vendor-original')return vendor;const b=fs.readFileSync(path.join(root,'overlay/root',n));return n==='hook.awk'?Buffer.from(adapter.once(b.toString(),'{{VENDOR_BASE64}}',vendor.toString('base64'),'vendor restore template')):b;}
 source=path.resolve(source);output=path.resolve(output);
 if(!output.startsWith(path.join(root,'out')+path.sep))throw Error('Build output must stay under standalone-usb/out');
 if(fs.existsSync(output))throw Error('Build output already exists; choose a new staging directory');
 const sourceInfo=JSON.parse(fs.readFileSync(path.join(source,'standalone-source.json'))),native=nativeCheck(source,manifestDir);
 if(sourceInfo.nativeBuildRequired&&(!manifestDir||path.resolve(manifestDir)===path.join(root,'native')))throw Error('Candidate needs an explicit native rebuild');
 const nativeDir=manifestDir||path.join(root,'native'),core={};
 // Do not let an enclosing adapter Git repository masquerade as upstream HEAD,
 // or an unrelated shell port setting change the reconstructed app metadata.
 const saved={VETRO_PORT:process.env.VETRO_PORT,VETRO_SOURCE_REVISION:process.env.VETRO_SOURCE_REVISION};let collected;
 try{process.env.VETRO_PORT='8099';process.env.VETRO_SOURCE_REVISION=sourceInfo.sourceCommit;collected=require(path.join(source,'chain/build.cjs')).collectChainFiles();}
 finally{for(const [key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
 for(const f of collected){const n=decodeURIComponent(f.uri);if(!(/^(service\/|native\/dock\/|root-daemon\/)/.test(n)||n==='icon.png'))continue;let b=f.data;
  if(n==='service/build-info.js'){
   const old=profile.sourceVersion.replace(/[.]/g,'\\.'),re=new RegExp('["\']?version["\']?\\s*:\\s*["\']'+old+'["\']');
   if(!re.test(b.toString()))throw Error('Source version changed: review the profile display-version policy before updating');
   b=Buffer.from(b.toString().replace(re,'"version": "'+profile.localDisplayVersion+'"'));
   // Preserve the tested standalone format; actual source/patch provenance is
   // recorded in the sidecar, never guessed from an ancestor Git checkout.
   let info=b.toString();for(const [re,value]of [[/"sourceRevision":(?:null|"[a-f0-9]{40}")/g,'"sourceRevision":null'],[/"sourceDirty":(?:null|true|false)/g,'"sourceDirty":null']]){if((info.match(re)||[]).length!==1)throw Error('Build-info provenance contract changed upstream');info=info.replace(re,value);}b=Buffer.from(info);
  }
  const relative=n.startsWith('native/')?n.slice(7):null;
  if(relative&&Object.hasOwn(native.artifacts,relative))b=fs.readFileSync(path.join(nativeDir,'pinned',relative));
  core[n]=adapter.transform(n,b);
 }
 for(const n of ['pairing-broker.js','rollback.js','runtime.js','usb-recovery.js'])core[n]=adapter.runtimeFile(n);
 for(const n of ['vetro-pairing-display.dll','vetro-pairing-display.runtimeconfig.json'])core['native/pairing/'+n]=fs.readFileSync(path.join(nativeDir,'pinned/pairing',n));
 Object.assign(core,adapter.units());
 const coreFiles={};for(const n of Object.keys(core).sort())coreFiles[n]=hash(core[n]);
 const coreManifest={base:profile.base,data:profile.data,port:profile.port,basePackageSha256:profile.baselinePackageSha256,persistentBootChanged:false,files:coreFiles};
 const all={...core};
 for(const n of ['pilot.js','runtime.js','usb-recovery.js','permanent.js','boot.js','vetro-standalone-manager.service'])all[n]=adapter.runtimeFile(n);
 const fresh=adapter.freshRecovery(all['pilot.js'].toString(),all['permanent.js'].toString());all['pilot.js']=Buffer.from(fresh.pilot);all['permanent.js']=Buffer.from(fresh.permanent);
 all['manifest.json']=Buffer.from(JSON.stringify(coreManifest,null,2)+'\n');
 const permanent=JSON.parse(JSON.stringify(coreManifest));for(const n of ['pilot.js','runtime.js','usb-recovery.js','permanent.js','boot.js','vetro-standalone-manager.service'])permanent.files[n]=hash(all[n]);
 const permanentBytes=Buffer.from(JSON.stringify(permanent,null,2)+'\n');all['permanent-manifest.json']=permanentBytes;
 const payload={};for(const [n,b]of Object.entries(all))payload['standalone/'+n]=b;
 for(const n of ['root-daemon.js','startup.js','vetro-rootd.service','vendor-original'])payload['root/'+n]=rootFile(n);
 const old=rootFile('hook.awk').toString(),base=profile.base;
 const call=`echo '${hash(all['boot.js'])}  ${base}/boot.js' | /usr/bin/sha256sum -c - >/dev/null && echo '${hash(permanentBytes)}  ${base}/permanent-manifest.json' | /usr/bin/sha256sum -c - >/dev/null && /usr/bin/node -e "try { console.log(require('${base}/boot.js').queue()); } catch(e) { console.error('standalone skipped: '+e.message); }"`;
 const combined=adapter.once(old,'    exit 0\n}',`    system(${JSON.stringify(call)})\n    exit 0\n}`,'vendor-first boot extension');
 payload['root/hook.awk']=Buffer.from(combined);const c=JSON.parse(fs.readFileSync(path.join(root,'overlay/root/config.json')));c.hookHash=hash(combined);c.hashes[c.template]=hash(combined);payload['root/config.json']=Buffer.from(JSON.stringify(c,null,2)+'\n');
 const files={};for(const n of Object.keys(payload).sort()){if(n.endsWith('.js'))new vm.Script(payload[n].toString(),{filename:n});const p=path.join(output,n);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,payload[n]);files[n]=hash(payload[n]);}
 const provenance={profile:profile.id,compatLayerVersion:require('../package.json').version,profileSha256:hash(fs.readFileSync(path.join(root,'profiles/ktm2ldeuc-1400.2.json'))),patches:require('../patches/series.json'),source:sourceInfo,upstream:require('../sources.lock.json').sources.upstream,nativeArtifacts:native.artifacts,files};
 fs.writeFileSync(output+'.provenance.json',JSON.stringify(provenance,null,2)+'\n');return provenance;
}
if(require.main===module){try{const args=process.argv.slice(2),at=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1]};const x=build(at('--source')||path.join(root,'out/prepared'),at('--output')||path.join(root,'out/source-payload'),at('--native'));console.log(JSON.stringify({files:Object.keys(x.files).length,sourceCommit:x.source.sourceCommit,profile:x.profile,nativeRecompiled:false},null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={build,nativeCheck};
