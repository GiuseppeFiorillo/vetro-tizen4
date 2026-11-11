'use strict';
var assert = require('assert');
require('../../service/compat.js').install();
var collect = require('../../service/runtime-evidence.js').collect;
var closed = 0, opened = 0;
var files = {
    realpathSync: function (p) {assert.equal(p, '/usr/share/dotnet.tizen/netcoreapp'); return '/usr/share/dotnet.tizen/2.0.0';},
    openSync: function (p, mode) {assert.equal(p, '/usr/bin/dotnet'); assert.equal(mode, 'r'); opened++; return 7;},
    readSync: function (fd, b, offset, length, position) {assert.equal(length, 64); assert.equal(position, 0); b.write('\x7fELF', 0, 'ascii'); b[4]=1; b[5]=1; b.writeUInt16LE(40,18); return 64;},
    closeSync: function (fd) {assert.equal(fd,7); closed++;},
    accessSync: function (p, mode) {assert.equal(mode,4); assert.ok(/\/(libcoreclr.so|System.Private.CoreLib.dll)$/.test(p));}
};
var data = collect(files);
assert.equal(data.activeCLR.versionHint, '2.0.0');
assert.equal(data.dotnet.machine, 'arm');
assert.equal(data.dotnet.bits, 32);
assert.equal(data.activeCLR.corelibReadable, true);
assert.equal(data.rootRoute.evaluated, false);
assert.equal(opened, closed);
files.readSync = function () {throw new Error('denied');};
files.accessSync = function () {throw new Error('denied');};
files.realpathSync = function () {return '/private/unexpected-name';};
data = collect(files);
assert.equal(data.dotnet.readable, false);
assert.equal(data.activeCLR.versionHint, null);
assert.equal(data.activeCLR.corelibReadable, false);
assert.equal(opened, closed, 'descriptor closes even on read error');
files.readSync = function (fd,b) {b[4]=1;return 20;};
assert.equal(collect(files).dotnet.format, null, 'non-ELF must remain unknown');
files.readSync = function (fd,b) {b.write('\x7fELF',0,'ascii');b[4]=2;b[5]=2;b.writeUInt16BE(183,18);return 64;};
assert.equal(collect(files).dotnet.machine, 'aarch64');
console.log('PASS bounded read-only runtime evidence on ' + process.version);
