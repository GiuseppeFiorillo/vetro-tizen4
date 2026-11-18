'use strict';
// Kernel mount metadata identifies USB storage. No program is loaded from USB.
var fs=require('fs'),path=require('path');
var NAME='VETRO-STANDALONE-ROLLBACK',HEADER='VETRO-STANDALONE-RECOVERY/1';
function decode(s){return s.replace(/\\([0-7]{3})/g,function(_,n){return String.fromCharCode(parseInt(n,8));});}
function mounts(text){
 var out=[];
 String(text||'').split('\n').forEach(function(line){
  var halves=line.split(' - ');if(halves.length!==2)return;
  var before=halves[0].split(' '),after=halves[1].split(' ');
  if(before.length<6||after.length<3)return;
  var device=decode(after[1]),point=decode(before[4]),type=after[0];
  if(!/^\/dev\/sd[a-z]+[0-9]*$/.test(device)||point.charAt(0)!=='/'||! /^(vfat|msdos|fat|exfat|ntfs|fuseblk|fuse\.ntfs.*)$/.test(type))return;
  out.push({device:device,mountPoint:point,fileSystem:type});
 });return out;
}
function validMarker(p){
 try{var s=fs.lstatSync(p);return s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<128&&fs.readFileSync(p,'ascii').trim()===HEADER;}catch(e){return false;}
}
function find(c){
 var list=[];
 try{list=mounts(fs.readFileSync(c.mountInfo||'/proc/self/mountinfo','utf8'));}catch(e){}
 // Explicit roots support fixture tests; real recovery uses mounted block devices.
 if(c.testUsbRoots)(c.testUsbRoots||[]).forEach(function(root){try{fs.readdirSync(root).forEach(function(n){var p=path.join(root,n);if(fs.lstatSync(p).isDirectory())list.push({device:'fixture',mountPoint:p,fileSystem:'fixture'});});}catch(e){}});
 for(var i=0;i<list.length;i++)if(validMarker(path.join(list[i].mountPoint,NAME)))return list[i];
 return null;
}
module.exports={find:find,mounts:mounts,validMarker:validMarker,markerName:NAME,markerHeader:HEADER};
