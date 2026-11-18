'use strict';
// Firmware Node 4. Configuration is inserted by the reproducible package builder.
var fs=require('fs'),cp=require('child_process'),crypto=require('crypto'),path=require('path');
var PROFILE=/*PROFILE*/null;
function digest(b){return crypto.createHash('sha256').update(b).digest('hex');}
function exists(p){try{fs.lstatSync(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
function create(o){
 o=o||{};var prefix=o.prefix||'',usb=o.usb,files=PROFILE.files;
 function tv(p){return prefix+p;}
 function command(file,args){return o.command?o.command(file,args):cp.execFileSync(file,args,{timeout:30000,stdio:'ignore'});}
 function sync(p){if(o.sync)return o.sync(p);var fd=fs.openSync(p,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
 function atomic(p,b,mode){var t=p+'.usb-'+process.pid,d=fs.openSync(t,'wx',mode);try{var off=0;while(off<b.length){var n=fs.writeSync(d,b,off,b.length-off,off);if(n<=0)throw Error('Short write');off+=n;}fs.fchmodSync(d,mode);fs.fsyncSync(d);}finally{fs.closeSync(d);}command('/usr/bin/chsmack',['-a','_',t]);fs.renameSync(t,p);sync(path.dirname(p));}
 function privateFile(p,b){atomic(p,new Buffer(b),384);}
 function status(phase,extra){var s={packageId:PROFILE.packageId,phase:phase,at:Date.now()};Object.keys(extra||{}).forEach(function(k){s[k]=extra[k];});try{fs.writeFileSync(path.join(usb,'RESULT.JSON'),JSON.stringify(s,null,2)+'\n');sync(path.join(usb,'RESULT.JSON'));sync(usb);}catch(e){}return s;}
 function preflight(){
  if(!o.fixture&&process.getuid()!==0)throw Error('Root required');
  if(fs.readFileSync(tv('/etc/os-release'),'utf8').indexOf('BUILD_ID='+PROFILE.build+'\n')<0)throw Error('Unsupported firmware build');
  if(!o.fixture&&cp.execFileSync('/bin/uname',['-r'],{encoding:'utf8'}).trim()!=='4.1.10')throw Error('Unsupported kernel');
  if(digest(fs.readFileSync(tv('/opt/etc/parseinfo.sh')))!==PROFILE.vendorHash)throw Error('Startup hook is not the exact vendor original');
  ['/opt/vetro-root','/opt/vetro-standalone-trial','/opt/usr/home/owner/share/vetro-standalone-trial','/opt/vetro-usb-staging'].forEach(function(p){if(exists(tv(p)))throw Error('Existing installation or incomplete install: '+p);});
  if(exists(tv('/opt/usr/home/owner/share/tmp/sdk_tools/VETRO-ROOT-DISABLE'))||exists(tv('/opt/usr/home/owner/share/tmp/sdk_tools/VETRO-STANDALONE-DISABLE')))throw Error('Existing administrator disable marker');
  var d=tv('/opt/usr/home/owner/share'),st=fs.lstatSync(d);if(!st.isDirectory()||st.isSymbolicLink())throw Error('Unsafe owner share');
  var pref=tv('/opt/usr/home/owner/share/vetro-dock.json');if(exists(pref)){st=fs.lstatSync(pref);if(!st.isFile()||st.isSymbolicLink())throw Error('Unsafe launcher preference');if(JSON.parse(fs.readFileSync(pref,'utf8')).customApp)throw Error('Existing custom launcher selected');}
  if(digest(fs.readFileSync(path.join(usb,'PAYLOAD.TGZ')))!==PROFILE.archiveHash)throw Error('USB payload checksum mismatch');
  return {compatible:true,packageId:PROFILE.packageId,freshInstall:true};
 }
 function walk(p,fn){var s=fs.lstatSync(p);if(s.isSymbolicLink())throw Error('Unexpected symlink');fn(p,s);if(s.isDirectory())fs.readdirSync(p).forEach(function(n){walk(path.join(p,n),fn);});}
 function install(){
  var hookArmed=false,staging=tv('/opt/vetro-usb-staging'),root=tv('/opt/vetro-root'),base=tv('/opt/vetro-standalone-trial'),data=tv('/opt/usr/home/owner/share/vetro-standalone-trial');
  try{
   var completed=base+'/usb-install-complete.json';
   if(exists(completed)){var cs=fs.lstatSync(completed),record=JSON.parse(fs.readFileSync(completed,'utf8')),current=digest(fs.readFileSync(tv('/opt/etc/parseinfo.sh')));if(!cs.isFile()||cs.isSymbolicLink()||cs.uid!==0||record.packageId!==PROFILE.packageId||record.hookHash!==PROFILE.hookHash||(current!==PROFILE.vendorHash&&current!==PROFILE.hookHash))throw Error('Existing completion record does not match');status('installed-remove-usb',{restartRequired:true,alreadyInstalled:true});return {ok:true,alreadyInstalled:true};}
   preflight();status('validated');fs.mkdirSync(staging,448);
   command('/bin/tar',['-xzf',path.join(usb,'PAYLOAD.TGZ'),'-C',staging]);
   Object.keys(files).forEach(function(n){if(n.indexOf('..')>=0||n.charAt(0)==='/')throw Error('Unsafe manifest entry');var p=path.join(staging,n),s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||digest(fs.readFileSync(p))!==files[n])throw Error('Extracted checksum: '+n);});
   // Only package-produced regular files are present; ownership is never imported.
   walk(staging,function(p,s){fs.chownSync(p,0,0);fs.chmodSync(p,s.isDirectory()?493:420);command('/usr/bin/chsmack',['-a','_',p]);});
   fs.renameSync(staging+'/root',root);fs.chmodSync(root,448);
   fs.renameSync(staging+'/standalone',base);sync(tv('/opt'));
   ['config.json','hook.awk','vendor-original'].forEach(function(n){fs.chmodSync(root+'/'+n,384);});
   fs.chmodSync(base+'/root-daemon',448);fs.chmodSync(base+'/root-daemon/root-daemon.js',384);
   var backup=base+'/usb-install-backup';fs.mkdirSync(backup,448);command('/usr/bin/chsmack',['-a','_',backup]);
   privateFile(backup+'/vendor-original',fs.readFileSync(tv('/opt/etc/parseinfo.sh')));
   var pref=tv('/opt/usr/home/owner/share/vetro-dock.json'),hadPref=exists(pref);
   if(hadPref)privateFile(backup+'/original-dock.json',fs.readFileSync(pref));
   privateFile(backup+'/metadata.json',JSON.stringify({originalDockExisted:hadPref,packageId:PROFILE.packageId})+'\n');
   // A fresh TV has no developer app preferences. This is a neutral rollback baseline.
   if(!hadPref){atomic(pref,new Buffer('{"enabled":false}\n'),420);fs.chownSync(pref,5001,100);command('/usr/bin/chsmack',['-a','User::App::Shared',pref]);}
   fs.mkdirSync(data,448);fs.chownSync(data,5001,100);command('/usr/bin/chsmack',['-a','User::VetroStandalone',data]);
   var defaults={'vetro-auth.json.mode':'{"enabled":true,"disabled":false}\n','vetro-dock.json':'{"enabled":false}\n','vetro-dock-apps.tsv':PROFILE.defaultApps,'vetro-dock-inputs.tsv':'tv\tTV\tsource:0\n'};
   Object.keys(defaults).forEach(function(n){var p=data+'/'+n;fs.writeFileSync(p,defaults[n],{mode:384});fs.chownSync(p,5001,100);command('/usr/bin/chsmack',['-a','User::VetroStandalone',p]);sync(p);});
   privateFile(base+'/autostart.json',JSON.stringify({enabled:true,installedAt:Date.now(),packageId:PROFILE.packageId})+'\n');
   privateFile(base+'/installed-autostart.json',JSON.stringify({installedAt:Date.now(),hookHash:PROFILE.hookHash,usbRecovery:true,packageId:PROFILE.packageId})+'\n');
   walk(root,function(p){sync(p);});walk(base,function(p){sync(p);});sync(data);
   // Commit only after all code, rollback data and pairing-on settings are durable.
   hookArmed=true;atomic(tv('/opt/etc/parseinfo.sh'),fs.readFileSync(root+'/hook.awk'),365);
   if(digest(fs.readFileSync(tv('/opt/etc/parseinfo.sh')))!==PROFILE.hookHash)throw Error('Hook commit mismatch');
   privateFile(completed,JSON.stringify({packageId:PROFILE.packageId,hookHash:PROFILE.hookHash,completedAt:Date.now()})+'\n');
   status('installed-remove-usb',{restartRequired:true,pairingRequired:true,dashboardPort:18100});
   // Do not start the launcher while the exploit stick remains inserted.
   // The next clean boot uses the already-tested recurring startup path.
   return {ok:true,restartRequired:true};
  }catch(e){
   if(hookArmed){try{atomic(tv('/opt/etc/parseinfo.sh'),new Buffer(PROFILE.vendorBase64,'base64'),365);}catch(r){status('restore-failed',{error:e.message,restoreError:r.message});throw r;}}
   status('failed',{error:e.message,hookCommitted:hookArmed});throw e;
  }
 }
 return {preflight:preflight,install:install};
}
function withLock(lock,fn){
 var fd;
 try{fd=fs.openSync(lock,'wx',384);}catch(e){if(e.code!=='EEXIST')throw e;var s=fs.lstatSync(lock);if(!s.isFile()||s.isSymbolicLink()||s.uid!==0||s.size>80)throw Error('Unsafe installer lock');var pid=parseInt(fs.readFileSync(lock,'utf8'),10);if(!(pid>1))throw Error('Malformed installer lock');try{process.kill(pid,0);return {ok:false,alreadyRunning:true};}catch(alive){if(alive.code!=='ESRCH')throw alive;}fs.unlinkSync(lock);fd=fs.openSync(lock,'wx',384);}
 try{fs.writeSync(fd,String(process.pid)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 try{return fn();}finally{fs.unlinkSync(lock);}
}
function run(usb){return withLock('/tmp/vetro-usb-installer.lock',function(){return create({usb:usb}).install();});}
module.exports={create:create,run:run,withLock:withLock,profile:PROFILE};
