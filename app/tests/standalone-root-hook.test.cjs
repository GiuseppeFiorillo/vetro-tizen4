'use strict';
// Runs only the hook installer against scratch paths. The generated boot body
// is never executed, and no real firmware or system path can be written.
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert').strict;
const {Wins}=require('../service/quick-wins.js');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vetro-standalone-root-')),managed=path.join(dir,'root'),hook=path.join(dir,'parseinfo.sh');fs.mkdirSync(managed);
 fs.writeFileSync(path.join(managed,'config.json'),'{}');fs.writeFileSync(path.join(managed,'hook.awk'),'# existing standalone root');
 const execute=async cmd=>{
  const script=Buffer.from(/^echo (\S+) \| base64 -d \| sh$/.exec(cmd)[1],'base64').toString().split('/opt/etc/parseinfo.sh').join(hook).split('/opt/vetro-root').join(managed);
  const r=cp.spawnSync('/bin/sh',['-c',script],{encoding:'utf8'});return {exit_code:r.status,stdout:r.stdout,stderr:r.stderr};
 };
 const wins=new Wins(execute,{file:path.join(dir,'wins.json')});wins.save({quickboot:true});
 // A synthetic tiny vendor-style script exercises the takeover heuristic without
 // distributing Samsung bytes or depending on an old installed-release copy.
 const prefix='#!/bin/bash\n# synthetic fixture: /proc/target_version\n# ',vendor=Buffer.from(prefix+'x'.repeat(804-prefix.length)+'\n');
 assert.equal(vendor.length,805);
 const fixtures=[['vendor-style',vendor],['hook.awk',fs.readFileSync(path.resolve(__dirname,'../../overlay/root/hook.awk'))]];
 for(const [name,bytes] of fixtures){
  fs.writeFileSync(hook,bytes);
  assert.equal(await wins.ensureHook(),false,'the new early hook cannot take over '+name);
  assert.deepEqual(fs.readFileSync(hook),bytes,'standalone startup bytes survive '+name);
  assert.equal(fs.existsSync(hook+'.vetro-orig'),false,'no competing boot backup is created');
 }
 // Positive control: this fixture really is eligible without standalone ownership.
 fs.unlinkSync(path.join(managed,'config.json'));fs.unlinkSync(path.join(managed,'hook.awk'));fs.writeFileSync(hook,vendor);
 assert.equal(await wins.ensureHook(),true,'unmanaged eligible fixture can install the early hook');
 assert.deepEqual(fs.readFileSync(hook+'.vetro-orig'),vendor);
 console.log('PASS standalone root hook: 0.7 quick boot/update hook preserves active and temporarily restored vendor startup');
})().catch(e=>{console.error(e);process.exitCode=1});
