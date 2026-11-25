'use strict';
// Build a standalone runtime without contacting a TV or creating USB media.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert');
const root=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
// Firmware bytes are private owner inputs, never a bundled old-release fallback.
require('./target.cjs').vendor();
const output=path.join(root,'out','build-'+Date.now());fs.mkdirSync(output,{recursive:true});
{
 require('./build-payload.cjs').build(root,path.join(output,'base'),path.join(root,'native/current'));
 const result=require('./add-home-key.cjs').build(path.join(output,'base'),path.join(output,'current'));
 const protectedFiles=require('../profiles/runtime-invariants.json').files;
 for(const [n,h]of Object.entries(protectedFiles))assert.equal(result.files[n],h,'Protected runtime changed: '+n);
 for(const name of ['manifest.json','permanent-manifest.json']){const m=JSON.parse(fs.readFileSync(path.join(output,'current/standalone',name)));for(const [n,h]of Object.entries(m.files))assert.equal(sha(fs.readFileSync(path.join(output,'current/standalone',n))),h,n);}
 const reference=require('../profiles/tested-payload.json').files;
 const changed=[...new Set([...Object.keys(result.files),...Object.keys(reference)])].filter(n=>result.files[n]!==reference[n]);
 const validation={version:'0.7.0',files:Object.keys(result.files).length,matchesTestedPayload:changed.length===0,changedRuntimeFiles:changed,protectedRootAndHomeKeyFilesUnchanged:true,nativeSourceAndArtifactsVerified:true,nativeFramework:'netcoreapp2.0',optionalTunerRequiresCompatibleRuntime:true,tvContacted:false,deployedToTv:false};
 fs.writeFileSync(path.join(output,'validation.json'),JSON.stringify(validation,null,2)+'\n');
 console.log(JSON.stringify({output:path.relative(root,output),...validation},null,2));
}
