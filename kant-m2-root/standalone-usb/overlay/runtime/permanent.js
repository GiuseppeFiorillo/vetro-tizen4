'use strict';
// Uses the tested controller and USB marker; root boot remains independent.
var fs=require('fs'),cp=require('child_process'),pilot=require('./pilot.js');
function configuration(){
 var c=pilot.config();c.persistent=true;c.maxMs=0;c.controllerUnit='vetro-standalone-manager.service';
 c.bootId=fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();
 var badSince=0;
 c.checkHealth=function(s){
  // Allow the owner service and native dock time to settle after a cold boot.
  if(Date.now()-s.startedAt<120000)return;
  var units=['vetro-standalone-web-trial.service','vetro-standalone-root-trial.service'];
  var healthy=units.every(function(u){try{return cp.execFileSync('/usr/bin/systemctl',['is-active',u],{encoding:'utf8',timeout:3000}).trim()==='active';}catch(e){return false;}});
  try{var pid=parseInt(fs.readFileSync('/tmp/vetro-standalone-dock-trial/tvlauncher.pid','utf8'),10);if(pid<=1)throw Error('Invalid dock PID');var cmd=fs.readFileSync('/proc/'+pid+'/cmdline','utf8'),cwd=fs.readlinkSync('/proc/'+pid+'/cwd');healthy=healthy&&cmd.indexOf('tvlauncher-dotnet-2.0.dll')>=0&&cwd===fs.realpathSync('/opt/vetro-standalone-trial/native/dock');}catch(e){healthy=false;}
  if(healthy)badSince=0;else if(!badSince)badSince=Date.now();else if(Date.now()-badSince>30000)throw Error('Standalone services or homescreen unhealthy for 30 seconds');
 };
 return c;
}
function reconcilePrevious(c,p){
 var state;
 try{state=JSON.parse(fs.readFileSync(c.state,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(state&&state.active){
  if(state.bootId===c.bootId)throw Error('Standalone already active this boot');
  // A previous boot's saved original is authoritative, including after power loss.
  p.restorePreferences();
 }
}
function run(){
 var c=configuration(),p=pilot.create(c);reconcilePrevious(c,p);
 try{var result=p.start();console.log(result);if(result==='PILOT_DISABLED')return;p.watch();}
 catch(e){p.stop('startup-failed',{error:e.message});throw e;}
}
module.exports={run:run,configuration:configuration,reconcilePrevious:reconcilePrevious};
