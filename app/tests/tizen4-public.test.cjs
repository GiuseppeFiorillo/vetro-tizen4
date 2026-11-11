'use strict';
const assert = require('assert').strict;
const build = require('../build.cjs');
const {spawnSync} = require('child_process');
const path = require('path');
process.env.VETRO_PROFILE = 'tizen4-public';
try {
    const files = build.collectFiles();
    const names = files.map(f => decodeURIComponent(f.uri));
    assert.ok(!names.some(n => /^(native|payload)\//.test(n)), 'no native or root payload');
    assert.ok(!names.includes('service/sdb.js'), 'no developer transport');
    const text = name => files.find(f => decodeURIComponent(f.uri) === name).data.toString();
    assert.match(text('service/platform.js'), /app-only/);
    assert.match(text('config.xml'), /required_version="4.0"/);
    assert.match(text('config.xml'), /package="vetrotvapp"/);
    assert.match(text('service/build-info.js'), /tizen4-public/);
    assert.match(text('index.html'), /getAppsInfo/);
    process.env.VETRO_PORT = '9123';
    assert.match(build.collectFiles().find(f => f.uri === 'config.xml').data.toString(), /127.0.0.1:9123/);
    process.env.VETRO_PROFILE = 'typo';
    assert.throws(() => build.collectFiles(), /Unknown VETRO_PROFILE/);
} finally { delete process.env.VETRO_PROFILE; delete process.env.VETRO_PORT; }
const fixture = path.join(__dirname, 'fixtures/node4-runtime.js');
for (const binary of [process.execPath, process.env.NODE4_BINARY].filter(Boolean)) {
    const result = spawnSync(binary, [fixture], {encoding: 'utf8', timeout: 10000});
    assert.equal(result.status, 0, result.stdout + result.stderr);
    process.stdout.write(result.stdout);
}
console.log('PASS public Tizen 4 profile, preserved identity, public probe, no privileged payload');
