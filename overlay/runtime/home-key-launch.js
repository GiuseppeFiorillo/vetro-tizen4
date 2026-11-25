'use strict';
// Runs only in the isolated service's private mount namespace.
var fs=require('fs'),cp=require('child_process'),crypto=require('crypto'),run='/run/vetro-home-key';
fs.writeFileSync('/proc/self/attr/current','_');
var plan=JSON.parse(fs.readFileSync(run+'/plan.json','utf8'));
function hash(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
if(process.getuid()!==0||__dirname!=='/opt/vetro-standalone-trial'||plan.database!=='/opt/dbspace/.app-context.db'||!plan.systemNamespace||fs.readlinkSync('/proc/self/ns/mnt')===plan.systemNamespace)throw Error('Private mount namespace required');
cp.execFileSync('/bin/mount',['--make-rprivate','/'],{timeout:5000});
if(hash(plan.database)!==plan.originalHash||hash(run+'/candidate.db')!==plan.candidateHash)throw Error('Database changed');
cp.execFileSync('/bin/mount',['--bind',run+'/candidate.db',plan.database],{timeout:5000});
if(hash(plan.database)!==plan.candidateHash)throw Error('Private database mismatch');
var env={};Object.keys(process.env).forEach(function(k){env[k]=process.env[k];});Object.keys(plan.environment).forEach(function(k){env[k]=plan.environment[k];});
var child=cp.spawn('/bin/sh',['-c',"printf '%s' 'System::Privileged' > /proc/self/attr/current; exec /usr/bin/tvctx-manager /etc/tvctx-manager/appctx-config.json /etc/tvctx-manager/launcher"],{stdio:'inherit',env:env});
fs.writeFileSync(run+'/namespace.json',JSON.stringify({wrapperPid:process.pid,managerPid:child.pid,namespace:fs.readlinkSync('/proc/self/ns/mnt'),at:Date.now()})+'\n',{mode:384});
child.on('error',function(e){console.error(e.message);process.exit(1);});
child.on('exit',function(code){process.exit(code===null?1:code);});
