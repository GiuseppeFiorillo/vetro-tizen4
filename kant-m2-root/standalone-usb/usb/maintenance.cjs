'use strict';
// Node18+; pairs with a visible TV code, holds its token only for this run.
const readline=require('readline');
const args=process.argv.slice(2),host=args[0],action=args[1]||'status';
if(!host||!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)||!['status','resume'].includes(action))throw Error('Usage: node maintenance.cjs <TV_IP> status|resume');
const base='http://'+host+':18100';let token;
async function call(route,body){const headers={};if(token)headers.Authorization='Bearer '+token;const o={headers,signal:AbortSignal.timeout(45000)};if(body!==undefined){o.method='POST';headers['Content-Type']='application/json';o.body=JSON.stringify(body);}const r=await fetch(base+route,o),x=await r.json();if(!r.ok)throw Error(x.error||('HTTP '+r.status));return x;}
(async()=>{
 const p=await call('/auth/pair',{name:'USB package maintenance'});
 const rl=readline.createInterface({input:process.stdin,output:process.stdout});
 const code=await new Promise(resolve=>rl.question('Enter the six-digit code shown on your TV: ',resolve));rl.close();
 if(!/^\d{6}$/.test(code.trim()))throw Error('Expected six digits');
 const auth=await call('/auth/confirm',{id:p.id,code:code.trim()});token=auth.token;
 if(!token)throw Error('Pairing did not return a token');
 if(action==='resume'){
  const cmd="/usr/bin/node -e \"var f=require('fs'),cp=require('child_process'),b='/opt/vetro-standalone-trial/',c=require(b+'pilot.js').config(),r=require(b+'usb-recovery.js');if(r.find(c))throw Error('Remove recovery USB first');var s=f.lstatSync(c.disable);if(!s.isFile()||s.isSymbolicLink()||s.uid!==0)throw Error('Unsafe disable marker');var d=JSON.parse(f.readFileSync(c.disable,'utf8'));if(d.reason!=='usb-marker')throw Error('Requires maintenance diagnosis: '+d.reason);f.unlinkSync(c.disable);var fd=f.openSync(b,'r');f.fsyncSync(fd);f.closeSync(fd);var child=cp.spawn('/usr/bin/node',['-e',\\\"setTimeout(function(){require('/opt/vetro-standalone-trial/boot.js').queue()},1500)\\\"],{detached:true,stdio:'ignore'});child.unref();console.log('Resume scheduled');\"";
  const x=await call('/exec',{cmd});if(!x.ok||x.exit_code!==0)throw Error('Resume failed: '+JSON.stringify(x));console.log(x.output||'Resume queued');
 }
 let s;for(let i=0;i<10;i++){try{if(action==='resume')await new Promise(r=>setTimeout(r,2000));s=await call('/status');if(s.agent&&s.agent.connected)break;}catch(e){if(i===9)throw e;}}console.log(JSON.stringify({self:s.self,root:s.agent},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
