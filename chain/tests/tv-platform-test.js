'use strict';
// TV-side self-test for the chain adapter. It is not part of the WGT: it is
// copied to /tmp together with the four service files and run with:
//
//   node -e 'require("/tmp/vetro-chain/tv-platform-test.js")'
//
// Optional: VETRO_DROP_UID=5001 makes it start as owner after dropping root,
// reproducing Vetro's real identity while the daemon stays uid 0.
var fs = require('fs');
var path = require('path');

var BASE = process.env.VETRO_CHAIN_DIR || '/tmp/vetro-chain';
var REQUEST = '/tmp/vetro-root-request.json';
process.env.VETRO_ROOT_REQUEST = REQUEST;
process.env.VETRO_ROOT_SHARE = '/tmp';

var resultFile = path.join('/tmp', 'vetro-chain-tv-result-' + (process.env.VETRO_DROP_UID || 'root') + '.json');
var report = {
    at: new Date().toISOString(),
    node: process.version,
    startedUid: typeof process.getuid === 'function' ? process.getuid() : null,
    droppedTo: null,
    connected: false,
    steps: [],
    status: null,
    error: null
};

function writeReport() {
    try { fs.writeFileSync(resultFile, JSON.stringify(report, null, 2) + '\n'); } catch (e) { }
}

function dropPrivileges() {
    var uid = Number(process.env.VETRO_DROP_UID);
    if (!uid || (typeof process.getuid === 'function' && process.getuid() === uid)) return;
    if (typeof process.setgid === 'function') process.setgid(100);
    if (typeof process.setuid === 'function') process.setuid(uid);
    report.droppedTo = typeof process.getuid === 'function' ? process.getuid() : null;
}

function waitFor(check, timeoutMs, callback) {
    var started = Date.now();
    (function poll() {
        var value = false;
        try { value = check(); } catch (e) { value = false; }
        if (value) return callback(null, value);
        if (Date.now() - started > timeoutMs) return callback(new Error('timeout'));
        setTimeout(poll, 200);
    })();
}

function runCommands(platform, commands, index, done) {
    if (index >= commands.length) return done();
    platform.execute(commands[index], 15000).then(function (result) {
        report.steps.push({ command: commands[index], result: result });
        writeReport();
        runCommands(platform, commands, index + 1, done);
    }).catch(function (error) {
        report.steps.push({ command: commands[index], error: String(error && error.message || error) });
        writeReport();
        runCommands(platform, commands, index + 1, done);
    });
}

dropPrivileges();
require(path.join(BASE, 'compat.js')).install();
var platform = require(path.join(BASE, 'platform.js'));

report.status = platform.status();
writeReport();
platform.start();

waitFor(function () { return platform.status().agent.connected === true; }, 20000, function (error) {
    report.status = platform.status();
    if (error) {
        report.error = 'root agent did not connect: ' + error.message;
        writeReport();
        platform.stop();
        console.error('TV-CHAIN-FAIL ' + report.error);
        process.exit(1);
    }
    report.connected = true;
    writeReport();
    var commands = [
        'id',
        'cat /proc/self/attr/current',
        'grep "^CapEff" /proc/self/status',
        'printf TV-ROOT-OK',
        'pkgcmd -l -t wgt 2>&1 | head -1',
        'vconftool get db/menu/smart_hub/ontvsetting/auto_start 2>&1'
    ];
    runCommands(platform, commands, 0, function () {
        report.status = platform.status();
        writeReport();
        platform.stop();
        console.log('TV-CHAIN-OK ' + resultFile);
        process.exit(0);
    });
});
