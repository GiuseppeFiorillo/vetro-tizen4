'use strict';
// Offline integration test of the actual packaged recovery service command.
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),assert=require('assert'),cp=require('child_process'),os=require('os');
const payload=path.resolve(process.argv[2]||''),base=path.join(payload,'standalone');
assert(fs.existsSync(path.join(base,'pilot.js')),'Pass a built current/ payload directory');
const units={};const fakeFs=Object.create(fs);
fakeFs.writeFileSync=(p,b)=>{assert(p.startsWith('/run/systemd/system/'),'Unexpected system write');units[path.basename(p)]=String(b);};
fakeFs.openSync=p=>{assert.equal(p,'/sys/fs/smackfs/load2');return 9999;};
fakeFs.writeSync=fd=>{assert.equal(fd,9999);return 1;};fakeFs.closeSync=fd=>assert.equal(fd,9999);
const fakeCp={execFileSync(p,a){assert(['/usr/bin/systemctl','/usr/bin/chsmack'].includes(p));return '';}};
const context={__dirname:base,Buffer,process,console,module:{exports:{}},setTimeout,clearTimeout,setInterval,clearInterval,
 require(n){if(n==='fs')return fakeFs;if(n==='child_process')return fakeCp;if(n==='./usb-recovery.js')return require(path.join(base,n));return require(n);}};
vm.runInNewContext(fs.readFileSync(path.join(base,'pilot.js'),'utf8'),context,{filename:'packaged-pilot.js'});
const config=context.module.exports.config();assert(config.keepMaintenance,'Recovery must retain paired maintenance');config.install();
const unit=units['vetro-standalone-recovery-home.service'];assert(unit);assert(!/^Conflicts=/m.test(unit),'Recovery must not stop paired maintenance');
const match=unit.match(/^ExecStart=\/bin\/sh -c "([^"]+)"$/m);assert(match,'Expected bounded native two-step launch');
const hash=crypto.createHash('sha256').update(unit).digest('hex');
if(process.argv.includes('--unit-only')){console.log(JSON.stringify({unit,sha256:hash}));process.exit(0);}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'vetro-recovery-native-')),stub=path.join(temp,'aul_test');
fs.writeFileSync(stub,`#!/bin/sh
set -eu
[ "$*" = 'launch_async_for_uid com.samsung.tv.csfs 5001' ]
[ "\u0024{FAIL_FIRST:-0}" != 1 ] || exit 9
n=0; [ ! -f "$TEST_STATE/count" ] || n=$(cat "$TEST_STATE/count")
n=$((n+1)); echo "$n" > "$TEST_STATE/count"
[ "$n" -lt 2 ] || : > "$TEST_STATE/visible"
`,{mode:0o755});
const command=match[1].replaceAll('/usr/bin/aul_test',"'"+stub.replaceAll("'","'\\''")+"'");
function run(extra={}){return cp.spawnSync('/bin/sh',['-c',command],{env:{...process.env,TEST_STATE:temp,...extra},encoding:'utf8',timeout:10000});}
assert.equal(run().status,0);assert(fs.existsSync(path.join(temp,'visible')),'Cold Home must be shown by the second activation');assert.equal(fs.readFileSync(path.join(temp,'count'),'utf8').trim(),'2');
assert.equal(run().status,0);assert(fs.existsSync(path.join(temp,'visible')),'Warm Home must remain visible');assert.equal(fs.readFileSync(path.join(temp,'count'),'utf8').trim(),'4');
assert.equal(run({FAIL_FIRST:'1'}).status,9,'A refused native launch must fail the service');assert.equal(fs.readFileSync(path.join(temp,'count'),'utf8').trim(),'4');
console.log(JSON.stringify({passed:true,coldHomeShown:true,warmHomeRemainsVisible:true,launchFailurePropagated:true,pairedMaintenancePreserved:true,unitSha256:hash}));
