'use strict';
// Run with the target Node 4.4.3 binary; no TV connection or filesystem mutation.
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var root = path.resolve(__dirname, '..');
require(path.join(root, 'app/tests/fixtures/node4-runtime.js'));
var names = fs.readdirSync(path.join(root, 'app/service')).filter(function (name) {
    return /\.js$/.test(name);
}).sort();
names.forEach(function (name) {
    new vm.Script(fs.readFileSync(path.join(root, 'app/service', name), 'utf8'), { filename: name });
});
console.log('Parsed ' + names.length + ' service files with Node ' + process.version);
