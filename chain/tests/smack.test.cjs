'use strict';
// Node 4.4-compatible test for the Smack command wrapper inside the root
// daemon. It cannot use the real /proc label on macOS, so it points the
// daemon at a regular file. Everything else is the production path: the
// command is base64-encoded, decoded by /usr/bin/base64 and run by /bin/sh.
require('../../app/service/compat.js').install();

var fs = require('fs');
var os = require('os');
var net = require('net');
var path = require('path');
var crypto = require('crypto');
var assert = require('assert');
var spawn = require('child_process').spawn;

var dir = path.join(os.tmpdir(), 'vetro-chain-smack-' + Date.now() + '-' + Math.floor(Math.random() * 1e6));
fs.mkdirSync(dir);
var requestFile = path.join(dir, 'vetro-root-request.json');
var lockFile = path.join(dir, 'daemon.lock');
var pidFile = path.join(dir, 'daemon.pid');
var logFile = path.join(dir, 'daemon.log');
var labelFile = path.join(dir, 'smack-current');
var rulesFile = path.join(dir, 'smack-load');
var secret = crypto.randomBytes(32);
var daemonPath = path.join(__dirname, '..', 'daemon', 'root-daemon.js');
var label = 'System::Privileged';

fs.writeFileSync(labelFile, '_');
fs.writeFileSync(rulesFile, '');

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

// Commands with spaces, quotes and a non-zero exit code must survive the
// wrapper byte-for-byte and report the inner exit status.
var sequence = [
    { command: 'printf hello', timeout: 5000, stdout: 'hello', code: 0 },
    { command: 'printf "%s" "a b"', timeout: 5000, stdout: 'a b', code: 0 },
    { command: 'exit 3', timeout: 5000, stdout: '', code: 3 }
];

var daemon = null;
var server = null;
var nonce = null;
var nextSeq = 0;

function finish(error) {
    clearTimeout(watchdog);
    if (current) { try { current.destroy(); } catch (e) { } current = null; }
    if (server) { try { server.close(); } catch (e) { } server = null; }
    if (daemon) { try { daemon.kill('SIGTERM'); } catch (e) { } daemon = null; }
    if (!error) {
        try {
            assert.equal(fs.readFileSync(labelFile, 'utf8'), label, 'command label applied');
            var log = fs.readFileSync(logFile, 'utf8');
            assert.ok(log.indexOf('commandLabel=' + label) >= 0, 'startup log names the label');
        } catch (e) { error = e; }
    }
    if (error) {
        console.error('FAIL smack wrapper: ' + (error && error.stack || error));
        try { console.error(fs.readFileSync(logFile, 'utf8')); } catch (e) { }
        try { rmTree(dir); } catch (e) { }
        process.exit(1);
    }
    try { rmTree(dir); } catch (e) { }
    console.log('PASS smack command wrapper on ' + process.version + ' (' + sequence.length + ' commands)');
    process.exit(0);
}

function nextCommand() {
    if (!current || current.destroyed) return;
    if (nextSeq >= sequence.length) {
        setTimeout(function () { finish(null); }, 100);
        return;
    }
    var item = sequence[nextSeq++];
    sendFrame(current, nonce, 'EXEC\t' + nextSeq + '\t' + item.timeout + '\t' + b64(item.command));
}

var current = null;
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
                nextCommand();
                continue;
            }
            if (fields[0] !== 'RESULT') throw new Error('unexpected frame: ' + fields[0]);
            var item = sequence[Number(fields[1]) - 1];
            assert.ok(item, 'result sequence');
            assert.equal(Number(fields[2]), item.code, 'exit code for ' + item.command);
            assert.equal(fromB64(fields[4]), item.stdout, 'stdout for ' + item.command);
            nextCommand();
        }
    });
    socket.on('error', function () { });
});

var watchdog = setTimeout(function () { finish(new Error('smack test timed out')); }, 20000);

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
            VETRO_ROOT_DAEMON_ALLOW_NONROOT: '1',
            VETRO_SMACK_LABEL_FILE: labelFile,
            VETRO_SMACK_LOAD_FILE: rulesFile,
            VETRO_BASE64_BIN: '/usr/bin/base64',
            VETRO_SHELL_BIN: '/bin/sh'
        },
        stdio: ['ignore', 'ignore', 'ignore']
    });
    daemon.on('exit', function (code, signal) {
        if (code !== 0 && code !== null) finish(new Error('daemon exited early: ' + code + ' ' + signal));
    });
});

process.on('exit', function () { clearTimeout(watchdog); });
