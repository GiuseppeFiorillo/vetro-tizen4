'use strict';
var fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
function hash(b){return crypto.createHash('sha256').update(b).digest('hex');}
function run(){
 var m=require('./pilot-manifest.json'),p='/opt/etc/parseinfo.sh',b=fs.readFileSync(p),h=hash(b);
 if(h===m.hookSha256){
  var original=fs.readFileSync('/opt/vetro-root/hook.awk');if(hash(original)!==m.baseHookSha256)throw Error('Base root hook checksum mismatch');
  var t=p+'.cancel-'+process.pid,d=fs.openSync(t,'wx',365);try{var off=0;while(off<original.length)off+=fs.writeSync(d,original,off,original.length-off,off);fs.fchmodSync(d,365);fs.fsyncSync(d);}finally{fs.closeSync(d);}
  cp.execFileSync('/usr/bin/chsmack',['-a','_',t]);fs.renameSync(t,p);d=fs.openSync('/opt/etc','r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}
 }else if(h!==m.baseHookSha256)throw Error('Unexpected boot file; refusing overwrite');
 var pilot=require('./pilot.js');console.log(pilot.create(pilot.config()).stop());
}
function request(){
 var child=cp.spawn('/usr/bin/node',['-e',"setTimeout(function(){require('"+__dirname+"/cancel.js').run()},1000)"],{detached:true,stdio:'ignore'});child.unref();return 'STANDALONE_ROLLBACK_SCHEDULED';
}
module.exports={run:run,request:request};
