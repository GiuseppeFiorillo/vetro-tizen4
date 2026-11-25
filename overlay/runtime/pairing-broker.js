'use strict';
// TV-local display component. Never sends pairing codes to the PC or logs.
var fs=require('fs'),http=require('http'),cp=require('child_process');
var base=__dirname,dir='/tmp/vetro-standalone-pairing',state=dir+'/state',lock=dir+'/lock';
function alive(p){try{process.kill(p,0);return true;}catch(e){return e.code==='EPERM';}}
function show(){
 try{fs.mkdirSync(dir,448);}catch(e){if(e.code!=='EEXIST')throw e;}
 try{var old=parseInt(fs.readFileSync(lock,'utf8'),10);if(old&&alive(old))return;}catch(e){}
 var child=cp.spawn('/usr/bin/node',['-e',"require('"+base+"/pairing-broker.js').run()"],{detached:true,stdio:'ignore'});child.unref();
}
function run(){
 try{fs.writeFileSync('/proc/self/attr/current','_');}catch(e){}
 fs.writeFileSync(lock,String(process.pid),{mode:384});
 var ui=null,timer=null,busy=false,until=Date.now()+125000;
 function stop(){if(timer)clearInterval(timer);try{fs.unlinkSync(state);}catch(e){}if(ui)try{ui.kill('SIGTERM');}catch(e){}try{fs.unlinkSync(lock);}catch(e){}process.exit(0);}
 function poll(){
  if(busy)return;if(Date.now()>until)return stop();busy=true;
  var req=http.get('http://127.0.0.1:18100/auth/pending',function(res){var b='';res.on('data',function(c){b+=c;if(b.length>4096)req.abort();});res.on('end',function(){busy=false;try{
   var p=JSON.parse(b);if(res.statusCode!==200||!p.code)return stop();
   if(!/^\d{6}$/.test(String(p.code)))return stop();
   var expires=Date.now()+Math.max(0,Math.min(120,Number(p.expiresIn)||0))*1000;
   fs.writeFileSync(state,String(p.code)+'\n'+String(p.name||'Browser').replace(/[\r\n]/g,' ').slice(0,40)+'\n'+expires+'\n',{mode:384});
   if(!ui){ui=cp.spawn('/usr/share/dotnet/corerun',['-c','/usr/share/dotnet/shared/Microsoft.NETCore.App/2.0.0',base+'/native/pairing/vetro-pairing-display.dll',state],{stdio:'ignore',env:process.env});ui.on('exit',function(){stop();});}
  }catch(e){stop();}});});
  req.setTimeout(3000,function(){req.abort();busy=false;});req.on('error',function(){busy=false;});
 }
 process.on('SIGTERM',stop);process.on('SIGINT',stop);timer=setInterval(poll,1000);poll();
}
module.exports={show:show,run:run};
