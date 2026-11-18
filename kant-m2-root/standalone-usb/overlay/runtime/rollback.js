'use strict';
// Runtime-only trial cleanup. Never stops the installed Vetro or root services.
var cp=require('child_process'),fs=require('fs');
function stop(){
 ['vetro-standalone-web-trial.service','vetro-standalone-root-trial.service','vetro-standalone-dock-trial.service'].forEach(function(u){try{cp.execFileSync('/usr/bin/systemctl',['stop',u],{timeout:7000,stdio:'ignore'});}catch(e){}});
 var p='/tmp/vetro-standalone-dock-trial/tvlauncher.pid';
 try{var id=parseInt(fs.readFileSync(p,'utf8'),10),cmd=fs.readFileSync('/proc/'+id+'/cmdline','utf8');if(id>1&&cmd.indexOf('/opt/vetro-standalone-trial/native/dock/')>=0)process.kill(id,'SIGKILL');}catch(e){}
 console.log('STANDALONE_TRIAL_STOPPED_PRODUCTION_UNCHANGED');
}
module.exports={stop:stop};
