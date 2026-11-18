'use strict';
// Build-time adapters only. Never imported by the running TV service.
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),profile=require('../profiles/ue65nu7100-1400.2.json');
function once(source,old,value,label){const count=source.split(old).length-1;if(count!==1)throw Error(label+': expected one upstream hook, found '+count+'; review this upstream change');return source.replace(old,()=>value);}
function transform(name,bytes,p=profile){
 if(!name.endsWith('.js'))return bytes;
 let s=bytes.toString('utf8').replace(/\/(?:opt\/usr\/)?home\/owner\/share(?=\/|['"])/g,()=>p.data);
 if(name==='service/platform.js')s=once(s,'var paths = [requestPath, REQUEST_DEFAULT, REQUEST_FALLBACK];','var paths = process.env.VETRO_ROOT_REQUEST ? [requestPath] : [requestPath, REQUEST_DEFAULT, REQUEST_FALLBACK];','root-request isolation');
 if(name==='service/auth.js'){
  s=once(s,"var COOKIE = 'vetro_session';","var COOKIE = '"+p.cookie+"';",'dashboard cookie namespace');
  s=once(s,"var PAIR_COOKIE = 'vetro_pair';","var PAIR_COOKIE = '"+p.pairCookie+"';",'pairing cookie namespace');
 }
 if(name==='service/dock.js'){
  s=once(s,"var RUN_DIR = '/home/owner';","var RUN_DIR = process.env.VETRO_DOCK_RUN_DIR || '"+p.runDir+"';",'dock runtime path');
  s=once(s,"var UNIT = 'vetro-dock';","var UNIT = '"+p.dockUnit+"';",'dock service namespace');
 }
 if(name==='service/main.js'){
  const start='function showPairingCode(attempt) {',end='\nvar server = http.createServer';
  if(s.split(start).length!==2||s.split(end).length!==2)throw Error('pairing-display integration changed upstream');
  const a=s.indexOf(start),z=s.indexOf(end,a);if(z<0)throw Error('pairing-display block ordering changed upstream');
  const command="/usr/bin/node -e \"require('"+p.base+"/pairing-broker.js').show()\"";
  s=s.slice(0,a)+`function showPairingCode(attempt) {
    attempt = attempt || 0;
    agentExecute(${JSON.stringify(command)}, 5000).catch(function () {
        if (attempt >= 20 || !auth.pendingLive()) return;
        setTimeout(function () { if (auth.pendingLive()) showPairingCode(attempt + 1); }, 1000);
    });
}
`+s.slice(z);
  const timers=['selfStartupAttempts','winsBootAttempts','dnsRestoreAttempts','keepRemovedBootAttempts','keepRemovedTimer','startupWarmAttempts','updateConfirmTimer'];
  for(const n of timers){if((s.match(new RegExp('^var '+n+'\\b','gm'))||[]).length!==1)throw Error('background policy hook changed upstream: '+n);}
  s=s.split('\n').filter(l=>!/^var (selfStartupAttempts|winsBootAttempts|dnsRestoreAttempts|keepRemovedBootAttempts|keepRemovedTimer|startupWarmAttempts|updateConfirmTimer)\b/.test(l)).join('\n');
  const old='    if (++updateConfirmAttempts > 60) { clearInterval(updateConfirmTimer); return; }',endTimer='if (updateConfirmTimer.unref) updateConfirmTimer.unref();';
  if(s.split(old).length!==2||s.split(endTimer).length!==2)throw Error('update-confirm integration changed upstream');
  const x=s.indexOf(old),y=s.indexOf(endTimer,x);s=s.slice(0,x)+s.slice(y+endTimer.length);
 }
 new vm.Script(s,{filename:name});return Buffer.from(s);
}
function freshRecovery(pilot,permanent){
 pilot=once(pilot,'recoveryHome:true,maxMs:600000','recoveryHome:true,keepMaintenance:true,maxMs:600000','maintenance recovery flag');
 pilot=once(pilot,"'vetro-standalone-expire-trial.timer'].forEach","'vetro-standalone-expire-trial.timer'].filter(function(u){return !c.keepMaintenance||(u!=='vetro-standalone-web-trial.service'&&u!=='vetro-standalone-root-trial.service');}).forEach",'maintenance recovery services');
 pilot=once(pilot,'Conflicts=vetro-standalone-web-trial.service vetro-standalone-root-trial.service vetro-standalone-dock-trial.service\\n','','native Home coexistence');
 pilot=once(pilot,'  if(c.recoveryLog)json(c.recoveryLog,',`  if(c.keepMaintenance&&!c.test){try{var kp=parseInt(fs.readFileSync('/tmp/vetro-standalone-dock-trial/tvlauncher.pid','utf8'),10);if(kp>1&&fs.readFileSync('/proc/'+kp+'/cmdline','utf8').indexOf('tvlauncher-dotnet-2.0.dll')>=0&&fs.readlinkSync('/proc/'+kp+'/cwd')===fs.realpathSync(__dirname+'/native/dock'))process.kill(kp,'SIGKILL');}catch(ignored){}}
  if(c.recoveryLog)json(c.recoveryLog,`,'stop only verified native dock');
 permanent=once(permanent,"if(result==='PILOT_DISABLED')return;","if(result==='PILOT_DISABLED'){c.install();cp.execFileSync('/usr/bin/systemctl',['restart','--no-block','vetro-standalone-root-trial.service','vetro-standalone-web-trial.service'],{timeout:10000});return;}",'recovery-mode boot');
 return {pilot,permanent};
}
function runtimeFile(name){if(!/^[a-z0-9.-]+$/.test(name))throw Error('Invalid adapter runtime filename');return fs.readFileSync(path.join(root,'overlay/runtime',name));}
function units(p=profile){const out={};for(const n of fs.readdirSync(path.join(root,'overlay/units')).sort()){out['units/'+n]=Buffer.from(fs.readFileSync(path.join(root,'overlay/units',n),'utf8').replace(/\r\n/g,'\n').replace(/\{\{(\w+)\}\}/g,(_,key)=>{if(!Object.hasOwn(p,key))throw Error('Unknown unit-template key '+key);return String(p[key]);}));}return out;}
module.exports={profile,root,once,transform,freshRecovery,runtimeFile,units};
