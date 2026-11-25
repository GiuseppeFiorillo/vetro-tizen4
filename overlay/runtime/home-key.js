'use strict';
// Optional, fail-open Home routing. Node 4 compatible; never writes the vendor DB.
var fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
var base=__dirname,run='/run/vetro-home-key',database='/opt/dbspace/.app-context.db';
var vendor='app-context-manager.service',isolated='vetro-home-key-context.service';
var disable=base+'/HOME-KEY-DISABLE',statePath=run+'/state.json';
var rule="appid='com.samsung.tv.csfs' AND key='XF86Home' AND longpress IS NULL AND override IS NULL AND on_selector='~system:product:lfd' AND request='launch' AND target_selector='package:com.samsung.tv.csfs' AND args='entry_point:smarthub_key'";
function hash(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
function boot(){return fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();}
function exists(p){try{fs.lstatSync(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
function command(file,args){return cp.execFileSync(file,args,{encoding:'utf8',timeout:12000}).trim();}
function sys(args){return command('/usr/bin/systemctl',args);}
function active(unit){try{return sys(['is-active',unit])==='active';}catch(e){return false;}}
function root(){fs.writeFileSync('/proc/self/attr/current','_');if(process.getuid()!==0||base!=='/opt/vetro-standalone-trial')throw Error('Unexpected Home-key context');if(fs.readlinkSync('/proc/self/ns/mnt')!==fs.readlinkSync('/proc/1/ns/mnt'))throw Error('Supervisor requires global mount namespace');}
function write(p,data){if(exists(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Unsafe Home-key path');var b=Buffer.isBuffer(data)?data:new Buffer(data),t=p+'.'+process.pid+'.tmp',fd=fs.openSync(t,'wx',384);try{var off=0;while(off<b.length){var n=fs.writeSync(fd,b,off,b.length-off,off);if(n<=0)throw Error('Short Home-key write');off+=n;}fs.fsyncSync(fd);}finally{fs.closeSync(fd);}command('/usr/bin/chsmack',['-a','_',t]);fs.renameSync(t,p);var d=fs.openSync(run,'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
function read(){try{return JSON.parse(fs.readFileSync(statePath,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function save(s){write(statePath,JSON.stringify(s)+'\n');}
function ensureRun(){if(!exists(run))fs.mkdirSync(run,448);var st=fs.lstatSync(run);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==0||(st.mode&63))throw Error('Unsafe Home-key runtime');command('/usr/bin/chsmack',['-a','_',run]);}
function sql(db,text){return command('/usr/bin/sqlite3',[db,text]);}
function dock(){var pid=Number(fs.readFileSync('/tmp/vetro-standalone-dock-trial/tvlauncher.pid','utf8'));if(pid<2)throw Error('Invalid dock PID');var p='/proc/'+pid,a=fs.readFileSync(p+'/cmdline','utf8').split('\0');if(a[0]!=='/usr/share/dotnet/corerun'||a.indexOf('tvlauncher-dotnet-2.0.dll')<0||fs.readlinkSync(p+'/cwd')!==base+'/native/dock')throw Error('Unexpected dock');return pid;}
function blocked(){var c=require('./pilot.js').config();return exists(disable)||exists(c.disable)||exists(c.sdkDisable)||!!require('./usb-recovery.js').find(c);}
function ready(){if(blocked())return false;try{dock();return JSON.parse(fs.readFileSync('/opt/usr/home/owner/share/vetro-standalone-trial/vetro-dock.json','utf8')).enabled===true&&active('vetro-standalone-web-trial.service')&&active('vetro-standalone-root-trial.service');}catch(e){return false;}}
function restore(reason){root();var s=read();if(!s||s.boot!==boot()||!s.originalStopped)return {restored:true,owned:false};try{sys(['stop',isolated]);}catch(e){if(active(isolated))throw e;}sys(['start',vendor]);if(!active(vendor))throw Error('Original key routing did not resume');s.phase='restored';s.originalStopped=false;s.reason=reason||'service-stop';s.restoredAt=Date.now();save(s);return {restored:true,reason:s.reason};}
function disableFailure(error){write(disable,JSON.stringify({disabled:true,reason:String(error.message||error),at:Date.now()})+'\n');}
function prepare(){root();ensureRun();if(fs.readFileSync('/etc/os-release','utf8').indexOf('BUILD_ID=T-KTM2LDEUC-REL-202606052034\n')<0)throw Error('Unsupported firmware');if(!ready()||!active(vendor))throw Error('Original routing or launcher not ready');var drops=sys(['show',vendor,'-p','DropInPaths']);if(drops!=='DropInPaths=')throw Error('Unreviewed vendor service override');
 var st=fs.lstatSync(database);if(!st.isFile()||st.isSymbolicLink()||st.uid!==0)throw Error('Unexpected key database');
 var originalHash=hash(database),candidate=run+'/candidate.db';write(candidate,fs.readFileSync(database));
 if(sql(candidate,'PRAGMA integrity_check;')!=='ok'||sql(candidate,'SELECT count(*) FROM key_filter WHERE '+rule+';')!=='1'||sql(candidate,"SELECT count(*) FROM key_filter WHERE key='XF86Home' AND longpress IS NULL;")!=='1')throw Error('Unexpected Home rules');
 var count=Number(sql(candidate,'SELECT count(*) FROM key_filter;')),holds=sql(candidate,"SELECT * FROM key_filter WHERE key='XF86Home' AND longpress IS NOT NULL ORDER BY appid;");
 sql(candidate,'BEGIN IMMEDIATE; DELETE FROM key_filter WHERE '+rule+'; COMMIT;');
 if(sql(candidate,'PRAGMA integrity_check;')!=='ok'||Number(sql(candidate,'SELECT count(*) FROM key_filter;'))!==count-1||sql(candidate,"SELECT * FROM key_filter WHERE key='XF86Home' AND longpress IS NOT NULL ORDER BY appid;")!==holds)throw Error('Candidate verification failed');
 var managers=[];fs.readdirSync('/proc').forEach(function(n){if(!/^[0-9]+$/.test(n))return;try{if(fs.readFileSync('/proc/'+n+'/cmdline','utf8').split('\0')[0]==='/usr/bin/tvctx-manager')managers.push(n);}catch(e){}});if(managers.length!==1)throw Error('Expected one original context manager');
 var env={},allowed=['HOME','USER','PATH','XDG_RUNTIME_DIR','WAYLAND_DISPLAY','ECORE_EVAS_ENGINE','ELM_ENGINE','ELM_PROFILE','ELM_DISPLAY','DBUS_SYSTEM_BUS_ADDRESS','DBUS_SESSION_BUS_ADDRESS','LD_LIBRARY_PATH','LD_USE_LOAD_BIAS','DISPLAY','LANG','TZ'];fs.readFileSync('/proc/'+managers[0]+'/environ','utf8').split('\0').forEach(function(x){var i=x.indexOf('=');if(i>0&&allowed.indexOf(x.slice(0,i))>=0)env[x.slice(0,i)]=x.slice(i+1);});
 var plan={database:database,originalHash:originalHash,candidateHash:hash(candidate),systemNamespace:fs.readlinkSync('/proc/self/ns/mnt'),environment:env};write(run+'/plan.json',JSON.stringify(plan)+'\n');return plan;
}
function apply(){var plan=prepare();if(!ready()||hash(database)!==plan.originalHash)throw Error('Preflight changed');var s={phase:'applying',boot:boot(),originalStopped:true,originalHash:plan.originalHash,candidateHash:plan.candidateHash,startedAt:Date.now()};save(s);
 try{sys(['stop',vendor]);command('/usr/bin/systemd-run',['--quiet','--unit='+isolated,'/bin/sh','-c',"printf '%s' '_' > /proc/self/attr/current; exec /usr/bin/unshare -m /usr/bin/node -e \"require('"+base+"/home-key-launch.js')\" >/dev/null 2>&1"]);
  var end=Date.now()+10000,ok=false;while(Date.now()<end){try{var n=JSON.parse(fs.readFileSync(run+'/namespace.json','utf8'));if(fs.existsSync('/proc/'+n.managerPid)&&fs.existsSync('/proc/'+n.wrapperPid)&&fs.readlinkSync('/proc/'+n.wrapperPid+'/ns/mnt')!==plan.systemNamespace&&hash('/proc/'+n.wrapperPid+'/root'+database)===plan.candidateHash&&active(isolated)){ok=true;break;}}catch(e){}command('/bin/sleep',['0.1']);}if(!ok||hash(database)!==plan.originalHash||blocked())throw Error('Private key routing did not become ready');s.phase='active';save(s);return s;
 }catch(e){restore('apply-error');throw e;}
}
function status(){root();var s=read();return {state:s,disabled:exists(disable),originalActive:active(vendor),overrideActive:active(isolated),globalDatabaseUnchanged:!s||hash(database)===s.originalHash};}
function runSupervisor(){root();ensureRun();restore('supervisor-restart');var started=Date.now(),running=false,badSince=0,timer;
 function fail(e){try{disableFailure(e);}finally{try{restore('health-failure');}finally{if(timer)clearInterval(timer);process.exitCode=1;}}}
 function tick(){try{if(blocked()){restore('disabled-or-usb');clearInterval(timer);return;}if(!running){if(ready()&&active(vendor)){apply();running=true;}else if(Date.now()-started>120000)throw Error('Launcher startup timed out');return;}
  var s=read();if(!s||s.phase!=='active'||!active(isolated)||active(vendor)||hash(database)!==s.originalHash)throw Error('Key routing health failed');
  if(ready())badSince=0;else if(!badSince)badSince=Date.now();else if(Date.now()-badSince>3000)throw Error('Launcher unavailable');
 }catch(e){fail(e);}}
 timer=setInterval(tick,1000);tick();
}
module.exports={run:runSupervisor,restore:restore,status:status,rule:rule};
