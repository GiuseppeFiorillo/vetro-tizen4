'use strict';
// Execute the boot-time policy installer against a fake filesystem: never write
// to Smack or systemd on the test host. Keep both parent metadata checks allowed
// without giving the web service write access to either Samsung directory label.
const assert=require('assert').strict,fs=require('fs'),path=require('path'),vm=require('vm');
const adapter=require('../../lib/standalone.cjs');
const pilot=fs.readFileSync(path.resolve(__dirname,'../../overlay/runtime/pilot.js'),'utf8');
const permanent=fs.readFileSync(path.resolve(__dirname,'../../overlay/runtime/permanent.js'),'utf8');
function install(source,failWrite) {
 const rules=[],opened=[],closed=[],writes=[];
 const fakeFs={
  readFileSync(p){assert(p.endsWith('/manifest.json'));return '{"files":{}}';},
  readdirSync(p){assert(p.endsWith('/units'));return [];},
  openSync(p,mode){assert.equal(p,'/sys/fs/smackfs/load2');assert.equal(mode,'w');const fd=opened.length+10;opened.push(fd);return fd;},
  writeSync(fd,text){assert(opened.includes(fd));if(failWrite)throw Error('policy write denied');rules.push(text.trim());},
  closeSync(fd){closed.push(fd);},
  writeFileSync(p){writes.push(p);}
 };
 const sandbox={module:{exports:{}},__dirname:'/fixture/standalone',require(n){
  if(n==='fs')return fakeFs;
  if(n==='child_process')return {execFileSync(){}};
  if(n==='crypto'||n==='path')return require(n);
  if(n==='./usb-recovery.js')return {};
  throw Error('Unexpected dependency: '+n);
 }};
 vm.runInNewContext(source,sandbox,{filename:'pilot.js'});
 if(failWrite){assert.throws(()=>sandbox.module.exports.config().install(),/policy write denied/);assert.deepEqual(closed,opened);assert.equal(writes.length,0);return;}
 sandbox.module.exports.config().install();assert.deepEqual(closed,opened);
 const parentRules=rules.filter(r=>/^User::VetroStandalone User::(?:Home|App::Shared) /.test(r));
 assert.deepEqual(parentRules,['User::VetroStandalone User::Home rx','User::VetroStandalone User::App::Shared rx']);
 assert.equal(rules.length,4,'retain the existing root-agent rules without broad grants');
 assert(rules.includes('User::VetroStandalone System::Privileged rw'));
 assert(rules.includes('System::Privileged User::VetroStandalone rw'));
}
for(const source of [pilot,adapter.freshRecovery(pilot,permanent).pilot]){install(source,false);install(source,true);}
console.log('PASS standalone shard access: Node parent metadata permitted, no parent writes, policy installed on boot, failed writes close cleanly');
