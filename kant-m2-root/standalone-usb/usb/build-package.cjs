'use strict';
// Host-only. Produces files, never opens a disk or connects to the TV.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const adapter=require('../lib/standalone.cjs'),target=require('../tools/target.cjs');
const root=adapter.root,hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function build(input,output){
 target.target(adapter.profile.id,adapter.profile.firmware);
 input=path.resolve(input);output=path.resolve(output);
 if(!output.startsWith(path.join(root,'out')+path.sep)||fs.existsSync(output))throw Error('Use a new output directory under standalone-usb/out');
 const meta=JSON.parse(fs.readFileSync(input+'.provenance.json')),lock=require('../sources.lock.json').sources.tizen4;
 if(meta.profile!==adapter.profile.id||!meta.source.sourcePinned||meta.source.sourceCommit!==lock.commit||meta.source.treeSha256!==lock.treeSha256)throw Error('Package source is not the pinned firmware-profile input');
 if(JSON.stringify(meta.files)!==JSON.stringify(require('../reference-payload.json').files))throw Error('Payload differs from the hardware-verified baseline; review and validate before updating its reference');
 const actual=[];
 function walk(dir,rel=''){for(const n of fs.readdirSync(dir)){const p=path.join(dir,n),r=rel?rel+'/'+n:n,st=fs.lstatSync(p);if(st.isSymbolicLink())throw Error('Payload symlink');if(st.isDirectory())walk(p,r);else if(st.isFile())actual.push(r);else throw Error('Unexpected payload file type');}}
 walk(input);if(JSON.stringify(actual.sort())!==JSON.stringify(Object.keys(meta.files).sort()))throw Error('Unlisted payload members');
 const files={};
 for(const n of Object.keys(meta.files).sort()){
  if(!/^(root|standalone)\//.test(n)||n.includes('\\')||n.includes(':')||n.split('/').includes('..'))throw Error('Unsafe payload member');
  const p=path.join(input,n),st=fs.lstatSync(p);
  if(!st.isFile()||st.isSymbolicLink()||hash(fs.readFileSync(p))!==meta.files[n])throw Error('Changed payload member '+n);
  files[n]=meta.files[n];
 }
 fs.mkdirSync(output,{recursive:true});
 const python=process.env.PYTHON||'python3';
 const r=cp.spawnSync(python,[path.join(__dirname,'archive.py'),input,path.join(output,'PAYLOAD.TGZ')],{encoding:'utf8',windowsHide:true});
 if(r.status!==0)throw Error(r.stderr||'Payload archive failed');
 const vendor=fs.readFileSync(path.join(input,'root/vendor-original')),hook=fs.readFileSync(path.join(input,'root/hook.awk'));
 // Historical package labels are retained for byte-identical replay, not model gating.
 const profile={packageId:'vetro-NU7100-1400.2-usb-v1-candidate',model:'UE65NU7100',firmware:'T-KTM2LDEUC-1400.2',build:'T-KTM2LDEUC-REL-202606052034',vendorHash:hash(vendor),vendorBase64:vendor.toString('base64'),hookHash:hash(hook),archiveHash:hash(fs.readFileSync(path.join(output,'PAYLOAD.TGZ'))),files,defaultApps:'youtube\tYouTube\t9Ur5IzDKqV.TizenYouTube\nnetflix\tNetflix\tRN1MCdNq8t.Netflix\ndisney\tDisney+\tMCmYXNxgcu.DisneyPlus\nprime\tPrime Video\tevKhCgZelL.AmazonIgnitionLauncher2\nnpo\tNPO Start\tiquaePhaki.npostart\n'};
 const source=fs.readFileSync(path.join(__dirname,'install.js'),'utf8');
 if(source.split('/*PROFILE*/null').length!==2)throw Error('Unexpected installer template');
 fs.writeFileSync(path.join(output,'INSTALL.JS'),source.replace('/*PROFILE*/null',JSON.stringify(profile)));
 fs.writeFileSync(path.join(output,'PACKAGE.JSON'),JSON.stringify({packageId:profile.packageId,model:profile.model,firmware:profile.firmware,build:profile.build,archiveSha256:profile.archiveHash,hookSha256:profile.hookHash,developerModeRequired:false,pairingEnabledByDefault:true,requiresFreshInstall:true,freshHardwareInstallTested:false},null,2)+'\n');
 fs.copyFileSync(path.join(__dirname,'PAYLOAD-README.txt'),path.join(output,'README.TXT'));
 return {files:Object.keys(files).length,output};
}
if(require.main===module){try{console.log(JSON.stringify(build(process.argv[2],process.argv[3]),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={build};
