'use strict';
// Host Node 4 fixtures only. All mutations stay under /tmp.
var fs=require('fs'),crypto=require('crypto'),assert=require('assert');
var create=require('./runtime/startup.js').create;
var root='/tmp/vetro-startup-tests-'+process.pid+'-'+Date.now(),count=0;
fs.mkdirSync(root,448);
function hash(b){return crypto.createHash('sha256').update(b).digest('hex');}
function fixture(){
 var p=root+'/'+count;fs.mkdirSync(p,448);
 var vendor=new Buffer('#!/bin/sh\necho vendor\n'),template=new Buffer('#!/usr/bin/gawk -f\nBEGIN {exit 0}\n');
 var c={build:'TEST-BUILD',osRelease:p+'/os',hook:p+'/parseinfo.sh',hookDir:p,vendor:p+'/vendor',vendorHash:hash(vendor),template:p+'/hook',hookHash:hash(template),daemon:p+'/daemon',hashes:{},disable:p+'/disable',disableDir:p,log:p+'/log',status:p+'/status',label:null,pid:p+'/pid',lock:p+'/lock',healthMs:0,enforceRoot:false,chsmack:null};
 fs.writeFileSync(c.osRelease,'BUILD_ID=TEST-BUILD\n');fs.writeFileSync(c.vendor,vendor);fs.writeFileSync(c.hook,vendor);fs.writeFileSync(c.template,template);fs.writeFileSync(c.daemon,'// fixture daemon\n');fs.writeFileSync(c.status,'');
 fs.writeFileSync(c.pid,String(process.pid));fs.writeFileSync(c.lock,String(process.pid));c.hashes[c.daemon]=hash(fs.readFileSync(c.daemon));c.hashes[c.template]=c.hookHash;
 return c;
}
function run(name,fn){count++;fn(fixture());console.log('PASS '+name);}
function content(p){return fs.readFileSync(p,'utf8');}
run('health delay leaves vendor startup untouched',function(c){c.healthMs=999999;assert.strictEqual(create(c).check(),false);assert.strictEqual(hash(fs.readFileSync(c.hook)),c.vendorHash);});
run('healthy daemon arms exact template atomically at mode 555',function(c){assert.strictEqual(create(c).check(),true);assert.strictEqual(hash(fs.readFileSync(c.hook)),c.hookHash);assert.strictEqual(fs.statSync(c.hook).mode&511,365);});
run('restore exact vendor bytes and mode',function(c){var s=create(c);s.arm();s.restore();assert.strictEqual(hash(fs.readFileSync(c.hook)),c.vendorHash);assert.strictEqual(fs.statSync(c.hook).mode&511,365);s.restore();});
run('disable marker prevents manual and automatic rearm',function(c){fs.writeFileSync(c.disable,'disabled');assert.strictEqual(create(c).arm(),false);assert.strictEqual(create(c).check(),false);assert.strictEqual(hash(fs.readFileSync(c.hook)),c.vendorHash);});
run('disable marker restores already armed hook',function(c){var s=create(c);s.arm();fs.writeFileSync(c.disable,'disabled');s.check();assert.strictEqual(hash(fs.readFileSync(c.hook)),c.vendorHash);});
run('rollback works even with corrupted daemon',function(c){var s=create(c);s.arm();fs.writeFileSync(c.daemon,'broken');assert.strictEqual(s.rollback(),'VENDOR_HOOK_RESTORED');assert.strictEqual(hash(fs.readFileSync(c.hook)),c.vendorHash);assert.strictEqual(content(c.disable),'disabled\n');});
run('unrecognized vendor file is never overwritten',function(c){fs.writeFileSync(c.hook,'unrelated firmware');assert.throws(function(){create(c).arm();});assert.throws(function(){create(c).rollback();});assert.strictEqual(content(c.hook),'unrelated firmware');});
run('wrong firmware refuses rearm',function(c){fs.writeFileSync(c.osRelease,'BUILD_ID=OTHER\n');assert.throws(function(){create(c).arm();});assert.strictEqual(hash(fs.readFileSync(c.hook)),c.vendorHash);});
run('wrong PID ownership refuses automatic rearm',function(c){fs.writeFileSync(c.pid,'99999999');assert.throws(function(){create(c).check();});assert.strictEqual(hash(fs.readFileSync(c.hook)),c.vendorHash);});
run('wrong lock ownership refuses automatic rearm',function(c){fs.writeFileSync(c.lock,'99999999');assert.throws(function(){create(c).check();});assert.strictEqual(hash(fs.readFileSync(c.hook)),c.vendorHash);});
run('corrupt template refuses rearm',function(c){fs.writeFileSync(c.template,'broken');assert.throws(function(){create(c).arm();});assert.strictEqual(hash(fs.readFileSync(c.hook)),c.vendorHash);});
run('corrupt vendor backup refuses restoration',function(c){var s=create(c);s.arm();fs.writeFileSync(c.vendor,'broken');assert.throws(function(){s.restore();});assert.strictEqual(hash(fs.readFileSync(c.hook)),c.hookHash);});
run('rollback never follows a disable-marker symlink',function(c){var victim=c.hookDir+'/victim';fs.writeFileSync(victim,'untouched');fs.symlinkSync(victim,c.disable);create(c).rollback();assert.strictEqual(content(victim),'untouched');});
run('partial writes preserve complete replacement bytes',function(c){var original=fs.writeSync,calls=0;fs.writeSync=function(fd,b,off,len,pos){if(Buffer.isBuffer(b)){calls++;return original(fd,b,off,Math.min(len,3),pos);}return original.apply(fs,arguments);};try{create(c).arm();}finally{fs.writeSync=original;}assert(calls>1);assert.strictEqual(hash(fs.readFileSync(c.hook)),c.hookHash);});
console.log('ALL '+count+' STARTUP SAFETY CASES PASSED; fixtures='+root);
