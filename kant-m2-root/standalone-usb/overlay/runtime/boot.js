'use strict';
var fs=require('fs'),crypto=require('crypto'),cp=require('child_process'),base=__dirname;
function queue(){
 if(process.getuid()!==0)throw Error('Root required');
 if(fs.readFileSync('/etc/os-release','utf8').indexOf('BUILD_ID=T-KTM2LDEUC-REL-202606052034\n')<0)throw Error('Firmware changed');
 var flag=base+'/autostart.json',s=fs.lstatSync(flag);
 if(!s.isFile()||s.isSymbolicLink()||s.uid!==0||(s.mode&18))throw Error('Unsafe autostart flag');
 if(JSON.parse(fs.readFileSync(flag,'utf8')).enabled!==true)return 'AUTOSTART_DISABLED';
 var m=JSON.parse(fs.readFileSync(base+'/permanent-manifest.json','utf8'));
 Object.keys(m.files).forEach(function(n){
  if(n.indexOf('..')>=0||n.charAt(0)==='/')throw Error('Unsafe manifest path');
  var p=base+'/'+n,st=fs.lstatSync(p);
  if(!st.isFile()||st.isSymbolicLink()||st.uid!==0||(st.mode&18))throw Error('Unsafe payload: '+n);
  if(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')!==m.files[n])throw Error('Payload checksum: '+n);
 });
 var unit='/run/systemd/system/vetro-standalone-manager.service';
 fs.writeFileSync(unit,fs.readFileSync(base+'/vetro-standalone-manager.service'),{mode:420});
 cp.execFileSync('/usr/bin/chsmack',['-a','_',unit],{timeout:3000});
 cp.execFileSync('/usr/bin/systemctl',['daemon-reload'],{timeout:10000});
 cp.execFileSync('/usr/bin/systemctl',['start','--no-block','vetro-standalone-manager.service'],{timeout:10000});
 return 'STANDALONE_MANAGER_QUEUED';
}
module.exports={queue:queue};
