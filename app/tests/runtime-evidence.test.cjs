'use strict';
const assert = require('assert').strict, path = require('path');
for (const binary of [process.execPath, process.env.NODE4_BINARY].filter(Boolean)) {
    const result = require('child_process').spawnSync(binary, [path.join(__dirname,'fixtures/runtime-evidence.js')], {encoding:'utf8',timeout:10000});
    assert.equal(result.status, 0, result.stdout + result.stderr);
    process.stdout.write(result.stdout);
}
const main = require('fs').readFileSync(path.join(__dirname,'../service/main.js'),'utf8');
assert.ok(main.includes("if (url === '/runtime-evidence') return serveJson"));
