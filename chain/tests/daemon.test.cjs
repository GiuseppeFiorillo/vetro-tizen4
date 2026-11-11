'use strict';
// Node 4.4-compatible test for the root-side daemon against a mock Vetro
// server. The daemon is started the same way it is started on the TV:
//   node -e 'require("/path/to/root-daemon.js")'
require('../../app/service/compat.js').install();

var fs = require('fs');
var os = require('os');
var net = require('net');
var path = require('path');
var crypto = require('crypto');
var assert = require('assert');
var spawn = require('child_process').spawn;

var dir = path.join(os.tmpdir(), 'vetro-chain-daemon-' + Date.now() + '-' + Math.floor(Math.random() * 1e6));
fs.mkdirSync(dir);
var requestFile = path.join(dir, 'vetro-root-request.json');
var lockFile = path.join(dir, 'daemon.lock');
var pidFile = path.join(dir, 'daemon.pid');
var logFile = path.join(dir, 'daemon.log');
var secret = crypto.randomBytes(32);
var daemonPath = path.join(__dirname, '..', 'daemon', 'root-daemon.js');

function rmTree(p) {
    if (!fs.existsSync(p)) return;
    fs.readdirSync(p).forEach(function (name) {
        var child = path.join(p, name);
        if (fs.lstatSync(child).isDirectory()) rmTree(child);
        else fs.unlinkSync(child);
    });
    fs.rmdirSync(p);
}

function b64(text) { return new Buffer(text, 'utf8').toString('base64'); }
function fromB64(text) { return new Buffer(text, 'base64').toString('utf8'); }

function expectedMac(nonce, payload) {
    return crypto.createHmac('sha256', secret).update(nonce).update('\x00').update(payload, 'utf8').digest('hex');
}

function sendFrame(socket, nonce, payload) {
    socket.write(payload + '\t' + expectedMac(nonce, payload) + '\n');
}

var sequence = [
    { command: 'printf hello', timeout: 5000, stdout: 'hello', timedOut: 0, code: 0 },
    { command: 'sleep 5', timeout: 800, stdout: null, timedOut: 1, code: null }
];

var daemon = null;
var server = null;
var nonce = null;
var nextSeq = 0;
var seenAuth = null;
var current = null;

function finish(error) {
    clearTimeout(watchdog);
    if (current) { try { current.destroy(); } catch (e) { } current = null; }
    if (server) { try { server.close(); } catch (e) { } server = null; }
    if (daemon) { try { daemon.kill('SIGTERM'); } catch (e) { } daemon = null; }
    if (error) {
        console.error('FAIL daemon: ' + (error && error.stack || error));
        try { console.error(fs.readFileSync(logFile, 'utf8')); } catch (e) { }
        try { rmTree(dir); } catch (e) { }
        process.exit(1);
    }
    try { rmTree(dir); } catch (e) { }
    console.log('PASS root daemon on ' + process.version + ' (' + sequence.length + ' commands)');
    process.exit(0);
}

function nextCommand() {
    if (!current || current.destroyed) return;
    if (nextSeq >= sequence.length) {
        // Let the last RESULT reach the socket buffer, then close.
        setTimeout(function () { finish(null); }, 100);
        return;
    }
    var item = sequence[nextSeq++];
    sendFrame(current, nonce, 'EXEC\t' + nextSeq + '\t' + item.timeout + '\t' + b64(item.command));
}

server = net.createServer(function (socket) {
    current = socket;
    var buffer = '';
    nonce = crypto.randomBytes(32);
    socket.write('SAMSUNG-TV-ROOT/1\t' + nonce.toString('hex') + '\n');
    socket.on('data', function (chunk) {
        buffer += chunk.toString('utf8');
        var index;
        while ((index = buffer.indexOf('\n')) !== -1) {
            var line = buffer.slice(0, index);
            buffer = buffer.slice(index + 1);
            if (!line) continue;
            var separator = line.lastIndexOf('\t');
            var payload = line.slice(0, separator);
            var observed = line.slice(separator + 1);
            assert.equal(observed, expectedMac(nonce, payload), 'agent frame HMAC');
            var fields = payload.split('\t');
            if (fields[0] === 'AUTH') {
                assert.equal(fields.length, 8, 'AUTH field count');
                seenAuth = {
                    pid: Number(fields[1]), uid: Number(fields[2]), euid: Number(fields[3]),
                    gid: Number(fields[4]), egid: Number(fields[5]), cap: fields[6],
                    smack: fromB64(fields[7])
                };
                nextCommand();
                continue;
            }
            if (fields[0] !== 'RESULT') throw new Error('unexpected frame: ' + fields[0]);
            var item = sequence[Number(fields[1]) - 1];
            assert.ok(item, 'result sequence');
            assert.equal(Number(fields[2]) === item.code, item.code !== null, 'exit code ' + fields[2]);
            assert.equal(Number(fields[3]), item.timedOut, 'timed_out for ' + item.command);
            if (item.stdout !== null) assert.equal(fromB64(fields[4]), item.stdout, 'stdout for ' + item.command);
            nextCommand();
        }
    });
    socket.on('error', function () { });
});

var watchdog = setTimeout(function () { finish(new Error('daemon test timed out')); }, 20000);

server.listen(0, '127.0.0.1', function () {
    var port = server.address().port;
    fs.writeFileSync(requestFile, JSON.stringify({ version: 1, port: port, secret: secret.toString('base64'), pid: process.pid, at: new Date().toISOString() }) + '\n');
    daemon = spawn(process.execPath, ['-e', 'require(' + JSON.stringify(daemonPath) + ')'], {
        env: {
            PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
            HOME: process.env.HOME || '/tmp',
            VETRO_ROOT_REQUEST: requestFile,
            VETRO_ROOT_LOCK: lockFile,
            VETRO_ROOT_PID: pidFile,
            VETRO_ROOT_LOG: logFile,
            VETRO_ROOT_DAEMON_ALLOW_NONROOT: '1'
        },
        stdio: ['ignore', 'ignore', 'ignore']
    });
    daemon.on('exit', function (code, signal) {
        if (code !== 0 && code !== null) finish(new Error('daemon exited early: ' + code + ' ' + signal));
    });
});

process.on('exit', function () { clearTimeout(watchdog); });
