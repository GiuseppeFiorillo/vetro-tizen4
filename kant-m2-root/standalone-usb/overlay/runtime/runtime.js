'use strict';
// Runs as root from ExecStartPre, after tmpfiles setup on every service start.
var fs=require('fs'),cp=require('child_process');
function prepare(dir,options){
 dir=dir||'/tmp/vetro-standalone-dock-trial';options=options||{};
 if(process.getuid()!==0)throw Error('Runtime setup requires root');
 try{fs.mkdirSync(dir,448);}catch(e){if(e.code!=='EEXIST')throw e;}
 var s=fs.lstatSync(dir);
 if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0)throw Error('Unsafe runtime directory');
 fs.chmodSync(dir,448);
 if(options.chsmack!==false)cp.execFileSync('/usr/bin/chsmack',['-a','_',dir],{stdio:'ignore',timeout:3000});
 return 'STANDALONE_RUNTIME_READY';
}
module.exports={prepare:prepare};
