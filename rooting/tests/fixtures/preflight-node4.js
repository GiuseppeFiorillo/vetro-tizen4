'use strict';
// No SDB: exercise only parsing and mocked file checks under the real old V8.
var assert = require('assert');
var preflight = require('../../service/root-preflight.js');
var checked = [];
var files = {realpathSync: function () {return '/usr/share/dotnet.tizen/3.1.9';},
    accessSync: function (name, mode) {assert.equal(mode, 4); checked.push(name);}};
assert.equal(preflight.detectRuntime({ok:false, code:255, output:'Unknown option --list-runtimes'}, files), '3.1');
assert.equal(checked.length, 2);
files.realpathSync = function () {return '/usr/share/dotnet.tizen/2.0.0';};
assert.throws(function () {
    preflight.detectRuntime({ok:false, code:255, output:'Unknown option --list-runtimes'}, files);
}, function (e) {return e.code === 'runtime-unsupported';});
console.log('PASS preflight parser on ' + process.version + ': R_OK=4, legacy runtime still rejected');
