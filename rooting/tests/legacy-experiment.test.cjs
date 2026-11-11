'use strict';
const assert = require('assert').strict, fs = require('fs'), path = require('path');
const {legacySource} = require('../build-legacy-experiment.cjs');
const source = name => fs.readFileSync(path.join(__dirname, '../tools/samsung-tv-root-master/payloads/common', name + '.cs'), 'utf8');
const archive = legacySource('SamsungTvArchiveRoot', source('SamsungTvArchiveRoot'));
assert.ok(!archive.includes('ArgumentList.Add'));
assert.ok(archive.includes('!ValidPackage(arguments[0])'));
assert.ok(archive.includes('start.Arguments = "--package_name "'));
assert.equal(legacySource('SamsungTvRootAgent', source('SamsungTvRootAgent')), source('SamsungTvRootAgent'));
assert.throws(() => legacySource('SamsungTvArchiveRoot', 'changed'), /source changed/);
assert.throws(() => legacySource('SamsungTvArchiveRoot', source('SamsungTvArchiveRoot').replace('!ValidPackage(arguments[0])','true')), /validation missing/);
const files = require('../build.cjs').collectIntegration();
assert.ok(!files.some(f => /legacy|net2/.test(decodeURIComponent(f.uri))));
console.log('PASS offline legacy experiment: bounded argument conversion, fail closed on source drift, never packaged');
const fixture = path.join(__dirname, 'fixtures/preflight-node4.js');
for (const binary of [process.execPath, process.env.NODE4_BINARY].filter(Boolean)) {
    const result = require('child_process').spawnSync(binary, [fixture], {encoding:'utf8',timeout:10000});
    assert.equal(result.status, 0, result.stdout + result.stderr);
    process.stdout.write(result.stdout);
}
