'use strict';
// One-boot pilot controller. The installed app and permanent root code stay intact.
var fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto');
var recovery=require('./usb-recovery.js');
function create(c){
 function digest(b){return crypto.createHash('sha256').update(b).digest('hex');}
 function sync(p){var d=fs.openSync(p,'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
 function exists(p){try{fs.lstatSync(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
 function command(args){if(c.command)return c.command(args);return cp.execFileSync('/usr/bin/systemctl',args,{timeout:10000,stdio:'ignore'});}
 function meta(p){var s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink())throw Error('Unexpected preference file');var label='_';if(c.chsmack){var out=cp.execFileSync(c.chsmack,[p],{encoding:'utf8'}),m=/access="([A-Za-z0-9_:./-]+)"/.exec(out);if(!m)throw Error('Missing preference label');label=m[1];}return {uid:s.uid,gid:s.gid,mode:s.mode&511,label:label};}
 function atomic(p,b,m){
  var t=p+'.pilot-'+process.pid+'-'+crypto.randomBytes(6).toString('hex'),d=fs.openSync(t,'wx',m.mode);
  try{var off=0;while(off<b.length){var n=fs.writeSync(d,b,off,b.length-off,off);if(n<=0)throw Error('Short write');off+=n;}fs.fchownSync(d,m.uid,m.gid);fs.fchmodSync(d,m.mode);fs.fsyncSync(d);}finally{fs.closeSync(d);}
  try{if(c.chsmack)cp.execFileSync(c.chsmack,['-a',m.label,t],{stdio:'ignore',timeout:3000});fs.renameSync(t,p);sync(path.dirname(p));}catch(e){try{fs.unlinkSync(t);}catch(ignored){}throw e;}
 }
 function json(p,obj,m){atomic(p,new Buffer(JSON.stringify(obj)+'\n'),m||{uid:0,gid:0,mode:384,label:'_'});}
 function readState(){try{return JSON.parse(fs.readFileSync(c.state,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 function disabled(){return exists(c.disable)||exists(c.sdkDisable);}
 function usbDisabled(){return !!recovery.find(c);}
 function pauseOriginal(){
  if(c.test){if(c.pauseOriginal)c.pauseOriginal();return;}
  if(JSON.parse(fs.readFileSync(c.production,'utf8')).enabled!==false)return;
  try{var p=parseInt(fs.readFileSync('/home/owner/tvlauncher.pid','utf8'),10),cmd=fs.readFileSync('/proc/'+p+'/cmdline','utf8'),cwd=fs.readlinkSync('/proc/'+p+'/cwd'),expected=fs.realpathSync('/opt/usr/home/owner/apps_rw/vetrotvapp/res/wgt/native/dock');if(p>1&&cmd.indexOf('tvlauncher-dotnet-2.0.dll')>=0&&cwd===expected)process.kill(p,'SIGKILL');}catch(e){if(e.code!=='ENOENT'&&e.code!=='ESRCH')throw e;}
 }
 function restorePreferences(){
  var s=readState();if(!s||!s.active)return false;
  var now=fs.readFileSync(c.production),current=JSON.parse(now.toString());
  // Restore exact bytes when untouched; otherwise preserve the user's other edits.
  if(digest(now)===s.modifiedHash)atomic(c.production,new Buffer(s.original,'base64'),s.productionMeta);
  else if(current.enabled===false&&!current.customApp){current.enabled=s.originalEnabled;json(c.production,current,meta(c.production));}
  var t=JSON.parse(fs.readFileSync(c.trial,'utf8'));t.enabled=false;json(c.trial,t,meta(c.trial));
  s.active=false;s.stoppedAt=Date.now();json(c.state,s);return true;
 }
 function stop(reason,detail){
  reason=reason||'manual';
  if(reason==='usb-marker'||c.persistent)json(c.disable,{disabled:true,reason:reason,at:Date.now()});
  var restored=true;try{restorePreferences();}catch(e){restored=false;}
  if(c.recoveryLog)json(c.recoveryLog,{reason:reason,detail:detail||null,at:Date.now(),watcherPid:process.pid,preferencesRestored:restored});
  ['vetro-standalone-web-trial.service','vetro-standalone-root-trial.service','vetro-standalone-dock-trial.service','vetro-standalone-expire-trial.timer'].forEach(function(u){try{command(['stop','--no-block',u]);}catch(e){/* A fallback dock need not have its own unit. Continue stopping the others. */}});
  if(c.recoveryHome)try{command(['start','--no-block','vetro-standalone-recovery-home.service']);}catch(e){}
  // The watcher can be this process: queue every recovery action before stopping it.
  try{command(['stop','--no-block',c.controllerUnit||'vetro-standalone-watch-trial.service']);}catch(e){}
  return restored?'PILOT_ROLLBACK_REQUESTED_PRODUCTION_PREFERENCES_RESTORED':'PILOT_STOP_REQUESTED_PREFERENCE_RESTORE_NOT_CONFIRMED';
 }
 function start(){
  if(fs.readFileSync(c.osRelease,'utf8').indexOf('BUILD_ID='+c.build+'\n')<0)throw Error('Firmware mismatch');
  if(disabled())return 'PILOT_DISABLED';
  var usb=recovery.find(c);if(usb){json(c.disable,{disabled:true,reason:'usb-marker',at:Date.now()});return 'PILOT_DISABLED';}
  var prior=readState();if(prior&&prior.active)throw Error('Previous pilot has not been rolled back');
  var before=fs.readFileSync(c.production),old=JSON.parse(before.toString()),t=JSON.parse(fs.readFileSync(c.trial,'utf8'));
  if(old.customApp)throw Error('Custom launcher selected; refusing takeover');
  var changed=Object.assign({},old,{enabled:false}),changedBytes=new Buffer(JSON.stringify(changed)+'\n');
  var state={active:true,startedAt:Date.now(),bootId:c.bootId||null,persistent:!!c.persistent,original:before.toString('base64'),originalEnabled:old.enabled,productionMeta:meta(c.production),modifiedHash:digest(changedBytes)};
  json(c.state,state);
  try{
   atomic(c.production,changedBytes,state.productionMeta);t.enabled=true;json(c.trial,t,meta(c.trial));
   if(c.install)c.install();
   pauseOriginal();
   command(['restart','--no-block'].concat(c.persistent?[]:['vetro-standalone-expire-trial.timer','vetro-standalone-watch-trial.service']).concat(['vetro-standalone-web-trial.service','vetro-standalone-root-trial.service']));
   return c.persistent?'STANDALONE_STARTED_USB_RECOVERY_ACTIVE':'PILOT_STARTED_AUTOMATIC_ROLLBACK_AFTER_10_MINUTES';
  }catch(e){try{restorePreferences();}catch(r){throw Error(e.message+'; preference restore failed: '+r.message);}throw e;}
 }
 function watch(){
  function tick(){try{var s=readState();if(!s||!s.active)return process.exit(0);var usb=recovery.find(c);if(usb){stop('usb-marker',usb);return process.exit(0);}if(disabled()||(c.maxMs>0&&Date.now()-s.startedAt>c.maxMs)){stop(disabled()?'disable-marker':'timeout');return process.exit(0);}pauseOriginal();if(c.checkHealth)c.checkHealth(s);}catch(e){stop('supervision-failed',{error:e.message});process.exit(1);}}
  setInterval(tick,2000);tick();
 }
 return {start:start,stop:stop,watch:watch,restorePreferences:restorePreferences,usbDisabled:usbDisabled};
}
function config(){
 var base=__dirname,c={build:'T-KTM2LDEUC-REL-202606052034',osRelease:'/etc/os-release',production:'/opt/usr/home/owner/share/vetro-dock.json',trial:'/opt/usr/home/owner/share/vetro-standalone-trial/vetro-dock.json',state:base+'/pilot-state.json',disable:base+'/PILOT-DISABLE',sdkDisable:'/opt/usr/home/owner/share/tmp/sdk_tools/VETRO-STANDALONE-DISABLE',mountInfo:'/proc/self/mountinfo',recoveryLog:base+'/recovery-event.json',recoveryHome:true,maxMs:600000,chsmack:'/usr/bin/chsmack'};
 c.install=function(){
  var manifest=JSON.parse(fs.readFileSync(base+'/manifest.json','utf8'));
  Object.keys(manifest.files).forEach(function(n){if(n.indexOf('..')>=0||n.charAt(0)==='/')throw Error('Unsafe manifest path');if(crypto.createHash('sha256').update(fs.readFileSync(base+'/'+n)).digest('hex')!==manifest.files[n])throw Error('Standalone file checksum mismatch: '+n);});
  // Node 4 resolves external shard modules with realpathSync, which lstats every
  // parent. Traversal (x) alone allows file reads but denies that metadata lookup.
  // Grant r+x to this service label; no parent write access or relabeling is needed.
  ['User::VetroStandalone User::Home rx','User::VetroStandalone User::App::Shared rx','User::VetroStandalone System::Privileged rw','System::Privileged User::VetroStandalone rw'].forEach(function(r){var d=fs.openSync('/sys/fs/smackfs/load2','w');try{fs.writeSync(d,r+'\n');}finally{fs.closeSync(d);}});
  fs.readdirSync(base+'/units').forEach(function(n){fs.writeFileSync('/run/systemd/system/'+n,fs.readFileSync(base+'/units/'+n));cp.execFileSync(c.chsmack,['-a','_','/run/systemd/system/'+n],{stdio:'ignore'});});
  fs.writeFileSync('/run/systemd/system/vetro-standalone-watch-trial.service','[Service]\nType=simple\nExecStart=/usr/bin/node -e "require(\''+base+'/pilot.js\').create(require(\''+base+'/pilot.js\').config()).watch()"\n');
  fs.writeFileSync('/run/systemd/system/vetro-standalone-expire-trial.service','[Service]\nType=oneshot\nExecStart=/usr/bin/node -e "require(\''+base+'/pilot.js\').create(require(\''+base+'/pilot.js\').config()).stop()"\n');
  fs.writeFileSync('/run/systemd/system/vetro-standalone-expire-trial.timer','[Timer]\nOnActiveSec=10min\nUnit=vetro-standalone-expire-trial.service\n');
  fs.writeFileSync('/run/systemd/system/vetro-standalone-recovery-home.service','[Unit]\nDescription=Return to Samsung Home after standalone recovery\nConflicts=vetro-standalone-web-trial.service vetro-standalone-root-trial.service vetro-standalone-dock-trial.service\nAfter=vetro-standalone-web-trial.service vetro-standalone-root-trial.service vetro-standalone-dock-trial.service\n[Service]\nType=oneshot\nRemainAfterExit=yes\nExecStart=/bin/sh -c "/usr/bin/aul_test launch_async_for_uid com.samsung.tv.csfs 5001 && /bin/sleep 1 && /usr/bin/aul_test launch_async_for_uid com.samsung.tv.csfs 5001"\nTimeoutStartSec=8\n');
  cp.execFileSync('/usr/bin/systemctl',['daemon-reload'],{stdio:'ignore',timeout:10000});
 };
 return c;
}
module.exports={create:create,config:config};
