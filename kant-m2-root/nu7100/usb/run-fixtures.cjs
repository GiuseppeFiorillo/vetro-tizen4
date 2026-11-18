'use strict';
// Host/container only. Installer commands are mocked except temporary tar extraction.
const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),adapter=require('../lib/standalone.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(process.getuid()!==0)throw Error('Use a disposable Linux test container; fixtures chown only temporary files');
fs.mkdirSync(path.join(root,'out'),{recursive:true});
const lab=fs.mkdtempSync(path.join(root,'out/fixtures-')),runtime=path.join(lab,'runtime');fs.mkdirSync(runtime);
const actual=process.argv.indexOf('--package');
if(actual>=0){for(const n of ['INSTALL.JS','PAYLOAD.TGZ'])fs.copyFileSync(path.join(process.argv[actual+1],n),path.join(lab,n));}
else{
 const tree=path.join(lab,'synthetic-payload');fs.mkdirSync(tree);const files={};
 function put(n,b){const p=path.join(tree,n);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,b);files[n]=sha(Buffer.from(b));}
 const vendor=Buffer.from('#!/bin/sh\necho SYNTHETIC-FIXTURE-ONLY\n');
 for(const n of ['root-daemon.js','startup.js','vetro-rootd.service','config.json'])put('root/'+n,fs.readFileSync(path.join(root,'overlay/root',n)));
 put('root/vendor-original',vendor);put('root/hook.awk','#!/usr/bin/gawk -f\nBEGIN {exit 0}\n');
 const fresh=adapter.freshRecovery(adapter.runtimeFile('pilot.js').toString(),adapter.runtimeFile('permanent.js').toString());
 for(const n of ['pilot.js','permanent.js','usb-recovery.js','runtime.js','boot.js'])put('standalone/'+n,Buffer.from(n==='pilot.js'?fresh.pilot:n==='permanent.js'?fresh.permanent:adapter.runtimeFile(n)));
 put('standalone/root-daemon/root-daemon.js','// fixture daemon; never executed\n');
 const archive=path.join(lab,'PAYLOAD.TGZ');
 cp.execFileSync(process.env.PYTHON||'python3',[path.join(__dirname,'archive.py'),tree,archive]);
 const profile={packageId:'SYNTHETIC-FIXTURE-ONLY',build:'FIXTURE-BUILD',vendorHash:sha(vendor),vendorBase64:vendor.toString('base64'),hookHash:files['root/hook.awk'],archiveHash:sha(fs.readFileSync(archive)),files,defaultApps:''};
 const template=fs.readFileSync(path.join(__dirname,'install.js'),'utf8');
 fs.writeFileSync(path.join(lab,'INSTALL.JS'),template.replace('/*PROFILE*/null',JSON.stringify(profile)));
 console.log('Synthetic fixtures: not an installable TV payload');
}
fs.copyFileSync(path.join(__dirname,'test-installer.cjs'),path.join(lab,'test-installer.cjs'));
for(const n of ['pilot.js','permanent.js','usb-recovery.js','runtime.js'])fs.copyFileSync(path.join(root,'overlay/runtime',n),path.join(runtime,n));
fs.copyFileSync(path.join(root,'overlay/root/startup.js'),path.join(runtime,'startup.js'));
for(const n of ['test-pilot.cjs','test-permanent.cjs','test-startup.cjs'])fs.copyFileSync(path.join(root,'tests',n),path.join(lab,n));
const node4=process.env.NODE4;if(!node4)throw Error('Set NODE4 to the checksum-verified host fixture runtime');
if(cp.execFileSync(node4,['--version'],{encoding:'utf8'}).trim()!=='v4.4.3')throw Error('Fixture runtime must be Node 4.4.3');
for(const n of ['test-installer.cjs','test-pilot.cjs','test-permanent.cjs','test-startup.cjs'])cp.execFileSync(node4,[path.join(lab,n)],{stdio:'inherit'});
console.log('PASS host Node 4 installer, rollback, permanent-controller and rearming fixtures');
