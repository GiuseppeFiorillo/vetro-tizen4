'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto');
const adapter=require('../lib/standalone.cjs'),{build,nativeCheck}=require('../tools/build-payload.cjs'),root=adapter.root;
const python=process.env.PYTHON||'python3',archive=path.resolve(process.env.VETRO_TIZEN4_ARCHIVE||path.join(root,'.cache/tizen4-'+require('../sources.lock.json').sources.tizen4.commit+'.zip'));
const out=path.join(root,'out');fs.mkdirSync(out,{recursive:true});const lab=fs.mkdtempSync(path.join(out,'checks-')),source=path.join(lab,'source'),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function prepare(input,dest){return cp.spawnSync(python,[path.join(root,'tools/prepare.py'),'--archive',input,'--output',dest],{encoding:'utf8',windowsHide:true});}
test('pinned archive produces patched staging sources without modifying the archive',()=>{
 const before=sha(archive),r=prepare(archive,source);assert.equal(r.status,0,r.stderr);assert.equal(sha(archive),before);const m=JSON.parse(fs.readFileSync(path.join(source,'standalone-source.json')));assert.equal(m.sourcePinned,true);assert.equal(m.patchesApplied,4);assert.equal(m.nativeBuildRequired,false);
});
test('source-first build exactly reproduces all104 installed payload files',()=>{
 const report=build(source,path.join(lab,'payload')),reference=require('../reference-payload.json').files;assert.equal(Object.keys(report.files).length,104);assert.deepEqual(report.files,reference);
});
test('unrelated caller version/port environment cannot change the payload',()=>{
 const copy=path.join(lab,'source-other-env');fs.cpSync(source,copy,{recursive:true});const oldPort=process.env.VETRO_PORT,oldRevision=process.env.VETRO_SOURCE_REVISION;
 try{process.env.VETRO_PORT='19000';process.env.VETRO_SOURCE_REVISION='f'.repeat(40);const report=build(copy,path.join(lab,'payload-other-env'));assert.deepEqual(report.files,require('../reference-payload.json').files);assert.equal(process.env.VETRO_PORT,'19000');assert.equal(process.env.VETRO_SOURCE_REVISION,'f'.repeat(40));}
 finally{if(oldPort===undefined)delete process.env.VETRO_PORT;else process.env.VETRO_PORT=oldPort;if(oldRevision===undefined)delete process.env.VETRO_SOURCE_REVISION;else process.env.VETRO_SOURCE_REVISION=oldRevision;}
});
test('changed upstream hook refuses silent cookie patching',()=>{
 assert.throws(()=>adapter.transform('service/auth.js',Buffer.from("var COOKIE='changed-upstream'; var PAIR_COOKIE='vetro_pair';")),/expected one upstream hook/);
});
test('ambiguous upstream hook refuses patching',()=>{
 assert.throws(()=>adapter.transform('service/auth.js',Buffer.from("var COOKIE = 'vetro_session';\nvar COOKIE = 'vetro_session';\nvar PAIR_COOKIE = 'vetro_pair';")),/found 2/);
});
function nativeFixture(){const dest=fs.mkdtempSync(path.join(lab,'native-source-')),m=require('../native/manifest.json');for(const n of Object.keys(m.launcherInputs)){const p=path.join(dest,n);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(source,n),p);}return dest;}
test('changed C# source requires an explicit native rebuild',()=>{
 const s=nativeFixture();fs.appendFileSync(path.join(s,'dock/src/Program.cs'),'\n// upstream native change\n');assert.throws(()=>nativeCheck(s),/Native source changed/);
});
test('new C# source requires a native rebuild even if existing files match',()=>{
 const s=nativeFixture();fs.writeFileSync(path.join(s,'dock/src/Extra.cs'),'class Extra {}');assert.throws(()=>nativeCheck(s),/New native source/);
});
test('tampered pinned native artifact is rejected',()=>{
 const dir=fs.mkdtempSync(path.join(lab,'native-artifacts-'));fs.cpSync(path.join(root,'native'),dir,{recursive:true});fs.appendFileSync(path.join(dir,'pinned/dock/tvlauncher-dotnet-2.0.dll'),'corruption');assert.throws(()=>nativeCheck(source,dir),/artifact checksum mismatch/);
});
test('same commit with changed source content is rejected',()=>{
 const changed=path.join(lab,'changed.zip');fs.copyFileSync(archive,changed);const code="import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],'a') as z:z.writestr('vetro-tizen4-main/unreviewed.txt','changed')\n";const r=cp.spawnSync(python,['-c',code,changed],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);const check=prepare(changed,path.join(lab,'must-not-prepare'));assert.notEqual(check.status,0);assert.match(check.stderr,/content differs from lock/);
});
test('GitHub ZIP container name may differ when commit and full source tree match',()=>{
 const repacked=path.join(lab,'repacked.zip'),code="import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1]) as a,zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as b:\n b.comment=a.comment\n for item in a.infolist():b.writestr(item.filename.replace('vetro-tizen4-main/','vetro-tizen4-pinned/'),a.read(item))\n";const r=cp.spawnSync(python,['-c',code,archive,repacked],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.notEqual(sha(archive),sha(repacked));const check=prepare(repacked,path.join(lab,'repacked-source'));assert.equal(check.status,0,check.stderr);
});
